"""Bounded public Next.js readers. No user credentials, proxies or hidden retries."""
from __future__ import annotations

import json
import math
import re
import time
from urllib.parse import quote

from bs4 import BeautifulSoup
from curl_cffi import requests
from curl_cffi.const import CurlHttpVersion
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["bulldogjob", "theprotocol", "justjoinit", "nofluffjobs"]
    technology: str | None = Field(default="PHP", min_length=1, max_length=80)
    seniority: Literal["junior", "mid", "senior", "expert", "lead", "staff", "principal"] | None = "senior"
    maxOffers: int = Field(default=50, ge=1, le=200, strict=True)
    maxPages: int = Field(default=5, ge=1, le=100, strict=True)
    maxRequests: int = Field(default=60, ge=1, le=250, strict=True)
    maxSeconds: int = Field(default=150, ge=1, le=150, strict=True)


class Stop(Exception):
    pass


def listing_url(query: ImportRequest, page: int) -> str:
    if query.source == "bulldogjob":
        filters = []
        if query.technology:
            filters.append("skills," + quote(query.technology, safe=""))
        if query.seniority in {"junior", "mid", "senior", "expert"}:
            filters.append("experienceLevel," + query.seniority)
        if page > 1:
            filters.append("page," + str(page))
        return "https://bulldogjob.pl/companies/jobs" + ("/s/" + "/".join(filters) if filters else "")
    path = "/filtry/" + quote(query.technology.lower(), safe="") + ";t" if query.technology else "/praca"
    return "https://theprotocol.it" + path + ("?pageNumber=" + str(page) if page > 1 else "")


def detail_url(source: str, item: dict) -> str:
    if source == "bulldogjob":
        slug = item.get("id")
        if not isinstance(slug, str) or not re.fullmatch(r"\d+-[^/?#]{1,1800}", slug):
            raise Stop("invalid_record")
        return "https://bulldogjob.pl/companies/jobs/" + quote(slug, safe="-")
    slug = item.get("offerUrlName")
    identity = item.get("id")
    if (not isinstance(slug, str) or len(slug) > 2000 or any(c in slug for c in "/?#")
            or not isinstance(identity, str) or not slug.endswith(",oferta," + identity)):
        raise Stop("invalid_record")
    return "https://theprotocol.it/praca/" + quote(slug, safe=",-")


def parse_listing(source: str, props: dict, page: int) -> tuple[list, int, int]:
    if source == "bulldogjob":
        jobs, total = props.get("jobs"), props.get("totalCount")
        state = props.get("slugState", {})
        number, size = state.get("page"), state.get("perPage")
        pages = math.ceil(total / size) if type(total) is int and type(size) is int and size > 0 else -1
    else:
        data = props.get("offersResponse") or {}
        jobs, total = data.get("offers"), data.get("offersCount")
        state = data.get("page") or {}
        number, size, pages = state.get("number"), state.get("size"), state.get("count")
    if (not isinstance(jobs, list) or type(total) is not int or not 0 <= total <= 1_000_000
            or type(size) is not int or not 1 <= size <= 100 or number != page
            or type(pages) is not int or pages not in (max(1, math.ceil(total / size)), math.ceil(total / size))
            or len(jobs) != min(size, max(0, total - (page - 1) * size))):
        raise Stop("invalid_pagination")
    return jobs, total, max(1, pages)


def seniority_matches(query: ImportRequest, listing: dict) -> bool:
    if not query.seniority:
        return True
    if query.source == "bulldogjob":
        levels = [listing.get("experienceLevel")]
    else:
        levels = [x.get("value") for x in listing.get("positionLevels", []) if isinstance(x, dict)]
    levels = [x.lower() for x in levels if isinstance(x, str) and x]
    # Missing information is retained, never interpreted as rejection.
    known = {"junior", "mid", "senior", "expert", "lead", "staff", "principal"}
    return not levels or any(level not in known for level in levels) or query.seniority in levels


class Transport:
    def __init__(self, query: ImportRequest, session=None, clock=time.monotonic, sleep=time.sleep):
        self.query, self.clock, self.sleep = query, clock, sleep
        self.deadline = clock() + query.maxSeconds
        self.last = None
        self.count = 0
        self.session = session or requests.Session(impersonate="chrome", trust_env=False)

    def read(self, url: str) -> dict:
        return self._read(url, False)

    def read_json(self, url: str, body=None) -> dict:
        return self._read(url, True, body)

    def _read(self, url: str, json_mode: bool, body=None) -> dict:
        if self.count >= self.query.maxRequests:
            raise Stop("request_limit")
        if self.last is not None:
            self.sleep(max(0, self.last + 2 - self.clock()))
        remaining = self.deadline - self.clock()
        if remaining <= 0:
            raise Stop("deadline")
        self.last = self.clock()
        self.count += 1
        options = dict(http_version=CurlHttpVersion.V2_0, timeout=min(20, remaining),
                       allow_redirects=False, stream=True)
        if body is None:
            response = self.session.get(url, **options)
        else:
            response = self.session.post(url, json=body,
                                        headers={"Content-Type": "application/infiniteSearch+json"}, **options)
        try:
            if response.headers.get("cf-mitigated", "").lower() == "challenge":
                raise Stop("challenge")
            if response.status_code != 200:
                raise Stop("http_" + str(response.status_code))
            expected = "application/json" if json_mode else "text/html"
            if expected not in response.headers.get("content-type", "").lower():
                raise Stop("invalid_content_type")
            chunks, size = [], 0
            for chunk in response.iter_content(chunk_size=65536):
                size += len(chunk)
                if size > 8 * 1024 * 1024:
                    raise Stop("response_limit")
                chunks.append(chunk)
            if json_mode:
                value = json.loads(b"".join(chunks))
                if not isinstance(value, dict):
                    raise Stop("invalid_response")
                return value
            soup = BeautifulSoup(b"".join(chunks), "html.parser")
            tag = soup.select_one("script#__NEXT_DATA__")
            if tag is None:
                raise Stop("invalid_response")
            props = json.loads(tag.get_text()).get("props", {}).get("pageProps")
            if not isinstance(props, dict):
                raise Stop("invalid_response")
            return props
        finally:
            response.close()

    def close(self):
        self.session.close()


def collect(query: ImportRequest, transport=None) -> dict:
    if query.source in {"justjoinit", "nofluffjobs"}:
        from polish_json_sources import collect_json
        return collect_json(query, transport)
    transport = transport or Transport(query)
    records, seen = [], set()
    output_size = 0
    diagnostics = dict(pages=0, totalCount=None, rejected=0, duplicates=0, filtered=0,
                       missingDescriptions=0, stopReason="exhausted", requests=0)
    reason = "exhausted"
    try:
        for page in range(1, query.maxPages + 1):
            props = transport.read(listing_url(query, page))
            items, total, pages = parse_listing(query.source, props, page)
            diagnostics["pages"] += 1
            if diagnostics["totalCount"] is None:
                diagnostics["totalCount"] = total
            elif total != diagnostics["totalCount"]:
                raise Stop("changing_pagination")
            for item in items:
                if not isinstance(item, dict):
                    diagnostics["rejected"] += 1
                    continue
                try:
                    url = detail_url(query.source, item)
                except Stop:
                    diagnostics["rejected"] += 1
                    continue
                identity = item["id"]
                if identity in seen:
                    diagnostics["duplicates"] += 1
                    continue
                seen.add(identity)
                if not seniority_matches(query, item):
                    diagnostics["filtered"] += 1
                    continue
                if len(records) >= query.maxOffers:
                    raise Stop("offer_limit")
                detail_props = transport.read(url)
                detail = ((detail_props.get("data") or {}).get("job") if query.source == "bulldogjob"
                          else detail_props.get("offer"))
                if not isinstance(detail, dict) or detail.get("id") != identity:
                    diagnostics["rejected"] += 1
                    continue
                record = dict(url=url, listing=item, detail=detail)
                record_size = len(json.dumps(record, ensure_ascii=False).encode("utf-8"))
                if output_size + record_size > 6 * 1024 * 1024:
                    raise Stop("output_limit")
                output_size += record_size
                records.append(record)
            if page >= pages:
                break
            if page == query.maxPages:
                reason = "page_limit"
    except Stop as error:
        reason = str(error)
    except Exception:
        # No server bodies, cookies or transport exception messages in diagnostics.
        reason = "fetch_or_parse_error"
    finally:
        diagnostics["requests"] = transport.count
        transport.close()
    diagnostics["stopReason"] = reason
    incomplete = reason != "exhausted" or diagnostics["rejected"] > 0 or diagnostics["duplicates"] > 0
    return dict(schemaVersion=1, source=query.source, query=query.model_dump(), records=records,
                status="partial" if incomplete and records else "failed" if incomplete else "complete",
                diagnostics=diagnostics)
