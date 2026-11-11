from odoo import models


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    def session_info(self):
        result = super().session_info()
        if self.env.user._is_internal():
            result['web_o2m_tools'] = self.env['web.o2m.config'].get_client_configs()
        return result
