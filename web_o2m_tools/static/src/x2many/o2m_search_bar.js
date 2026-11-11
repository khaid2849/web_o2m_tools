import { Component, useEffect, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { CheckBox } from "@web/core/checkbox/checkbox";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { useService } from "@web/core/utils/hooks";
import { useDebounced } from "@web/core/utils/timing";
import { getFilterState, isFilterStateActive } from "./filter_state";

/**
 * Search box + filter dropdown shown above a configured one2many list.
 * Matching is done server side on all the lines of the record (not only the
 * loaded page), then applied to the StaticList (see static_list_patch.js).
 */
export class O2mSearchBar extends Component {
    static template = "web_o2m_tools.O2mSearchBar";
    static components = { CheckBox, Dropdown, DropdownItem };
    static props = {
        record: Object,
        name: String,
        config: Object,
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState(getFilterState(this.props.record, this.props.name));
        this.ui = useState({ searchInput: this.state.search, facets: null, facetsError: false });
        this.token = 0;
        this.pendingList = null;
        this.debouncedSearch = useDebounced(() => this.commitSearch(), 400);

        // Re-apply the filter when Odoo rebuilds the list (after save) or drops
        // it (discard), so it survives these operations.
        useEffect(
            () => {
                this.ensureApplied();
            },
            () => [this.list, this.list.o2mIsFiltered, this.props.record.resId]
        );
    }

    get list() {
        return this.props.record.data[this.props.name];
    }

    get isActive() {
        return isFilterStateActive(this.state);
    }

    /** Filtering needs saved lines: lock while the record has pending changes. */
    get locked() {
        return this.props.record.dirty;
    }

    get lockedTooltip() {
        return _t("Save the record to search or filter its lines");
    }

    get placeholder() {
        const labels = this.props.config.search_labels || [];
        return labels.length ? _t("Search: %s", labels.join(", ")) : _t("Search lines…");
    }

    get selectedCount() {
        return Object.values(this.state.selection).reduce((total, keys) => total + keys.length, 0);
    }

    get countLabel() {
        return _t("%(visible)s / %(total)s lines", {
            visible: this.list.o2mVisibleCount,
            total: this.list.count,
        });
    }

    async ensureApplied() {
        const list = this.list;
        if (
            this.isActive &&
            !list.o2mIsFiltered &&
            !this.props.record.isNew &&
            this.pendingList !== list
        ) {
            await this.apply();
        }
    }

    async apply() {
        const record = this.props.record;
        const list = this.list;
        const token = ++this.token;
        this.pendingList = list;
        try {
            if (!this.isActive || record.isNew) {
                this.state.lastIds = null;
                if (list.o2mIsFiltered && (await list.leaveEditMode())) {
                    await list.o2mSetFilter(null);
                }
                return;
            }
            const searchPromise = this.orm.call("web.o2m.config", "o2m_search", [
                record.resModel,
                record.resId,
                this.props.name,
                this.state.search,
                this.state.selection,
            ]);
            if (!list.o2mIsFiltered && this.state.lastIds) {
                // Odoo rebuilt the list (save, discard): show the previous result
                // right away instead of flashing every line until the server answers.
                await list.o2mSetFilter(this.state.lastIds);
            }
            const { ids } = await searchPromise;
            if (token !== this.token || this.list !== list) {
                return; // outdated: a newer request or a new list took over
            }
            if (await list.leaveEditMode()) {
                this.state.lastIds = ids;
                await list.o2mSetFilter(ids);
            }
        } finally {
            if (this.pendingList === list) {
                this.pendingList = null;
            }
        }
    }

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    onSearchInput(ev) {
        this.ui.searchInput = ev.target.value;
        this.debouncedSearch();
    }

    onSearchKeydown(ev) {
        if (ev.key === "Enter") {
            ev.preventDefault();
            ev.stopPropagation();
            this.debouncedSearch.cancel();
            this.commitSearch();
        } else if (ev.key === "Escape" && this.ui.searchInput) {
            ev.stopPropagation();
            this.ui.searchInput = "";
            this.debouncedSearch.cancel();
            this.commitSearch();
        }
    }

    commitSearch() {
        if (this.locked || this.ui.searchInput === this.state.search) {
            return;
        }
        this.state.search = this.ui.searchInput;
        return this.apply();
    }

    async loadFacets() {
        this.ui.facetsError = false;
        const record = this.props.record;
        try {
            this.ui.facets = await this.orm.call("web.o2m.config", "o2m_facets", [
                record.resModel,
                record.resId,
                this.props.name,
            ]);
        } catch (error) {
            this.ui.facets = [];
            this.ui.facetsError = true;
            throw error;
        }
    }

    isSelected(groupId, key) {
        return (this.state.selection[groupId] || []).includes(key);
    }

    toggleOption(groupId, key) {
        if (this.locked) {
            return;
        }
        const keys = this.state.selection[groupId] || [];
        const nextKeys = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
        const selection = { ...this.state.selection };
        if (nextKeys.length) {
            selection[groupId] = nextKeys;
        } else {
            delete selection[groupId];
        }
        this.state.selection = selection;
        return this.apply();
    }

    clear() {
        this.debouncedSearch.cancel();
        this.ui.searchInput = "";
        this.state.search = "";
        this.state.selection = {};
        return this.apply();
    }
}
