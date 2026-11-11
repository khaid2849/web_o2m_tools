import { Component, signal, t, useProps } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useAutofocus } from "@web/core/utils/hooks";

export class O2mPresetNameDialog extends Component {
    static template = "web_o2m_tools.O2mPresetNameDialog";
    static components = { Dialog };
    props = useProps({
        title: t.string(),
        name: t.string().optional(""),
        showDefault: t.boolean().optional(false),
        onConfirm: t.function(),
        close: t.function(),
    });

    inputRef = signal.ref();
    name = signal(this.props.name, { type: t.string() });
    isDefault = signal(false, { type: t.boolean() });
    saving = signal(false);

    setup() {
        useAutofocus({ ref: this.inputRef });
    }

    get canSave() {
        return Boolean(this.name().trim()) && !this.saving();
    }

    onKeydown(ev) {
        if (ev.key === "Enter") {
            ev.preventDefault();
            this.confirm();
        }
    }

    async confirm() {
        if (!this.canSave) {
            return;
        }
        this.saving.set(true);
        try {
            await this.props.onConfirm({ name: this.name().trim(), isDefault: this.isDefault() });
            this.props.close();
        } finally {
            this.saving.set(false);
        }
    }
}
