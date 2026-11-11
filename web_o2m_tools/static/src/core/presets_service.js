import { proxy } from "@odoo/owl";
import { registry } from "@web/core/registry";

const PRESET_MODEL = "web.o2m.column.preset";

/**
 * Column presets of the current user, cached per table ("model,field") for the
 * lifetime of the page and reloaded after each change.
 */
export const o2mPresetsService = {
    dependencies: ["orm"],
    start(env, { orm }) {
        const state = proxy({});
        const loading = {};

        const keyOf = (model, field) => `${model},${field}`;

        function load(model, field, { force = false } = {}) {
            const key = keyOf(model, field);
            if (!force && loading[key]) {
                return loading[key];
            }
            loading[key] = orm
                .call(PRESET_MODEL, "get_presets", [model, field])
                .then((presets) => {
                    state[key] = presets;
                    return presets;
                })
                .catch((error) => {
                    delete loading[key];
                    throw error;
                });
            return loading[key];
        }

        async function create(model, field, { name, columns, isDefault = false }) {
            await orm.create(PRESET_MODEL, [
                {
                    name,
                    res_model: model,
                    field_name: field,
                    column_names: columns.join(","),
                    is_default: isDefault,
                },
            ]);
            return load(model, field, { force: true });
        }

        async function write(model, field, presetId, values) {
            const vals = { ...values };
            if (vals.columns) {
                vals.column_names = vals.columns.join(",");
                delete vals.columns;
            }
            await orm.write(PRESET_MODEL, [presetId], vals);
            return load(model, field, { force: true });
        }

        async function remove(model, field, presetId) {
            await orm.unlink(PRESET_MODEL, [presetId]);
            return load(model, field, { force: true });
        }

        return {
            state,
            keyOf,
            load,
            create,
            write,
            remove,
            get: (model, field) => state[keyOf(model, field)] || [],
        };
    },
};

registry.category("services").add("web_o2m_tools.presets", o2mPresetsService);
