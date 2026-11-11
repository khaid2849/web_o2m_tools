from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.fields import Domain
from odoo.tools.safe_eval import datetime, dateutil, safe_eval


class WebO2mFilterOption(models.Model):
    _name = 'web.o2m.filter.option'
    _description = 'One2many Table Filter Condition'
    _order = 'sequence, id'

    filter_id = fields.Many2one('web.o2m.filter', required=True, ondelete='cascade', index=True)
    comodel = fields.Char(related='filter_id.config_id.comodel')
    sequence = fields.Integer(default=10)
    name = fields.Char(string='Label', required=True)
    domain = fields.Char(required=True, default='[]')

    @api.constrains('domain')
    def _check_domain(self):
        for option in self:
            try:
                domain = option._get_domain()
                self.env[option.filter_id.config_id.comodel]._search(domain)
            except Exception as e:  # noqa: BLE001 - any parse/field error makes the domain invalid
                raise ValidationError(_('Invalid domain for condition "%(name)s": %(error)s',
                                        name=option.name, error=e)) from e

    def _get_eval_context(self):
        return {
            'uid': self.env.uid,
            'datetime': datetime,
            'relativedelta': dateutil.relativedelta.relativedelta,
            'context_today': lambda: fields.Date.context_today(self),
        }

    def _get_domain(self):
        self.ensure_one()
        domain = safe_eval(self.domain or '[]', self._get_eval_context())
        if not isinstance(domain, (list, tuple)):
            raise ValueError(_('A domain must be a list.'))
        return list(domain)

    def _count(self, lines):
        self.ensure_one()
        if not lines:
            return 0
        return lines.search_count(Domain('id', 'in', lines.ids) & Domain(self._get_domain()))
