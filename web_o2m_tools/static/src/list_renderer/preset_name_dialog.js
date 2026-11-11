import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { useAutofocus } from "@web/core/utils/hooks";

export class O2mPresetNameDialog extends Component {
    static template = "web_o2m_tools.O2mPresetNameDialog";
    static components = { Dialog };
    static props = {
        title: String,
        name: { type: String, optional: true },
        showDefault: { type: Boolean, optional: true },
        onConfirm: Function,
        close: Function,
    };

    setup() {
        this.state = useState({ name: this.props.name || "", isDefault: false, saving: false });
        useAutofocus();
    }

    onKeydown(ev) {
        if (ev.key === "Enter") {
            ev.preventDefault();
            this.confirm();
        }
    }

    async confirm() {
        const name = this.state.name.trim();
        if (!name || this.state.saving) {
            return;
        }
        this.state.saving = true;
        try {
            await this.props.onConfirm({ name, isDefault: this.state.isDefault });
            this.props.close();
        } finally {
            this.state.saving = false;
        }
    }
}
