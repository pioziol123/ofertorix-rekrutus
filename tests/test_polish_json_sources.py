"""Offline JSON protocol regressions using observed public response structures."""
import json
from pathlib import Path
import sys
import unittest
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from polish_sources import ImportRequest, Stop, Transport
from polish_json_sources import collect_json, criteria_match, json_identity, parse_json_page, search_request, source_urls, same_nfj_posting, canonical_nfj_url
from test_polish_sources import Response, Session


def item(source='justjoinit', index=1, seniority='senior'):
    if source == 'justjoinit':
        return dict(guid=f'guid-{index}', slug=f'fixture-php-{index}', experienceLevel=seniority)
    return dict(id=f'fixture-php-{index}-Remote', url=f'fixture-public-{index}-remote', seniority=[seniority] if seniority else [])


def page(source, items, total=None, cursor=0, following=None, pages=1):
    total = len(items) if total is None else total
    if source == 'justjoinit':
        return dict(data=items, meta=dict(totalItems=total, **{'from': cursor}, next=dict(cursor=following, itemsCount=50)))
    return dict(postings=items, totalCount=total, totalPages=pages, rawSearch='requirement=PHP')


def detail(source, record):
    identity = record['guid'] if source == 'justjoinit' else record['id'].lower()
    value = dict(id=identity, title='Senior PHP', body='Build APIs')
    if source == 'nofluffjobs':
        value['postingUrl'] = record['url']
    return value


class JsonTransport:
    def __init__(self, *responses):
        self.responses, self.calls = iter(responses), []
        self.count, self.closed = 0, False

    def read_json(self, url, body=None):
        self.count += 1
        self.calls.append((url, body))
        value = next(self.responses)
        if isinstance(value, Exception):
            raise value
        return value

    def close(self):
        self.closed = True


class JsonProtocolTests(unittest.TestCase):
    def test_search_requests_preserve_filters_original_pay_and_nfj_post_body(self):
        q = ImportRequest(source='nofluffjobs', technology='C++')
        url, body = search_request(q, 2)
        params = parse_qs(urlsplit(url).query)
        self.assertEqual(params['withSalaryMatch'], ['false'])
        self.assertEqual(params['pageFrom'], ['2'])
        self.assertEqual(params['salaryCurrency'], ['original'])
        self.assertEqual(params['salaryPeriod'], ['original'])
        self.assertEqual(body, dict(rawSearch='requirement=C++', pageSize=20, withSalaryMatch=False))
        self.assertEqual(search_request(ImportRequest(source='nofluffjobs', technology=None), 1)[1]['rawSearch'], '')
        url, body = search_request(ImportRequest(source='justjoinit'), 2, 137)
        params = parse_qs(urlsplit(url).query)
        self.assertEqual(params['from'], ['137'])
        self.assertEqual(params['experienceLevels'], ['senior'])
        self.assertEqual(params['skills'], ['PHP'])
        self.assertIsNone(body)

    def test_nonunit_jj_cursor_advances_use_server_cursor(self):
        a, b = item(), item(index=2)
        t = JsonTransport(page('justjoinit', [a], 2, following=137), detail('justjoinit', a), page('justjoinit', [b], 2, cursor=137), detail('justjoinit', b))
        result = collect_json(ImportRequest(source='justjoinit'), t)
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(len(result['records']), 2)
        self.assertEqual(parse_qs(urlsplit(t.calls[2][0]).query)['from'], ['137'])
        self.assertTrue(t.closed)

    def test_invalid_repeated_or_wrong_origin_jj_cursor_keeps_prior_record(self):
        a, b = item(), item(index=2)
        for cursor, following in [(12, 12), (12, 1), (12, True), (12, '40'), (99, 40)]:
            t = JsonTransport(page('justjoinit', [a], 2, following=12), detail('justjoinit', a), page('justjoinit', [b], 2, cursor=cursor, following=following))
            result = collect_json(ImportRequest(source='justjoinit'), t)
            with self.subTest(cursor=cursor, following=following):
                self.assertEqual(result['status'], 'partial')
                self.assertEqual(result['diagnostics']['stopReason'], 'invalid_cursor')
                self.assertEqual(len(result['records']), 1)

    def test_changed_total_keeps_previous_candidates(self):
        for source in ['justjoinit', 'nofluffjobs']:
            a, b = item(source), item(source, 2)
            t = JsonTransport(page(source, [a], 2, following=23, pages=2), detail(source, a), page(source, [b], 3, cursor=23, pages=2))
            result = collect_json(ImportRequest(source=source), t)
            self.assertEqual(result['diagnostics']['stopReason'], 'changing_pagination')
            self.assertEqual(len(result['records']), 1)
            self.assertEqual(result['status'], 'partial')

    def test_jj_cursor_origin_rejects_boolean_and_float_metadata(self):
        for origin in [False, True, 0.0, '0']:
            with self.subTest(origin=origin), self.assertRaisesRegex(Stop, 'invalid_cursor'):
                parse_json_page('justjoinit', page('justjoinit', [item()], cursor=origin), 1, 0)

    def test_nfj_page_count_drift_keeps_prior_records(self):
        a, b = item('nofluffjobs'), item('nofluffjobs', 2)
        t = JsonTransport(page('nofluffjobs', [a], 2, pages=2), detail('nofluffjobs', a), page('nofluffjobs', [b], 2, pages=3))
        result = collect_json(ImportRequest(source='nofluffjobs'), t)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['diagnostics']['stopReason'], 'changing_pagination')
        self.assertEqual(len(result['records']), 1)

    def test_source_cap_10000_is_partial_even_after_observed_count_is_exhausted(self):
        # Filtered records count toward observed completeness without requiring
        # 10000 detail reads or bypassing the bounded result cap.
        responses = []
        for index in range(10):
            records = [item(index=index * 1000 + n, seniority='junior') for n in range(1000)]
            if index == 0:
                records[0]['experienceLevel'] = 'senior'
            responses.append(page('justjoinit', records, 10000, cursor=index * 1000, following=(index + 1) * 1000 if index < 9 else None))
            if index == 0:
                responses.append(detail('justjoinit', records[0]))
        result = collect_json(ImportRequest(source='justjoinit', maxPages=10), JsonTransport(*responses))
        self.assertEqual(result['diagnostics']['stopReason'], 'source_limit')
        self.assertEqual(result['diagnostics']['filtered'], 9999)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(len(result['records']), 1)

    def test_nfj_variable_page_sizes_complete_by_observed_count(self):
        # Production response pages do not obey requested pageSize=20.
        values = [item('nofluffjobs', i, 'junior') for i in range(250)]
        values[0]['seniority'] = ['Senior']
        t = JsonTransport(page('nofluffjobs', values[:181], 250, pages=2), detail('nofluffjobs', values[0]), page('nofluffjobs', values[181:], 250, pages=2))
        result = collect_json(ImportRequest(source='nofluffjobs'), t)
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(result['diagnostics']['filtered'], 249)
        self.assertEqual(result['diagnostics']['pages'], 2)
        self.assertEqual(len(result['records']), 1)
        self.assertEqual(t.calls[0][1]['withSalaryMatch'], False)

    def test_last_page_incomplete_count_is_partial(self):
        for source in ['justjoinit', 'nofluffjobs']:
            a = item(source)
            t = JsonTransport(page(source, [a], 2), detail(source, a))
            result = collect_json(ImportRequest(source=source), t)
            self.assertEqual(result['diagnostics']['stopReason'], 'incomplete_count')
            self.assertEqual(result['status'], 'partial')

    def test_nfj_lowercase_identity_duplicates_and_public_path(self):
        a = item('nofluffjobs')
        duplicate = dict(a, id=a['id'].upper())
        t = JsonTransport(page('nofluffjobs', [a, duplicate], total=1), detail('nofluffjobs', a))
        result = collect_json(ImportRequest(source='nofluffjobs'), t)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['diagnostics']['duplicates'], 1)
        self.assertEqual(len(t.calls), 2)
        self.assertEqual(json_identity('nofluffjobs', a), a['id'].lower())
        self.assertTrue(result['records'][0]['url'].endswith(a['url']))
        self.assertTrue(t.calls[1][0].endswith(a['url']))

    def test_nfj_city_and_region_aliases_group_by_reference_count_raw_cards(self):
        city = dict(item('nofluffjobs'), id='fixture-php-Wrocław', url='fixture-php-wroclaw', reference='SHARED')
        region = dict(item('nofluffjobs', 2), id='fixture-php-mazowieckie', url='fixture-php-mazowieckie', reference='SHARED')
        for first, alias in [(city, region), (region, city)]:
            canonical = dict(id='fixture-php-wroclaw' if first == city else 'fixture-php-remote', defaultUrl='fixture-php-remote', postingUrl='fixture-php-wroclaw', reference='SHARED')
            t = JsonTransport(page('nofluffjobs', [first, alias]), canonical)
            result = collect_json(ImportRequest(source='nofluffjobs'), t)
            self.assertEqual(result['status'], 'complete')
            self.assertEqual(result['diagnostics']['totalCount'], 2)
            self.assertEqual(result['diagnostics']['aliases'], 1)
            self.assertEqual(result['diagnostics']['duplicates'], 0)
            self.assertEqual(result['diagnostics']['stopReason'], 'exhausted')
            self.assertEqual(len(result['records']), 1)
            self.assertEqual(result['records'][0]['url'], 'https://nofluffjobs.com/pl/job/fixture-php-remote')
            self.assertEqual(len(t.calls), 2)

    def test_nfj_aliases_across_pages_fetch_detail_only_once(self):
        first = dict(item('nofluffjobs'), reference='SHARED')
        second = dict(item('nofluffjobs', 2), reference='SHARED')
        saved = dict(detail('nofluffjobs', first), reference='SHARED', defaultUrl='fixture-php-remote')
        t = JsonTransport(page('nofluffjobs', [first], 2, pages=2), saved, page('nofluffjobs', [second], 2, pages=2))
        result = collect_json(ImportRequest(source='nofluffjobs'), t)
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(result['diagnostics']['aliases'], 1)
        self.assertEqual(len(t.calls), 3)

    def test_nfj_references_take_precedence_over_matching_ids(self):
        first = dict(item('nofluffjobs'), reference='FIRST')
        mismatch = dict(detail('nofluffjobs', first), reference='SECOND')
        self.assertFalse(same_nfj_posting(first, mismatch))
        result = collect_json(ImportRequest(source='nofluffjobs'), JsonTransport(page('nofluffjobs', [first]), mismatch))
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['diagnostics']['rejected'], 1)
        self.assertEqual(result['records'], [])

    def test_distinct_nfj_references_are_independent_offers(self):
        first, second = dict(item('nofluffjobs'), reference='FIRST'), dict(item('nofluffjobs', 2), reference='SECOND')
        t = JsonTransport(page('nofluffjobs', [first, second]), dict(detail('nofluffjobs', first), reference='FIRST'), dict(detail('nofluffjobs', second), reference='SECOND'))
        result = collect_json(ImportRequest(source='nofluffjobs'), t)
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(len(result['records']), 2)
        self.assertEqual(result['diagnostics']['aliases'], 0)

    def test_nfj_missing_reference_uses_case_insensitive_id_fallback(self):
        first = item('nofluffjobs')
        for left, right in [('', ''), ('FIRST', ''), ('', 'SECOND'), (None, None)]:
            with self.subTest(left=left, right=right):
                self.assertTrue(same_nfj_posting(dict(first, reference=left), dict(detail('nofluffjobs', first), reference=right)))
                self.assertFalse(same_nfj_posting(dict(first, reference=left), dict(id='different', reference=right)))

    def test_nfj_canonical_url_fallbacks_and_unsafe_canonical_url(self):
        for value, slug in [(dict(defaultUrl='canonical', postingUrl='posting', id='identity'), 'canonical'), (dict(postingUrl='posting', id='identity'), 'posting'), (dict(id='identity'), 'identity')]:
            self.assertEqual(canonical_nfj_url(value), 'https://nofluffjobs.com/pl/job/' + slug)
        for slug in ['https://evil.test/x', '../private', 'x?token=secret', 'x#fragment']:
            with self.assertRaises(Stop):
                canonical_nfj_url(dict(defaultUrl=slug))

    def test_seniority_known_mismatch_filtered_unknown_and_missing_kept(self):
        for source in ['justjoinit', 'nofluffjobs']:
            for seniority, expected in [('junior', False), ('senior', True), ('future-level', True), (None, True)]:
                self.assertEqual(criteria_match(ImportRequest(source=source), item(source, seniority=seniority)), expected)

    def test_unsafe_slug_and_mismatched_detail_rejected_without_losing_good_records(self):
        for source in ['justjoinit', 'nofluffjobs']:
            good, bad = item(source), item(source, 2)
            t = JsonTransport(page(source, [good, bad]), detail(source, good), dict(id='wrong'))
            result = collect_json(ImportRequest(source=source), t)
            self.assertEqual(result['diagnostics']['rejected'], 1)
            self.assertEqual(result['status'], 'partial')
            for slug in ['https://evil.test/path', '../secret', 'x?token=secret', 'x#fragment']:
                with self.assertRaises(Stop):
                    source_urls(source, dict(good, **{('slug' if source == 'justjoinit' else 'url'): slug}))

    def test_later_transport_failures_preserve_candidates_and_close_transport(self):
        for source in ['justjoinit', 'nofluffjobs']:
            for failure, expected in [(Stop('challenge'), 'challenge'), (Stop('response_limit'), 'response_limit'), (Stop('request_limit'), 'request_limit'), (Stop('deadline'), 'deadline'), (RuntimeError('SECRET cookie'), 'fetch_or_parse_error')]:
                good = item(source)
                t = JsonTransport(page(source, [good], 2, following=7, pages=2), detail(source, good), failure)
                result = collect_json(ImportRequest(source=source), t)
                self.assertEqual(result['status'], 'partial')
                self.assertEqual(result['diagnostics']['stopReason'], expected)
                self.assertEqual(len(result['records']), 1)
                self.assertNotIn('SECRET', json.dumps(result))
                self.assertTrue(t.closed)


class JsonSession(Session):
    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response


class JsonTransportTests(unittest.TestCase):
    def test_get_post_json_mime_and_request_body(self):
        for body in [None, {'rawSearch': 'requirement=PHP', 'withSalaryMatch': False}]:
            response = Response(body=b'{"valid":true}', headers={'content-type': 'application/json; charset=utf-8'})
            session = JsonSession(response)
            transport = Transport(ImportRequest(source='nofluffjobs'), session)
            self.assertEqual(transport.read_json('https://nofluffjobs.com/api/search/posting', body), dict(valid=True))
            self.assertFalse(session.calls[0][1]['allow_redirects'])
            if body is not None:
                self.assertEqual(session.calls[0][1]['json'], body)
                self.assertEqual(session.calls[0][1]['headers']['Content-Type'], 'application/infiniteSearch+json')
            self.assertTrue(response.closed)

    def test_wrong_json_mime_nonobject_challenge_and_oversize_close_response(self):
        for response, reason in [(Response(body=b'{}'), 'invalid_content_type'), (Response(body=b'[]', headers={'content-type': 'application/json'}), 'invalid_response'), (Response(headers={'cf-mitigated': 'challenge'}), 'challenge'), (Response(body=b'x' * (8 * 1024 * 1024 + 1), headers={'content-type': 'application/json'}), 'response_limit')]:
            with self.subTest(reason=reason):
                transport = Transport(ImportRequest(source='justjoinit'), JsonSession(response))
                with self.assertRaisesRegex(Stop, reason):
                    transport.read_json('https://justjoin.it/api/candidate-api/offers')
                self.assertTrue(response.closed)


if __name__ == '__main__':
    unittest.main()
