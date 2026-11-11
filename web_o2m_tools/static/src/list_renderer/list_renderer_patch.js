import { onWillStart, toRaw } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { getO2mToolsConfig } from "../core/config";
import { O2mPresetMenu } from "./preset_menu";

/** Parent records for which the default preset of a table was already applied. */
const defaultAppliedFor = new WeakMap();

patch(ListRenderer.prototype, {
    setup() {
        super.setup(...arguments);
        const nested = this.props.nestedKeyOptionalFieldsData;
        const config = nested && getO2mToolsConfig(nested.model, nested.field);
        this.o2mPresetTable = config?.presets ? { model: nested.model, field: nested.field } : null;
        if (!this.o2mPresetTable) {
            return;
        }
        const presetsService = useService("web_o2m_tools.presets");
        onWillStart(async () => {
            let presets = [];
            try {
                presets = await presetsService.load(nested.model, nested.field);
            } catch {
                return; // presets are a convenience: never block the form
            }
            this._o2mApplyDefaultPreset(presets);
        });
    },

    get o2mPresetMenuComponent() {
        return O2mPresetMenu;
    },

    get o2mPresetMenuProps() {
        return {
            model: this.o2mPresetTable.model,
            field: this.o2mPresetTable.field,
            getColumns: () => this.o2mGetVisibleOptionalColumns(),
            applyColumns: (columns) => this.o2mApplyColumns(columns),
        };
    },

    get o2mOptionalColumnNames() {
        return this.props.archInfo.columns
            .filter((col) => col.type === "field" && col.optional)
            .map((col) => col.name);
    },

    o2mGetVisibleOptionalColumns() {
        return this.o2mOptionalColumnNames.filter((name) => this.optionalActiveFields[name]);
    },

    o2mApplyColumns(columns) {
        const visible = new Set(columns);
        for (const name of this.o2mOptionalColumnNames) {
            this.optionalActiveFields[name] = visible.has(name);
        }
        this.saveOptionalActiveFields();
        this.render();
    },

    /**
     * Apply the default preset the first time the table is opened for a parent
     * record (not again after a notebook tab switch, so manual changes stay).
     */
    _o2mApplyDefaultPreset(presets) {
        const preset = presets.find((p) => p.is_default);
        const parent = this.props.list._parent && toRaw(this.props.list._parent);
        if (!preset || !parent) {
            return;
        }
        let fields = defaultAppliedFor.get(parent);
        if (!fields) {
            fields = new Set();
            defaultAppliedFor.set(parent, fields);
        }
        if (fields.has(this.o2mPresetTable.field)) {
            return;
        }
        fields.add(this.o2mPresetTable.field);
        const optional = new Set(this.o2mOptionalColumnNames);
        const columns = preset.columns.filter((name) => optional.has(name));
        // Same storage as the native column toggles (read in onWillRender).
        browser.localStorage.setItem(this.keyOptionalFields, columns.join(","));
    },
});
