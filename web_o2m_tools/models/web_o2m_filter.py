from collections import Counter

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.fields import Domain

from .web_o2m_config import FILTER_FIELD_TYPES, _facet_key


class WebO2mFilter(models.Model):
    _name = 'web.o2m.filter'
    _description = 'One2many Table Filter Group'
    _order = 'sequence, id'

    config_id = fields.Many2one('web.o2m.config', required=True, ondelete='cascade', index=True)
    comodel = fields.Char(related='config_id.comodel')
    sequence = fields.Integer(default=10)
    name = fields.Char(string='Label', required=True)
    filter_type = fields.Selection(
        [('field', 'Values of a field'), ('domain', 'Named conditions')],
        string='Type', required=True, default='field',
    )
    field_id = fields.Many2one(
        'ir.model.fields', string='Field', ondelete='cascade',
        domain="[('model', '=', comodel), ('ttype', 'in', %s)]" % (list(FILTER_FIELD_TYPES),),
    )
    option_ids = fields.One2many('web.o2m.filter.option', 'filter_id', string='Conditions', copy=True)

    @api.onchange('field_id')
    def _onchange_field_id(self):
        if self.field_id and not self.name:
            self.name = self.field_id.field_description

    @api.constrains('filter_type', 'field_id', 'config_id')
    def _check_field_id(self):
        for group in self:
            if group.filter_type != 'field':
                continue
            field = group.field_id
            if not field:
                raise ValidationError(_('Filter group "%s" needs a field.', group.name))
            if field.model != group.config_id.comodel or field.ttype not in FILTER_FIELD_TYPES:
                raise ValidationError(_('Field "%s" cannot be used as a filter of this table.',
                                        field.field_description))

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get('name') and vals.get('field_id'):
                vals['name'] = self.env['ir.model.fields'].browse(vals['field_id']).field_description
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
    # Facets and selection
    # -------------------------------------------------------------------------

    def _get_facet(self, lines):
        """Return ``{id, name, options: [{key, label, count}]}`` for the given lines."""
        self.ensure_one()
        if self.filter_type == 'domain':
            options = [
                {'key': option.id, 'label': option.name, 'count': option._count(lines)}
                for option in self.option_ids
            ]
        else:
            options = self._get_field_options(lines)
        return {'id': self.id, 'name': self.name, 'options': options}

    def _get_field_options(self, lines):
        field_name = self.field_id.name
        field = lines._fields[field_name]
        counter = self._count_values(lines, field_name)
        if field.type == 'many2one':
            comodel = self.env[field.comodel_name]
            names = {rec.id: rec.display_name for rec in comodel.browse([k for k in counter if k])}
            label = names.get
        elif field.type == 'selection':
            selection = dict(field._description_selection(self.env))
            label = selection.get
        elif field.type == 'boolean':
            label = {True: _('Yes'), False: _('No')}.get
        else:
            label = str
        options = [
            {'key': key, 'label': label(key) if key is not False else _('(Empty)'), 'count': count}
            for key, count in counter.items()
        ]
        if field.type == 'boolean':
            options.sort(key=lambda o: not o['key'])
        else:
            # Empty value last, then alphabetical.
            options.sort(key=lambda o: (o['key'] is False, str(o['label'] or '').lower()))
        return options

    @api.model
    def _count_values(self, lines, field_name):
        field = lines._fields[field_name]
        if field.store and field.column_type:
            groups = lines._read_group([('id', 'in', lines.ids)], [field_name], ['__count'])
            counter = Counter()
            for value, count in groups:
                counter[_facet_key(field, value)] += count
            return counter
        # Non stored field (compute / related): compute in Python.
        return Counter(_facet_key(field, line[field_name]) for line in lines)

    def _get_selection_domain(self, keys):
        """Return ``(domain, python_check)`` restricting lines to the selected keys.

        Options inside a group are OR-ed. ``domain`` is None when the condition must
        be evaluated in Python (non searchable computed field).
        """
        self.ensure_one()
        if self.filter_type == 'domain':
            options = self.option_ids.filtered(lambda o: o.id in {int(k) for k in keys})
            if not options:
                return None, None
            return Domain.OR(Domain(option._get_domain()) for option in options), None

        field_name = self.field_id.name
        field = self.env[self.config_id.comodel]._fields[field_name]
        keys = [False if k is False or k is None else k for k in keys]
        if field._description_searchable:
            values = [k for k in keys if k is not False]
            if field.type == 'boolean':
                values = [k for k in keys if k]
            domains = []
            if values:
                domains.append(Domain(field_name, 'in', values))
            if False in keys:
                domains.append(Domain(field_name, '=', False))
            return Domain.OR(domains), None
        key_set = set(keys)
        return None, lambda line: _facet_key(field, line[field_name]) in key_set
