"""
Groq-related helper services for Zeralda ERP.
Provides web-search utilities consumed by AI chat flows.
"""

import json
import re
import urllib.request
import urllib.parse
from html import unescape
from typing import Dict, List

DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/?q={query}"
DUCKDUCKGO_INSTANT_URL = "https://api.duckduckgo.com/?q={query}&format=json&no_html=1&skip_disambig=1"


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
            "title": str(data.get("Heading") or query),
            "url": str(data.get("AbstractURL") or ""),
            "snippet": abstract,
            "source": "duckduckgo-instant"
        })
    for topic in (data.get("RelatedTopics") or []):
        if len(results) >= max_results:
            break
        if isinstance(topic, dict) and topic.get("Text"):
            results.append({
                "title": str(topic.get("FirstURL") or topic.get("Text") or "")[:160],
                "url": str(topic.get("FirstURL") or ""),
                "snippet": str(topic.get("Text") or ""),
                "source": "duckduckgo-instant"
            })
    return results[:max_results]


def search_web(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    query = str(query or "").strip()
    if not query:
        return []
    try:
        url = DUCKDUCKGO_HTML_URL.format(query=urllib.parse.quote_plus(query))
        post_data = urllib.parse.urlencode({"q": query}).encode()
        req = urllib.request.Request(url, data=post_data, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded"
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="replace")
        results: List[Dict[str, str]] = []
        # Match result__a links with href containing uddg
        title_matches = re.findall(
            r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
            html, flags=re.S | re.I
        )
        # Match result__snippet blocks
        snippet_matches = re.findall(
            r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>',
            html, flags=re.S | re.I
        )
        for i, (raw_url, raw_title) in enumerate(title_matches):
            if len(results) >= max_results:
                break
            url_val = _decode_ddg_url(raw_url)
            title_val = _strip_html(raw_title)
            snippet_val = _strip_html(snippet_matches[i][0]) if i < len(snippet_matches) else ""
            if title_val and url_val:
                results.append({
                    "title": title_val[:160],
                    "url": url_val[:400],
                    "snippet": snippet_val[:400],
                    "source": "duckduckgo"
                })
        if results:
            return results[:max_results]
    except Exception:
        pass
    try:
        return _instant_search(query, max_results)
    except Exception:
        return []
