"""Offline portal-shaped fixtures; never contacts either job portal."""
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from curl_cffi.const import CurlHttpVersion
from polish_sources import ImportRequest, Stop, Transport, collect, detail_url, listing_url, parse_listing, seniority_matches


def listing(source, items, total=None, page=1, size=None):
    total = len(items) if total is None else total
    size = max(1, len(items)) if size is None else size
    if source == 'bulldogjob':
        return dict(jobs=items, totalCount=total, slugState=dict(page=page, perPage=size))
    return dict(offersResponse=dict(offers=items, offersCount=total, page=dict(number=page, size=size, count=(total + size - 1) // size)))


def item(source='bulldogjob', identity='123-senior-php'):
    if source == 'bulldogjob':
        return dict(id=identity, position='Senior PHP', experienceLevel='senior')
    return dict(id=identity, offerUrlName='senior-php,oferta,' + identity, positionLevels=[dict(value='senior')])


def detail(source, identity):
    job = dict(id=identity, position='Senior PHP', details='Build APIs')
    return dict(data=dict(job=job)) if source == 'bulldogjob' else dict(offer=job)


class FakeTransport:
    def __init__(self, *pages):
        self.pages = iter(pages)
        self.count = 0
        self.urls = []
        self.closed = False

    def read(self, url):
        self.count += 1
        self.urls.append(url)
        value = next(self.pages)
        if isinstance(value, Exception):
            raise value
        return value

    def close(self):
        self.closed = True


class CollectionTests(unittest.TestCase):
    def test_query_boundaries_and_no_credential_fields(self):
        for change in [dict(maxOffers=0), dict(maxOffers=201), dict(maxRequests=True), dict(maxPages='2'), dict(source='foreign'), dict(cookies='secret')]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                ImportRequest.model_validate(dict(source='bulldogjob') | change)

    def test_configurable_technology_null_and_encoded_paths(self):
        self.assertEqual(listing_url(ImportRequest(source='theprotocol', technology=None, seniority=None), 2), 'https://theprotocol.it/praca?pageNumber=2')
        self.assertIn('skills,C%2B%2B', listing_url(ImportRequest(source='bulldogjob', technology='C++'), 1))
        self.assertEqual(listing_url(ImportRequest(source='bulldogjob', technology=None, seniority=None), 1), 'https://bulldogjob.pl/companies/jobs')

    def test_unknown_seniority_kept_known_other_level_excluded(self):
        for source in ['bulldogjob', 'theprotocol']:
            q = ImportRequest(source=source)
            for level, matches in [(None, True), ('future-level', True), ('senior', True), ('junior', False)]:
                value = dict(experienceLevel=level) if source == 'bulldogjob' else dict(positionLevels=[dict(value=level)])
                with self.subTest(source=source, level=level):
                    self.assertEqual(seniority_matches(q, value), matches)

    def test_filters_known_nonmatching_levels_before_fetching_details(self):
        for source in ['bulldogjob', 'theprotocol']:
            junior, unknown = item(source), item(source, '456-unknown')
            if source == 'bulldogjob':
                junior['experienceLevel'] = 'junior'
                unknown['experienceLevel'] = 'future-level'
            else:
                junior['positionLevels'] = [dict(value='junior')]
                unknown['positionLevels'] = [dict(value='future-level')]
            transport = FakeTransport(listing(source, [junior, unknown]), detail(source, unknown['id']))
            result = collect(ImportRequest(source=source), transport)
            self.assertEqual(result['status'], 'complete')
            self.assertEqual(result['diagnostics']['filtered'], 1)
            self.assertEqual(result['records'][0]['detail']['id'], unknown['id'])
            self.assertEqual(transport.count, 2)

    def test_rejects_foreign_host_injected_and_mismatched_slugs(self):
        for source, value in [('bulldogjob', dict(id='https://evil.test/x')), ('bulldogjob', dict(id='123-x/../../private')), ('theprotocol', dict(id='abc', offerUrlName='https://evil.test/x,oferta,abc')), ('theprotocol', dict(id='abc', offerUrlName='title,oferta,other'))]:
            with self.subTest(source=source, value=value), self.assertRaises(Stop):
                detail_url(source, value)

    def test_validates_pagination_and_rejects_truncated_listing(self):
        for source in ['bulldogjob', 'theprotocol']:
            self.assertEqual(parse_listing(source, listing(source, [item(source)]), 1)[1:], (1, 1))
            for bad in [listing(source, [item(source)], page=2), listing(source, [item(source)], total=4, size=2), listing(source, [], total=-1)]:
                with self.subTest(source=source), self.assertRaisesRegex(Stop, 'invalid_pagination'):
                    parse_listing(source, bad, 1)

    def test_preserves_candidates_on_later_challenge_or_bad_pagination(self):
        for source in ['bulldogjob', 'theprotocol']:
            for failure, reason in [(Stop('challenge'), 'challenge'), (Stop('request_limit'), 'request_limit'), (Stop('deadline'), 'deadline'), ({}, 'invalid_pagination')]:
                value = item(source)
                transport = FakeTransport(listing(source, [value], total=2, size=1), detail(source, value['id']), failure)
                result = collect(ImportRequest(source=source), transport)
                self.assertEqual(result['status'], 'partial')
                self.assertEqual(len(result['records']), 1)
                self.assertEqual(result['diagnostics']['stopReason'], reason)
                self.assertTrue(transport.closed)

    def test_missing_and_mismatched_details_keep_other_records(self):
        for source in ['bulldogjob', 'theprotocol']:
            first, second = item(source), item(source, '456-second')
            for missing in [{}, detail(source, 'wrong-id')]:
                transport = FakeTransport(listing(source, [first, second]), detail(source, first['id']), missing)
                result = collect(ImportRequest(source=source), transport)
                self.assertEqual(result['status'], 'partial')
                self.assertEqual(len(result['records']), 1)
                self.assertEqual(result['diagnostics']['rejected'], 1)

    def test_duplicate_identity_does_not_refetch_or_discard_valid_detail(self):
        for source in ['bulldogjob', 'theprotocol']:
            value = item(source)
            transport = FakeTransport(listing(source, [value, value]), detail(source, value['id']))
            result = collect(ImportRequest(source=source), transport)
            self.assertEqual(result['status'], 'partial')
            self.assertEqual(len(result['records']), 1)
            self.assertEqual(result['diagnostics']['duplicates'], 1)
            self.assertEqual(transport.count, 2)

    def test_offer_and_page_limits_stop_without_fetching_next_detail(self):
        first, second = item(), item(identity='456-second')
        transport = FakeTransport(listing('bulldogjob', [first, second]), detail('bulldogjob', first['id']))
        result = collect(ImportRequest(source='bulldogjob', maxOffers=1), transport)
        self.assertEqual(result['diagnostics']['stopReason'], 'offer_limit')
        self.assertEqual(transport.count, 2)
        transport = FakeTransport(listing('bulldogjob', [first], total=2, size=1), detail('bulldogjob', first['id']))
        result = collect(ImportRequest(source='bulldogjob', maxPages=1), transport)
        self.assertEqual(result['diagnostics']['stopReason'], 'page_limit')
        self.assertEqual(result['status'], 'partial')

    def test_output_limit_retains_prior_candidates(self):
        first, second = item(), item(identity='456-huge')
        huge = detail('bulldogjob', second['id'])
        huge['data']['job']['details'] = 'x' * (6 * 1024 * 1024)
        transport = FakeTransport(listing('bulldogjob', [first, second]), detail('bulldogjob', first['id']), huge)
        result = collect(ImportRequest(source='bulldogjob'), transport)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['diagnostics']['stopReason'], 'output_limit')
        self.assertEqual(len(result['records']), 1)
        self.assertEqual(result['records'][0]['detail']['id'], first['id'])

    def test_changing_total_and_exception_messages_do_not_escape(self):
        value = item()
        for failure, reason in [(listing('bulldogjob', [item(identity='456-next')], total=3, size=1, page=2), 'changing_pagination'), (RuntimeError('secret session cookie'), 'fetch_or_parse_error')]:
            transport = FakeTransport(listing('bulldogjob', [value], total=2, size=1), detail('bulldogjob', value['id']), failure)
            result = collect(ImportRequest(source='bulldogjob'), transport)
            self.assertEqual(result['diagnostics']['stopReason'], reason)
            self.assertEqual(result['status'], 'partial')
            self.assertNotIn('secret', json.dumps(result))


class Response:
    def __init__(self, body=None, status=200, headers=None):
        self.status_code = status
        self.headers = {'content-type': 'text/html'} if headers is None else headers
        self.body = body if body is not None else b'<script id="__NEXT_DATA__">{"props":{"pageProps":{"valid":true}}}</script>'
        self.closed = False

    def iter_content(self, chunk_size):
        yield self.body

    def close(self):
        self.closed = True


class Session:
    def __init__(self, response):
        self.response, self.calls = response, []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response

    def close(self):
        pass


class TransportTests(unittest.TestCase):
    def test_http2_no_redirect_and_spacing_request_budget(self):
        now = [0.0]
        delays = []
        def sleep(delay):
            delays.append(delay)
            now[0] += delay
        session = Session(Response())
        transport = Transport(ImportRequest(source='bulldogjob', maxRequests=2), session, lambda: now[0], sleep)
        self.assertEqual(transport.read('https://bulldogjob.pl'), {'valid': True})
        transport.read('https://bulldogjob.pl')
        self.assertEqual(delays, [2])
        self.assertEqual(session.calls[0][1]['http_version'], CurlHttpVersion.V2_0)
        self.assertFalse(session.calls[0][1]['allow_redirects'])
        self.assertTrue(session.calls[0][1]['stream'])
        self.assertLessEqual(session.calls[0][1]['timeout'], 20)
        with self.assertRaisesRegex(Stop, 'request_limit'):
            transport.read('https://bulldogjob.pl')
        self.assertEqual(len(session.calls), 2)

    def test_deadline_is_checked_after_spacing(self):
        now = [0.0]
        session = Session(Response())
        transport = Transport(ImportRequest(source='bulldogjob', maxSeconds=1), session, lambda: now[0], lambda delay: now.__setitem__(0, now[0] + delay))
        transport.read('https://bulldogjob.pl')
        with self.assertRaisesRegex(Stop, 'deadline'):
            transport.read('https://bulldogjob.pl')
        self.assertEqual(len(session.calls), 1)

    def test_challenge_redirect_wrong_content_and_body_limits_close_response(self):
        for response, reason in [(Response(headers={'cf-mitigated': 'challenge'}), 'challenge'), (Response(status=302), 'http_302'), (Response(headers={'content-type': 'application/json'}), 'invalid_content_type'), (Response(body=b'x' * (8 * 1024 * 1024 + 1)), 'response_limit'), (Response(body=b'<html>challenge</html>'), 'invalid_response')]:
            with self.subTest(reason=reason):
                transport = Transport(ImportRequest(source='bulldogjob'), Session(response))
                with self.assertRaisesRegex(Stop, reason):
                    transport.read('https://bulldogjob.pl')
                self.assertTrue(response.closed)


if __name__ == '__main__':
    unittest.main()
