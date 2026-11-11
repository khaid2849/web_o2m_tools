import { X2ManyField } from "@web/views/fields/x2many/x2many_field";
import { patch } from "@web/core/utils/patch";
import { getO2mToolsConfig } from "../core/config";
import { O2mSearchBar } from "./o2m_search_bar";

patch(X2ManyField.prototype, {
    setup() {
        super.setup(...arguments);
        const config =
            this.props.viewMode === "list" &&
            this.field.type === "one2many" &&
            getO2mToolsConfig(this.props.record.resModel, this.props.name);
        this.o2mToolsConfig = config && (config.search || config.filter) ? config : null;
    },

    /** Rendered through t-component so that X2ManyField subclasses need nothing. */
    get o2mSearchBarComponent() {
        return O2mSearchBar;
    },

    get o2mShowSearchBar() {
        return Boolean(this.o2mToolsConfig) && !this.props.record.isNew;
    },

    get o2mShowPager() {
        return this.list.o2mVisibleCount > this.list.limit;
    },

    get pagerProps() {
        const props = super.pagerProps;
        if (this.list.o2mIsFiltered) {
            props.total = this.list.o2mVisibleCount;
        }
        return props;
    },
});
