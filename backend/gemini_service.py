"""
Web Search Utilities for Zeralda ERP
======================================
DuckDuckGo search integration (no API key required).
"""

import json
import re
import urllib.request
import urllib.parse
from html import unescape
from typing import Dict, List

DUCKDUCKGO_HTML_URL    = "https://html.duckduckgo.com/html/?q={query}"
DUCKDUCKGO_INSTANT_URL = "https://api.duckduckgo.com/?q={query}&format=json&no_html=1&skip_disambig=1"


# ── Web Search (DuckDuckGo) ────────────────────────────────────────────────────
def _strip_html(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw or "")
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _decode_ddg_url(url: str) -> str:
    raw = unescape(str(url or "")).replace("&amp;", "&")
    parsed = urllib.parse.urlparse(raw)
    params = urllib.parse.parse_qs(parsed.query)
    target = params.get("uddg", [""])[0]
    if target:
        return urllib.parse.unquote(target)
    return "https:" + raw if raw.startswith("//") else raw


def _instant_search(query: str, max_results: int) -> List[Dict[str, str]]:
    url = DUCKDUCKGO_INSTANT_URL.format(query=urllib.parse.quote_plus(query))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read().decode("utf-8", errors="replace"))
    results: List[Dict[str, str]] = []
    abstract = str(data.get("AbstractText") or "").strip()
    if abstract:
        results.append({
            "title":   str(data.get("Heading") or query),
            "url":     str(data.get("AbstractURL") or ""),
            "snippet": abstract,
            "source":  "duckduckgo-instant"
        })
    for topic in (data.get("RelatedTopics") or []):
        if len(results) >= max_results:
            break
        if isinstance(topic, dict) and topic.get("Text"):
            results.append({
                "title":   str(topic.get("FirstURL") or topic.get("Text") or "")[:160],
                "url":     str(topic.get("FirstURL") or ""),
                "snippet": str(topic.get("Text") or ""),
                "source":  "duckduckgo-instant"
            })
    return results[:max_results]


def search_web(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    query = str(query or "").strip()
    if not query:
        return []
    try:
        url = DUCKDUCKGO_HTML_URL.format(query=urllib.parse.quote_plus(query))
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="replace")
        blocks = re.findall(
            r'<div[^>]+class="[^"]*result[^"]*"[^>]*>(.*?)</div>\s*</div>',
            html, flags=re.S | re.I
        )
        results: List[Dict[str, str]] = []
        for block in blocks:
            if len(results) >= max_results:
                break
            m_title = re.search(
                r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
                block, flags=re.S | re.I
            ) or re.search(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', block, flags=re.S | re.I)
            if not m_title:
                continue
            url_val   = _decode_ddg_url(m_title.group(1))
            title_val = _strip_html(m_title.group(2))
            m_snip = (
                re.search(r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>', block, flags=re.S | re.I) or
                re.search(r'<div[^>]+class="[^"]*snippet[^"]*"[^>]*>(.*?)</div>', block, flags=re.S | re.I)
            )
            snippet_val = _strip_html(m_snip.group(1) if m_snip else "")
            if title_val and url_val:
                results.append({
                    "title":   title_val[:160],
                    "url":     url_val[:400],
                    "snippet": snippet_val[:400],
                    "source":  "duckduckgo"
                })
        if results:
            return results[:max_results]
    except Exception:
        pass
    try:
        return _instant_search(query, max_results)
    except Exception:
        return []


