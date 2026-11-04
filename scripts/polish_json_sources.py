"""JSON source protocols, sharing bounded transport with the HTML connectors."""
from __future__ import annotations

import json
from urllib.parse import quote, urlencode
from polish_sources import ImportRequest, Stop, Transport


def search_request(query: ImportRequest, page: int, cursor: int = 0):
    if query.source == "justjoinit":
        params = {"from": cursor, "itemsCount": 50}
        if query.technology:
            params.update(keywords=query.technology, keywordType="skill", skills=query.technology)
        if query.seniority in {"junior", "mid", "senior", "expert"}:
            params["experienceLevels"] = query.seniority
        return "https://justjoin.it/api/candidate-api/offers?" + urlencode(params), None
    params = dict(pageFrom=page, pageTo=page, pageSize=20, withSalaryMatch="false",
                  salaryCurrency="original", salaryPeriod="original", region="pl", language="pl-PL")
    body = dict(rawSearch="requirement=" + query.technology if query.technology else "",
                pageSize=20, withSalaryMatch=False)
    return "https://nofluffjobs.com/api/search/posting?" + urlencode(params), body


def json_identity(source: str, item: dict, detail=False):
    value = item.get("guid") if source == "justjoinit" and not detail else item.get("id")
    if not isinstance(value, str) or not value or len(value) > 2000:
        raise Stop("invalid_record")
    return value.lower() if source == "nofluffjobs" else value


def same_nfj_posting(listing: dict, detail: dict):
    left, right = listing.get("reference"), detail.get("reference")
    if isinstance(left, str) and left and isinstance(right, str) and right:
        return left == right
    return json_identity("nofluffjobs", listing) == json_identity("nofluffjobs", detail, detail=True)


def canonical_nfj_url(detail: dict):
    slug = detail.get("defaultUrl") or detail.get("postingUrl") or detail.get("id")
    if not isinstance(slug, str) or not slug or len(slug) > 2000 or any(c in slug for c in "/?#"):
        raise Stop("invalid_record")
    return "https://nofluffjobs.com/pl/job/" + quote(slug, safe="-")


def source_urls(source: str, item: dict):
    slug = item.get("slug") if source == "justjoinit" else item.get("url") or item.get("id")
    if not isinstance(slug, str) or not slug or len(slug) > 2000 or any(c in slug for c in "/?#"):
        raise Stop("invalid_record")
    slug = quote(slug, safe="-")
    if source == "justjoinit":
        return "https://justjoin.it/job-offer/" + slug, "https://justjoin.it/api/candidate-api/offers/" + slug
    return "https://nofluffjobs.com/pl/job/" + slug, "https://nofluffjobs.com/api/posting/" + slug


def parse_json_page(source: str, data: dict, page: int, cursor: int):
    if source == "justjoinit":
        items = data.get("data")
        meta = data.get("meta") or {}
        total = meta.get("totalItems")
        following = (meta.get("next") or {}).get("cursor")
        if type(meta.get("from")) is not int or meta.get("from") != cursor or (following is not None and
                (type(following) is not int or following <= cursor)):
            raise Stop("invalid_cursor")
        last = following is None
    else:
        items, total = data.get("postings"), data.get("totalCount")
        pages = data.get("totalPages")
        if type(pages) is not int or not 0 <= pages <= 100000 or (total and pages < page):
            raise Stop("invalid_pagination")
        following = None
        last = page >= pages
    if (not isinstance(items, list) or len(items) > 1000 or type(total) is not int
            or not 0 <= total <= 1_000_000 or (total > 0 and not items) or (total == 0 and items)):
        raise Stop("invalid_pagination")
    return items, total, following, last


def criteria_match(query: ImportRequest, item: dict):
    level = item.get("experienceLevel") if query.source == "justjoinit" else item.get("seniority")
    levels = level if isinstance(level, list) else [level]
    levels = [x.lower() for x in levels if isinstance(x, str) and x]
    known = {"intern", "junior", "mid", "senior", "expert", "lead", "staff", "principal", "manager", "c_level"}
    if query.seniority and levels and all(x in known for x in levels) and query.seniority not in levels:
        return False
    return True


def collect_json(query: ImportRequest, transport=None):
    transport = transport or Transport(query)
    records, seen, cursors = [], set(), {0}
    groups = set()
    cursor, size = 0, 0
    expected_pages = None
    diagnostics = dict(pages=0, totalCount=None, rejected=0, duplicates=0, filtered=0,
                       missingDescriptions=0, aliases=0, stopReason="exhausted", requests=0)
    reason = "exhausted"
    try:
        for page in range(1, query.maxPages + 1):
            url, body = search_request(query, page, cursor)
            data = transport.read_json(url, body)
            items, total, following, last = parse_json_page(query.source, data, page, cursor)
            diagnostics["pages"] += 1
            if query.source == "nofluffjobs":
                if expected_pages is None:
                    expected_pages = data["totalPages"]
                elif expected_pages != data["totalPages"]:
                    raise Stop("changing_pagination")
            if diagnostics["totalCount"] is None:
                diagnostics["totalCount"] = total
            elif diagnostics["totalCount"] != total:
                raise Stop("changing_pagination")
            for item in items:
                try:
                    if not isinstance(item, dict):
                        raise Stop("invalid_record")
                    identity = json_identity(query.source, item)
                    public_url, api_url = source_urls(query.source, item)
                except Stop:
                    diagnostics["rejected"] += 1
                    continue
                if identity in seen:
                    diagnostics["duplicates"] += 1
                    continue
                seen.add(identity)
                reference = item.get("reference") if query.source == "nofluffjobs" else None
                group = reference if isinstance(reference, str) and reference else None
                if group and group in groups:
                    diagnostics["aliases"] += 1
                    continue
                if not criteria_match(query, item):
                    diagnostics["filtered"] += 1
                    continue
                if len(records) >= query.maxOffers:
                    raise Stop("offer_limit")
                detail = transport.read_json(api_url)
                try:
                    matches = (same_nfj_posting(item, detail) if query.source == "nofluffjobs"
                               else json_identity(query.source, detail, detail=True) == identity)
                    if not matches:
                        raise Stop("invalid_record")
                    if query.source == "nofluffjobs":
                        public_url = canonical_nfj_url(detail)
                except Stop:
                    diagnostics["rejected"] += 1
                    continue
                record = dict(url=public_url, listing=item, detail=detail)
                length = len(json.dumps(record, ensure_ascii=False).encode("utf-8"))
                if size + length > 6 * 1024 * 1024:
                    raise Stop("output_limit")
                size += length
                records.append(record)
                if group:
                    groups.add(group)
            if last or (query.source == "justjoinit" and len(seen) == total):
                if len(seen) != total:
                    reason = "incomplete_count"
                elif query.source == "justjoinit" and total >= 10000:
                    reason = "source_limit"
                break
            if following is not None:
                if following in cursors:
                    raise Stop("cursor_loop")
                cursors.add(following)
                cursor = following
            if page == query.maxPages:
                reason = "page_limit"
    except Stop as error:
        reason = str(error)
    except Exception:
        reason = "fetch_or_parse_error"
    finally:
        diagnostics["requests"] = transport.count
        transport.close()
    diagnostics["stopReason"] = reason
    incomplete = reason != "exhausted" or diagnostics["rejected"] > 0 or diagnostics["duplicates"] > 0
    return dict(schemaVersion=1, source=query.source, query=query.model_dump(), records=records,
                status="partial" if incomplete and records else "failed" if incomplete else "complete", diagnostics=diagnostics)
