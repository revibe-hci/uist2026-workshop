import copy
import unittest

from story import StoryError, generate, recognize, validate_request
from test_multi_story import request


FORWARD = 'rel:mike:maya:trust'
REVERSE = 'rel:maya:mike:trust'


def relationship_request():
    body = request()
    body['viewMode'] = 'relationships'
    body['activeRelationshipKey'] = FORWARD
    body['relationshipTracks'] = {
        FORWARD: {'characterId': 'mike', 'targetCharacterId': 'maya', 'dimensionId': 'trust',
                  'controls': [None, {'target': .9, 'tolerance': .2}, None], 'values': [None] * 3},
        REVERSE: {'characterId': 'maya', 'targetCharacterId': 'mike', 'dimensionId': 'trust',
                  'controls': [None, {'target': .1, 'tolerance': .2}, None], 'values': [None] * 3},
    }
    return body


class RelationshipStoryTests(unittest.TestCase):
    def test_joint_generation_scores_opposing_reciprocal_targets_and_individual_curves(self):
        body = relationship_request()
        calls = []

        def model(system, data):
            calls.append(data)
            if len(calls) == 1:
                constraints = data['requested'][0]['constraints']
                self.assertEqual({c['key'] for c in constraints},
                                 {'mike:fortune', 'maya:confidence', FORWARD, REVERSE})
                self.assertEqual(next(c for c in constraints if c['key'] == FORWARD)['targetCharacterId'], 'maya')
                return {'candidates': [{'index': 1, 'options': ['Individual fit.', 'Joint fit.']}]}
            self.assert_no_targets(data)
            return {'scores': [
                {'id': '1:0', 'values': {'mike:fortune': .9, 'maya:confidence': .1, FORWARD: .1, REVERSE: .9}},
                {'id': '1:1', 'values': {'mike:fortune': .7, 'maya:confidence': .3, FORWARD: .9, REVERSE: .1}},
            ]}

        result = generate(body, model)
        self.assertEqual(result['updates'][0]['text'], 'Joint fit.')
        self.assertEqual(result['updates'][0]['values'][FORWARD], .9)
        self.assertEqual(result['updates'][0]['values'][REVERSE], .1)
        self.assertEqual(result['scored_pairs'], 4)

    def assert_no_targets(self, value):
        if isinstance(value, dict):
            self.assertNotIn('target', value)
            self.assertNotIn('tolerance', value)
            self.assertNotIn('controls', value)
            self.assertNotIn('values', value)
            for child in value.values():
                self.assert_no_targets(child)
        elif isinstance(value, list):
            for child in value:
                self.assert_no_targets(child)

    def test_active_undrawn_relationship_is_recognized_with_endpoint_identities(self):
        body = relationship_request()
        for track in body['tracks'].values():
            track['controls'] = [None] * 3
        for track in body['relationshipTracks'].values():
            track['controls'] = [None] * 3

        def model(system, data):
            self.assert_no_targets(data)
            pairs = {p['key']: p for p in data['pairs']}
            self.assertEqual(set(pairs), {'mike:fortune', FORWARD})
            pair = pairs[FORWARD]
            self.assertEqual(pair['character']['name'], 'Mike')
            self.assertEqual(pair['targetCharacter']['name'], 'Maya')
            self.assertEqual(pair['dimension']['low'].lower(), 'distrust')
            self.assertEqual(pair['dimension']['high'].lower(), 'trust')
            return {'scores': [{'id': item['id'], 'values': {'mike:fortune': .5, FORWARD: .8}}
                               for item in data['items']]}

        result = recognize(body, model)
        self.assertEqual(result['scores'][0]['values'][FORWARD], .8)

    def test_candidate_selection_minimizes_joint_error_even_when_first_is_close(self):
        body = relationship_request()
        answers = iter([
            {'candidates': [{'index': 1, 'options': ['Close fit.', 'Exact fit.']}]},
            {'scores': [
                {'id': '1:0', 'values': {'mike:fortune': .8, 'maya:confidence': .2, FORWARD: .8, REVERSE: .2}},
                {'id': '1:1', 'values': {'mike:fortune': .9, 'maya:confidence': .1, FORWARD: .9, REVERSE: .1}},
            ]},
        ])
        self.assertEqual(generate(body, lambda *_: next(answers))['updates'][0]['text'], 'Exact fit.')

    def test_malformed_relationships_rejected_without_model_calls(self):
        base = relationship_request()
        variants = []
        for field, value in [('characterId', 'missing'), ('targetCharacterId', 'missing'),
                             ('targetCharacterId', 'mike'), ('dimensionId', 'fortune'),
                             ('controls', []), ('values', []),
                             ('controls', [None, {'target': True, 'tolerance': .2}, None]),
                             ('controls', [None, {'target': .5, 'tolerance': float('inf')}, None]),
                             ('values', [None, float('nan'), None]),
                             ('values', [None, 1.5, None]), ('controls', [None, 1, None])]:
            body = copy.deepcopy(base)
            body['relationshipTracks'][FORWARD][field] = value
            variants.append(body)
        for key in ['mike:maya:trust', 'rel:mike:maya:affection', 'rel:mike:maya:trust:extra']:
            body = copy.deepcopy(base)
            body['relationshipTracks'][key] = body['relationshipTracks'].pop(FORWARD)
            variants.append(body)
        for value in [None, [], {str(i): {} for i in range(121)}]:
            body = copy.deepcopy(base)
            body['relationshipTracks'] = value
            variants.append(body)
        body = copy.deepcopy(base)
        body['activeRelationshipKey'] = 'rel:mike:missing:trust'
        variants.append(body)
        for body in variants:
            with self.subTest(body=body), self.assertRaises(StoryError):
                validate_request(body)

    def test_missing_relationship_scores_rejected_atomically(self):
        body = relationship_request()
        before = copy.deepcopy(body)
        def model(system, data):
            return {'scores': [{'id': item['id'], 'values': {'mike:fortune': .5, 'maya:confidence': .5}}
                               for item in data['items']]}
        with self.assertRaises(StoryError):
            recognize(body, model)
        self.assertEqual(body, before)

    def test_old_multi_requests_remain_valid(self):
        body = request()
        self.assertIs(validate_request(body), body)


if __name__ == '__main__':
    unittest.main()
