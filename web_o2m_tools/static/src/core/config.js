import { session } from "@web/session";

/**
 * Configuration of a one2many table, as enabled by an administrator
 * (web.o2m.config, sent through session_info).
 *
 * @param {string} model parent model
 * @param {string} fieldName one2many field name
 * @returns {{search: boolean, filter: boolean, presets: boolean, search_labels: string[]}|null}
 */
export function getO2mToolsConfig(model, fieldName) {
    const configs = session.web_o2m_tools;
    if (!configs || !model || !fieldName) {
        return null;
    }
    return configs[`${model},${fieldName}`] || null;
}
