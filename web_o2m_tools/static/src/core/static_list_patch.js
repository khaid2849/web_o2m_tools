import { StaticList } from "@web/model/relational_model/static_list";
import { x2ManyCommands } from "@web/core/orm_service";
import { patch } from "@web/core/utils/patch";

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
        if (!this._o2mFilter) {
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
        const result = super._applyCommands(...arguments);
        if (this._o2mFilter) {
            const { DELETE, UNLINK } = x2ManyCommands;
            const removed = new Set(
                commands.filter((c) => c[0] === DELETE || c[0] === UNLINK).map((c) => c[1])
            );
            if (removed.size) {
                this._o2mFilter.hiddenIds = this._o2mFilter.hiddenIds.filter(
                    (id) => !removed.has(id)
                );
            }
        }
        return result;
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
});
