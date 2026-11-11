import { proxy, toRaw } from "@odoo/owl";

/**
 * Search/filter state of the tables, attached to the parent Record.
 *
 * It outlives the field component (notebook tab switches, pager) and the
 * StaticList (rebuilt by Odoo after each save), and is dropped with the record
 * when another record is opened.
 */
const statesByRecord = new WeakMap();

export function getFilterState(record, fieldName) {
    const rawRecord = toRaw(record);
    let byField = statesByRecord.get(rawRecord);
    if (!byField) {
        byField = {};
        statesByRecord.set(rawRecord, byField);
    }
    if (!byField[fieldName]) {
        byField[fieldName] = proxy({ search: "", selection: {}, lastIds: null });
    }
    return byField[fieldName];
}

export function isFilterStateActive(state) {
    return (
        Boolean(state.search.trim()) ||
        Object.values(state.selection).some((keys) => keys.length)
    );
}
