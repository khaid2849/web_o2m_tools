{
    'name': 'One2many Table Tools: Search, Filters & Column Presets',
    'summary': 'Search and filter the lines of one2many tables inside forms, '
               'and save per-user column presets',
    'version': '18.0.1.0.0',
    'category': 'Productivity',
    'author': 'Gout',
    'maintainer': 'Gout',
    'website': 'https://github.com/khaid2849/web_o2m_tools',
    'license': 'LGPL-3',
    'images': ['static/description/banner.png'],
    'depends': ['web'],
    'data': [
        'security/ir.model.access.csv',
        'security/record_rules.xml',
        'views/web_o2m_config_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            # Template extensions are placed right after the extended templates:
            # in Odoo 18 an extension only reaches the "primary" child templates
            # (e.g. account.sectionAndNoteListRenderer) loaded after it.
            ('after', 'web/static/src/views/list/list_renderer.xml',
             'web_o2m_tools/static/src/list_renderer/list_renderer_patch.xml'),
            ('after', 'web/static/src/views/fields/x2many/x2many_field.xml',
             'web_o2m_tools/static/src/x2many/x2many_field_patch.xml'),
            'web_o2m_tools/static/src/core/**/*',
            'web_o2m_tools/static/src/x2many/o2m_search_bar.*',
            'web_o2m_tools/static/src/x2many/filter_state.js',
            'web_o2m_tools/static/src/x2many/x2many_field_patch.js',
            'web_o2m_tools/static/src/list_renderer/preset_*',
            'web_o2m_tools/static/src/list_renderer/list_renderer_patch.js',
        ],
    },
    'installable': True,
    'application': False,
}
