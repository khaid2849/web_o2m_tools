from odoo import _, api, fields, models, tools
from odoo.exceptions import UserError, ValidationError
from odoo.osv import expression

SEARCH_FIELD_TYPES = ('char', 'text', 'html', 'many2one', 'selection')
FILTER_FIELD_TYPES = ('char', 'selection', 'many2one', 'boolean')


class WebO2mConfig(models.Model):
    _name = 'web.o2m.config'
    _description = 'One2many Table Tools Configuration'
    _order = 'model, field_name'

    name = fields.Char(compute='_compute_name', store=True)
    active = fields.Boolean(default=True)
    model_id = fields.Many2one(
        'ir.model', string='Model', required=True, ondelete='cascade', index=True,
        domain="[('transient', '=', False)]",
    )
    field_id = fields.Many2one(
        'ir.model.fields', string='One2many Field', required=True, ondelete='cascade',
        domain="[('model_id', '=', model_id), ('ttype', '=', 'one2many')]",
    )
    model = fields.Char(related='model_id.model', store=True, index=True, string='Model Name')
    field_name = fields.Char(related='field_id.name', store=True)
    comodel = fields.Char(related='field_id.relation', store=True, string='Line Model')

    enable_search = fields.Boolean(string='Search', default=True)
    search_field_ids = fields.Many2many(
        'ir.model.fields', 'web_o2m_config_search_field_rel', 'config_id', 'field_id',
        string='Searched Fields',
        domain="[('model', '=', comodel), ('ttype', 'in', %s)]" % (list(SEARCH_FIELD_TYPES),),
    )
    enable_filter = fields.Boolean(string='Filters', default=True)
    filter_ids = fields.One2many('web.o2m.filter', 'config_id', string='Filter Groups', copy=True)
    enable_column_preset = fields.Boolean(string='Column Presets', default=True)

    _sql_constraints = [
        ('field_uniq', 'unique(field_id)', 'This one2many field is already configured.'),
    ]

    @api.depends('model_id.name', 'field_id.field_description')
    def _compute_name(self):
        for config in self:
            config.name = '%s / %s' % (config.model_id.name or '', config.field_id.field_description or '')

    @api.onchange('model_id')
    def _onchange_model_id(self):
        if self.field_id and self.field_id.model_id != self.model_id:
            self.field_id = False

    @api.onchange('field_id')
    def _onchange_field_id(self):
        self.search_field_ids = self.search_field_ids.filtered(lambda f: f.model == self.comodel)
        self.filter_ids = [fields.Command.clear()]

    @api.constrains('field_id', 'model_id')
    def _check_field_id(self):
        for config in self:
            if config.field_id.model_id != config.model_id or config.field_id.ttype != 'one2many':
                raise ValidationError(_('"%s" is not a one2many field of the selected model.',
                                        config.field_id.field_description))

    @api.constrains('search_field_ids', 'field_id')
    def _check_search_field_ids(self):
        for config in self:
            Line = self.env[config.comodel]
            for field in config.search_field_ids:
                if field.model != config.comodel or field.ttype not in SEARCH_FIELD_TYPES:
                    raise ValidationError(_('Field "%s" cannot be used for searching this table.',
                                            field.field_description))
                if not Line._fields[field.name]._description_searchable:
                    raise ValidationError(_('Field "%s" is not searchable in the database.',
                                            field.field_description))

    # -------------------------------------------------------------------------
    # Cache invalidation: the client reads the configuration through session_info
    # -------------------------------------------------------------------------

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        self.env.registry.clear_cache()
        return records

    def write(self, vals):
        res = super().write(vals)
        self.env.registry.clear_cache()
        return res

    def unlink(self):
        res = super().unlink()
        self.env.registry.clear_cache()
        return res

    # -------------------------------------------------------------------------
    # Client configuration
    # -------------------------------------------------------------------------

    @api.model
    def get_client_configs(self):
        """Return the enabled tables, keyed by ``"model,field"``.

        Read with sudo: it is admin metadata (no business data) and the result is
        cached for every user of the database.
        """
        return self.sudo()._get_client_configs()

    @tools.ormcache()
    def _get_client_configs(self):
        result = {}
        for config in self.search([]):
            if config.comodel not in self.env:
                continue
            filter_enabled = config.enable_filter and bool(config.filter_ids)
            search_enabled = config.enable_search and bool(config.search_field_ids)
            if not (filter_enabled or search_enabled or config.enable_column_preset):
                continue
            result['%s,%s' % (config.model, config.field_name)] = {
                'search': search_enabled,
                'filter': filter_enabled,
                'presets': config.enable_column_preset,
                'search_labels': config.search_field_ids.mapped('field_description'),
            }
        return result

    # -------------------------------------------------------------------------
    # Search and filter API
    # -------------------------------------------------------------------------

    @api.model
    def o2m_search(self, model, res_id, field_name, search='', filters=None):
        """Return the ids of the lines of ``model(res_id).field_name`` matching the
        search term and the selected filter options.

        :param filters: ``{filter_id (str|int): [option keys]}``
        """
        config, lines = self._o2m_get_lines(model, res_id, field_name)
        domain = [('id', 'in', lines.ids)]
        python_checks = []

        search = (search or '').strip()
        if search and config.enable_search and config.search_field_ids:
            domain = expression.AND([domain, expression.OR([
                [(field.name, 'ilike', search)] for field in config.search_field_ids
            ])])

        if config.enable_filter:
            for filter_id, keys in (filters or {}).items():
                group = config.filter_ids.filtered(lambda f: f.id == int(filter_id))
                if not group or not keys:
                    continue
                group_domain, python_check = group._get_selection_domain(keys)
                if group_domain is not None:
                    domain = expression.AND([domain, group_domain])
                if python_check:
                    python_checks.append(python_check)

        matched = lines.search(domain, order=lines._order)
        for check in python_checks:
            matched = matched.filtered(check)
        return {'ids': matched.ids}

    @api.model
    def o2m_facets(self, model, res_id, field_name):
        """Return the filter groups of the table with their options and line counts."""
        config, lines = self._o2m_get_lines(model, res_id, field_name)
        if not config.enable_filter:
            return []
        return [group._get_facet(lines) for group in config.filter_ids]

    @api.model
    def _o2m_get_lines(self, model, res_id, field_name):
        # sudo: configuration is admin metadata; access to the business records is
        # checked below with the current user's rights.
        config = self.sudo().search([('model', '=', model), ('field_name', '=', field_name)], limit=1)
        if not config or model not in self.env or config.comodel not in self.env:
            raise UserError(_('Search and filters are not enabled for this table.'))
        parent = self.env[model].browse(int(res_id)).exists()
        if not parent:
            raise UserError(_('The record does not exist anymore.'))
        parent.check_access('read')
        # Reading the one2many with the user's environment applies the field domain
        # and the record rules of the line model.
        lines = parent[field_name]
        return config, lines


def _facet_key(field, value):
    """Normalize a field value to a JSON-friendly option key."""
    if field.type == 'many2one':
        return value.id if value else False
    if field.type == 'boolean':
        return bool(value)
    return value or False
