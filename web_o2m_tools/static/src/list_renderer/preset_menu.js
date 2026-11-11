import { Component, t, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { useService } from "@web/core/utils/hooks";
import { O2mPresetNameDialog } from "./preset_name_dialog";

/**
 * "Column presets" section of the optional columns (⚙) dropdown of a list.
 */
export class O2mPresetMenu extends Component {
    static template = "web_o2m_tools.O2mPresetMenu";
    static components = { DropdownItem };
    props = useProps({
        model: t.string(),
        field: t.string(),
        /** () => string[]: optional columns currently displayed */
        getColumns: t.function(),
        /** (string[]) => void */
        applyColumns: t.function(),
    });

    setup() {
        this.presetsService = useService("web_o2m_tools.presets");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        this.titles = {
            addFavorite: _t("Add to favorites"),
            removeFavorite: _t("Remove from favorites"),
            update: _t("Update with the current columns"),
            setDefault: _t("Use by default"),
            unsetDefault: _t("Stop using by default"),
            rename: _t("Rename"),
            delete: _t("Delete"),
        };
    }

    get presets() {
        return this.presetsService.get(this.props.model, this.props.field);
    }

    isCurrent(preset) {
        const current = this.props.getColumns();
        return (
            current.length === preset.columns.length &&
            current.every((name) => preset.columns.includes(name))
        );
    }

    apply(preset) {
        this.props.applyColumns(preset.columns);
    }

    saveNew() {
        this.dialog.add(O2mPresetNameDialog, {
            title: _t("Save current columns"),
            showDefault: true,
            onConfirm: async ({ name, isDefault }) => {
                await this.presetsService.create(this.props.model, this.props.field, {
                    name,
                    isDefault,
                    columns: this.props.getColumns(),
                });
                this.notification.add(_t("Column preset “%s” saved", name), { type: "success" });
            },
        });
    }

    update(preset) {
        return this._write(preset, { columns: this.props.getColumns() }).then(() =>
            this.notification.add(_t("Column preset “%s” updated", preset.name), {
                type: "success",
            })
        );
    }

    rename(preset) {
        this.dialog.add(O2mPresetNameDialog, {
            title: _t("Rename column preset"),
            name: preset.name,
            onConfirm: ({ name }) => this._write(preset, { name }),
        });
    }

    toggleFavorite(preset) {
        return this._write(preset, { is_favorite: !preset.is_favorite });
    }

    toggleDefault(preset) {
        return this._write(preset, { is_default: !preset.is_default });
    }

    remove(preset) {
        this.dialog.add(ConfirmationDialog, {
            title: _t("Delete column preset"),
            body: _t("Delete the column preset “%s”?", preset.name),
            confirmLabel: _t("Delete"),
            confirm: () => this.presetsService.remove(this.props.model, this.props.field, preset.id),
            cancel: () => {},
        });
    }

    _write(preset, values) {
        return this.presetsService.write(this.props.model, this.props.field, preset.id, values);
    }
}
