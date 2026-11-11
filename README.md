# One2many Table Tools (Odoo 20)

Search, filter and choose columns in the one2many tables of your forms: sales order lines,
invoice lines, or any other line table. You choose which tables get these tools.

| Module | Version | Description |
|---|---|---|
| [web_o2m_tools](web_o2m_tools) | 20.0.1.0.0 | Search and filter one2many lines, save per-user column presets |

## Features

- **Search** the configured fields over all lines of the record, not only the current page.
- **Filter** with groups built from the data (char, selection, many2one and boolean fields, computed
  ones included), each value with its line count, plus named conditions defined with a domain.
- **Column presets**: save the visible optional columns under a name; apply, update, rename,
  star or delete them. A default preset is applied every time the table opens. Presets are
  stored per user.
- Display only: no data is changed, and access rights and record rules are respected.

## Usage

1. Install `web_o2m_tools` (it depends only on `web`).
2. Go to **Settings → One2many Tables** and create a configuration: choose the model, its
   one2many field, the searched fields, the filter groups and whether column presets are allowed.
3. Open a record of that model. The search box and the Filters button appear above the table.
   The presets are in the optional columns menu (⚙) of the table.

Users need to reload the page after a configuration change.

## Limitations

- Search and filters are locked while the form has unsaved changes, and are hidden on new records.
- Drag and drop reordering and the section actions of sales and invoice lines (add a line in a
  section, move, duplicate) are disabled while a filter is active.
- List view only (not the kanban view used for one2many tables on mobile).
- Presets cover optional columns only.

## License

LGPL-3. See [LICENSE](LICENSE).
