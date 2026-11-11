from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import TransactionCase, new_test_user, tagged


@tagged('post_install', '-at_install')
class TestO2mTools(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = new_test_user(cls.env, login='o2m_user', groups='base.group_user')
        cls.user2 = new_test_user(cls.env, login='o2m_user2', groups='base.group_user')
        Fields = cls.env['ir.model.fields']

        def field(name):
            return Fields._get('res.partner', name)

        cls.be = cls.env.ref('base.be')
        cls.fr = cls.env.ref('base.fr')
        cls.parent = cls.env['res.partner'].create({
            'name': 'Parent Co',
            'is_company': True,
            'child_ids': [
                (0, 0, {'name': 'Alice Invoice', 'type': 'invoice', 'email': 'alice@example.com',
                        'country_id': cls.be.id, 'city': 'Brussels'}),
                (0, 0, {'name': 'Bob Delivery', 'type': 'delivery', 'country_id': cls.fr.id, 'city': 'Paris'}),
                (0, 0, {'name': 'Carol Contact', 'type': 'contact', 'email': 'carol@example.com',
                        'is_company': True}),
                (0, 0, {'name': 'Dan Invoice', 'type': 'invoice', 'country_id': cls.be.id, 'city': 'Ghent'}),
            ],
        })
        cls.alice, cls.bob, cls.carol, cls.dan = cls.parent.child_ids.sorted('name')
        cls.config = cls.env['web.o2m.config'].create({
            'model_id': cls.env['ir.model']._get_id('res.partner'),
            'field_id': field('child_ids').id,
            'search_field_ids': [(6, 0, (field('name') | field('email')).ids)],
            'filter_ids': [
                (0, 0, {'filter_type': 'field', 'field_id': field('type').id, 'sequence': 1}),
                (0, 0, {'filter_type': 'field', 'field_id': field('country_id').id, 'sequence': 2}),
                (0, 0, {'filter_type': 'field', 'field_id': field('is_company').id, 'sequence': 3}),
                # non stored, non searchable compute -> evaluated in Python
                (0, 0, {'filter_type': 'field', 'field_id': field('contact_address').id, 'sequence': 4}),
                (0, 0, {'filter_type': 'domain', 'name': 'Email', 'sequence': 5, 'option_ids': [
                    (0, 0, {'name': 'Set', 'domain': "[('email', '!=', False)]"}),
                    (0, 0, {'name': 'Not set', 'domain': "[('email', '=', False)]"}),
                ]}),
            ],
        })
        cls.f_type, cls.f_country, cls.f_company, cls.f_address, cls.f_email = cls.config.filter_ids

    def _search(self, search='', filters=None, user=None):
        Config = self.env['web.o2m.config'].with_user(user or self.user)
        ids = Config.o2m_search('res.partner', self.parent.id, 'child_ids', search, filters)['ids']
        return self.env['res.partner'].browse(ids)

    # ------------------------------------------------------------------ search

    def test_search_all_lines_without_criteria(self):
        self.assertEqual(self._search(), self.parent.child_ids)

    def test_search_term_on_any_configured_field(self):
        self.assertEqual(self._search('invoice'), self.alice | self.dan)
        self.assertEqual(self._search('carol@'), self.carol)
        # city is not a configured search field
        self.assertFalse(self._search('Brussels'))

    def test_filter_selection_and_or_inside_group(self):
        filters = {str(self.f_type.id): ['invoice', 'delivery']}
        self.assertEqual(self._search(filters=filters), self.alice | self.bob | self.dan)

    def test_filter_many2one_with_empty_value(self):
        self.assertEqual(self._search(filters={self.f_country.id: [self.be.id]}), self.alice | self.dan)
        self.assertEqual(self._search(filters={self.f_country.id: [False]}), self.carol)
        self.assertEqual(self._search(filters={self.f_country.id: [self.fr.id, False]}), self.bob | self.carol)

    def test_filter_boolean(self):
        self.assertEqual(self._search(filters={self.f_company.id: [True]}), self.carol)
        self.assertEqual(self._search(filters={self.f_company.id: [False]}), self.alice | self.bob | self.dan)

    def test_filter_non_stored_field_in_python(self):
        address = self.alice.contact_address
        self.assertEqual(self._search(filters={self.f_address.id: [address]}), self.alice)

    def test_filter_domain_option(self):
        set_option, not_set_option = self.f_email.option_ids
        self.assertEqual(self._search(filters={self.f_email.id: [set_option.id]}), self.alice | self.carol)
        self.assertEqual(self._search(filters={self.f_email.id: [not_set_option.id]}), self.bob | self.dan)

    def test_groups_and_search_are_and_combined(self):
        set_option = self.f_email.option_ids[0]
        filters = {self.f_type.id: ['invoice'], self.f_email.id: [set_option.id]}
        self.assertEqual(self._search(filters=filters), self.alice)
        self.assertEqual(self._search('dan', filters={self.f_type.id: ['invoice']}), self.dan)

    def test_disabled_search_and_filter_are_ignored(self):
        self.config.write({'enable_search': False, 'enable_filter': False})
        self.assertEqual(self._search('alice', {self.f_type.id: ['invoice']}), self.parent.child_ids)

    # ------------------------------------------------------------------ facets

    def test_facets_values_and_counts(self):
        facets = self.env['web.o2m.config'].with_user(self.user).o2m_facets(
            'res.partner', self.parent.id, 'child_ids')
        by_id = {facet['id']: facet for facet in facets}
        type_counts = {o['key']: o['count'] for o in by_id[self.f_type.id]['options']}
        self.assertEqual(type_counts, {'invoice': 2, 'delivery': 1, 'contact': 1})
        country = by_id[self.f_country.id]['options']
        self.assertEqual([(o['key'], o['count']) for o in country], [(self.be.id, 2), (self.fr.id, 1), (False, 1)])
        self.assertEqual(country[0]['label'], self.be.display_name)
        company = {o['key']: o['count'] for o in by_id[self.f_company.id]['options']}
        self.assertEqual(company, {True: 1, False: 3})
        address = by_id[self.f_address.id]['options']
        self.assertEqual(sum(o['count'] for o in address), 4)
        email = [(o['label'], o['count']) for o in by_id[self.f_email.id]['options']]
        self.assertEqual(email, [('Set', 2), ('Not set', 2)])

    # ------------------------------------------------------------------ security

    def test_unconfigured_table_is_refused(self):
        with self.assertRaises(UserError):
            self.env['web.o2m.config'].with_user(self.user).o2m_search(
                'res.partner', self.parent.id, 'bank_ids', 'x', {})

    def test_parent_access_is_checked(self):
        other_company = self.env['res.company'].create({'name': 'Other Co'})
        self.parent.company_id = other_company
        with self.assertRaises(AccessError):
            self._search('alice')

    def test_invalid_configuration(self):
        Fields = self.env['ir.model.fields']
        with self.assertRaises(ValidationError):
            # computed, not searchable
            self.config.search_field_ids = [(4, Fields._get('res.partner', 'contact_address').id)]
        with self.assertRaises(ValidationError):
            self.f_email.option_ids[0].domain = "[('no_such_field', '=', 1)]"

    def test_client_configs_follow_changes(self):
        Config = self.env['web.o2m.config'].with_user(self.user)
        conf = Config.get_client_configs()['res.partner,child_ids']
        self.assertEqual((conf['search'], conf['filter'], conf['presets']), (True, True, True))
        self.assertIn('Email', conf['search_labels'])
        self.config.enable_search = False
        conf = Config.get_client_configs()['res.partner,child_ids']
        self.assertFalse(conf['search'])
        self.config.active = False
        self.assertNotIn('res.partner,child_ids', Config.get_client_configs())

    # ------------------------------------------------------------------ presets

    def test_presets_single_default_and_own_only(self):
        Preset = self.env['web.o2m.column.preset'].with_user(self.user)
        vals = {'res_model': 'res.partner', 'field_name': 'child_ids'}
        first = Preset.create({**vals, 'name': 'Short', 'column_names': 'email', 'is_default': True})
        second = Preset.create({**vals, 'name': 'Long', 'column_names': 'email,phone'})
        second.is_default = True
        self.assertFalse(first.is_default)
        presets = Preset.get_presets('res.partner', 'child_ids')
        self.assertEqual({p['name']: p['columns'] for p in presets},
                         {'Short': ['email'], 'Long': ['email', 'phone']})
        # another user neither sees nor edits them, and his default is independent
        Preset2 = self.env['web.o2m.column.preset'].with_user(self.user2)
        self.assertEqual(Preset2.get_presets('res.partner', 'child_ids'), [])
        with self.assertRaises(AccessError):
            first.with_user(self.user2).write({'name': 'hacked'})
        Preset2.create({**vals, 'name': 'Mine', 'is_default': True})
        self.assertTrue(second.is_default)
