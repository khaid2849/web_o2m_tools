import { toRaw } from "@odoo/owl";
import { x2ManyCommands } from "@web/core/orm_plugin";
import { patch } from "@web/core/utils/patch";
import { StaticList } from "@web/model/relational_model/static_list";

/**
 * Lists for which `currentIds` must temporarily return the displayed ids only
 * (see `_applyCommands`). Kept outside the reactive list to avoid re-renders.
 */
const visibleOnly = new WeakSet();

/**
 * Line filtering on StaticList.
 *
 * While a filter is active, `_currentIds` only holds the displayed ids and the
 * other persisted ids are kept aside in `_o2mFilter.hiddenIds`. Paging, sorting,
 * adding lines and onchanges then work natively on the filtered set, and the
 * commands sent on save are untouched (hidden lines are never deleted).
 *
 * `currentIds` and `count` keep exposing the whole relation, so the parent
 * record's evalContext (modifiers, domains) and required checks do not change
 * when filtering.
 */
patch(StaticList.prototype, {
    get currentIds() {
        const ids = super.currentIds;
        if (!this._o2mFilter || visibleOnly.has(toRaw(this))) {
            return ids;
        }
        return [...ids, ...this._o2mFilter.hiddenIds];
    },

    get count() {
        if (!this._o2mFilter) {
            return this._o2mCount;
        }
        return this._currentIds.length + this._o2mFilter.hiddenIds.length;
    },

    set count(value) {
        // StaticList keeps count === _currentIds.length natively; only the
        // filtered case is derived (see getter).
        this._o2mCount = value;
    },

    /** Number of lines displayed (filtered set, including new unsaved lines). */
    get o2mVisibleCount() {
        return this._currentIds.length;
    },

    get o2mIsFiltered() {
        return Boolean(this._o2mFilter);
    },

    canResequence() {
        // Reordering a filtered subset would produce wrong sequences.
        return !this._o2mFilter && super.canResequence(...arguments);
    },

    /**
     * Apply (ids array) or remove (null) a filter. Unsaved lines (virtual ids)
     * always stay visible.
     *
     * @param {number[]|null} matchedIds
     */
    o2mSetFilter(matchedIds) {
        return this.model.mutex.exec(async () => {
            const allIds = this._o2mAllIds();
            // The user sorted while filtering: keep that order in the next view.
            const resort = Boolean(this._o2mFilter?.sorted && this.orderBy.length);
            if (!matchedIds) {
                this._o2mFilter = null;
                this._o2mCount = allIds.length;
                return this._o2mShow(allIds, resort);
            }
            const matched = new Set(matchedIds);
            const isVisible = (id) => typeof id !== "number" || matched.has(id);
            this._o2mFilter = {
                snapshot: allIds,
                hiddenIds: allIds.filter((id) => !isVisible(id)),
                sorted: resort,
            };
            return this._o2mShow(allIds.filter(isVisible), resort);
        });
    },

    async _o2mShow(ids, resort) {
        await this.model._updateConfig(this.config, { offset: 0 }, { reload: false });
        if (resort) {
            await this._sort(ids, this.orderBy);
        } else {
            await this._load({ offset: 0, nextCurrentIds: ids });
        }
    },

    /**
     * All ids of the relation: the pre-filter order for persisted ids, followed
     * by lines added while filtering.
     */
    _o2mAllIds() {
        if (!this._o2mFilter) {
            return [...this._currentIds];
        }
        const present = new Set([...this._currentIds, ...this._o2mFilter.hiddenIds]);
        const result = this._o2mFilter.snapshot.filter((id) => present.has(id));
        const known = new Set(result);
        for (const id of this._currentIds) {
            if (!known.has(id)) {
                result.push(id);
            }
        }
        return result;
    },

    _applyCommands(commands) {
        if (this._o2mFilter) {
            const { CLEAR, DELETE, LINK, SET, UNLINK } = x2ManyCommands;
            if (commands.some((c) => c[0] === CLEAR || c[0] === SET)) {
                // The whole relation is replaced by the given lines.
                this._o2mFilter.hiddenIds = [];
            } else {
                // Removed lines are gone, (re)linked lines are displayed.
                const changed = new Set(
                    commands
                        .filter((c) => [DELETE, UNLINK, LINK].includes(c[0]))
                        .map((c) => c[1])
                );
                if (changed.size) {
                    this._o2mFilter.hiddenIds = this._o2mFilter.hiddenIds.filter(
                        (id) => !changed.has(id)
                    );
                }
            }
        }
        // Odoo builds the next list from `this.currentIds`, which includes the
        // hidden lines while filtering: expose the displayed ones only. It is
        // read synchronously, before the first await.
        const raw = toRaw(this);
        visibleOnly.add(raw);
        try {
            return super._applyCommands(...arguments);
        } finally {
            visibleOnly.delete(raw);
        }
    },

    _addSavePoint() {
        super._addSavePoint(...arguments);
        this._savePoint._o2mFilter = this._o2mFilter && {
            ...this._o2mFilter,
            hiddenIds: [...this._o2mFilter.hiddenIds],
        };
    },

    _discard() {
        const savedFilter = this._savePoint ? this._savePoint._o2mFilter : null;
        super._discard(...arguments);
        // Without a save point, Odoo restores the whole relation: the filter is
        // dropped here and re-applied by the field component.
        this._o2mFilter = savedFilter || null;
    },

    _sortBy() {
        if (this._o2mFilter) {
            this._o2mFilter.sorted = true;
        }
        return super._sortBy(...arguments);
    },

    _sort(currentIds, orderBy) {
        // Odoo sorts `this.currentIds` by default, which includes the hidden lines.
        if (currentIds === undefined && this._o2mFilter) {
            currentIds = this._currentIds;
        }
        return super._sort(currentIds, orderBy);
    },

    async _resequence() {
        if (this._o2mFilter) {
            // Renumbering the displayed lines only would collide with the hidden
            // ones (e.g. a line inserted inside a section): keep the sequences.
            return;
        }
        return super._resequence(...arguments);
    },

    async delete() {
        await super.delete(...arguments);
        // Odoo reloads the previous page when the last one becomes empty, based on
        // `count`, which includes the hidden lines while filtering.
        if (this._o2mFilter && !this.records.length && this.offset > 0) {
            await this.model.mutex.exec(() =>
                this._load({ offset: Math.max(this.offset - this.limit, 0) })
            );
        }
    },
});
