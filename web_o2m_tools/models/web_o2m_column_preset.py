from odoo import api, fields, models


class WebO2mColumnPreset(models.Model):
    _name = 'web.o2m.column.preset'
    _description = 'One2many Table Column Preset'
    _order = 'is_favorite desc, sequence, name, id'

    name = fields.Char(required=True)
    user_id = fields.Many2one('res.users', required=True, default=lambda self: self.env.user,
                              ondelete='cascade', index=True)
    res_model = fields.Char(string='Model', required=True, index=True)
    field_name = fields.Char(string='One2many Field', required=True)
    column_names = fields.Char(string='Columns', default='',
                               help='Comma separated names of the optional columns to display.')
    is_favorite = fields.Boolean(string='Favorite')
    is_default = fields.Boolean(string='Default')
    sequence = fields.Integer(default=10)

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records.filtered('is_default')._unset_other_defaults()
        return records

    def write(self, vals):
        res = super().write(vals)
        if vals.get('is_default'):
            self._unset_other_defaults()
        return res

    def _unset_other_defaults(self):
        """Keep a single default preset per user and table."""
        for preset in self:
            others = self.search([
                ('id', '!=', preset.id),
                ('user_id', '=', preset.user_id.id),
                ('res_model', '=', preset.res_model),
                ('field_name', '=', preset.field_name),
                ('is_default', '=', True),
            ])
            if others:
                others.write({'is_default': False})

    @api.model
    def get_presets(self, res_model, field_name):
        """Presets of the current user for a table (record rules restrict to own)."""
        presets = self.search([
            ('user_id', '=', self.env.uid),
            ('res_model', '=', res_model),
            ('field_name', '=', field_name),
        ])
        return [{
            'id': preset.id,
            'name': preset.name,
            'columns': [c for c in (preset.column_names or '').split(',') if c],
            'is_favorite': preset.is_favorite,
            'is_default': preset.is_default,
        } for preset in presets]
