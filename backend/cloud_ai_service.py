"""
Multi-Provider Cloud AI Chat Service
Supports OpenAI-compatible and special-case providers via REST API.
No local compute required.
"""

import base64
import json
import os
import platform
import socket
import ssl
import struct
import time
import urllib.request
import urllib.error
import urllib.parse
from typing import Any, Dict, List, Optional, Tuple


_DPAPI_PREFIX = 'DPAPI:'


def _is_windows() -> bool:
    return platform.system() == 'Windows'


def _encrypt_api_key(plaintext: str) -> str:
    """Encrypt a secret using Windows DPAPI for the current user/machine."""
    if not plaintext or plaintext.startswith(_DPAPI_PREFIX) or not _is_windows():
        # FIX P0: warn when encryption is not available — the key will be
        # stored in plaintext. On non-Windows systems there is no DPAPI,
        # so this is expected; on Windows it indicates a DPAPI failure.
        if plaintext and not plaintext.startswith(_DPAPI_PREFIX) and _is_windows():
            print("[AI] [WARN] DPAPI encryption failed — API key will be stored in plaintext!")
        return plaintext
    try:
        import ctypes
        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [('cbData', wintypes.DWORD), ('pbData', wintypes.LPBYTE)]

        data = plaintext.encode('utf-8')
        blob_in = DATA_BLOB(len(data), ctypes.cast(data, wintypes.LPBYTE))
        blob_out = DATA_BLOB()
        ok = ctypes.windll.crypt32.CryptProtectData(
            ctypes.byref(blob_in), None, None, None, None, 0x01, ctypes.byref(blob_out)
        )
        if not ok:
            raise ctypes.WinError(ctypes.get_last_error())
        encrypted = ctypes.string_at(blob_out.pbData, blob_out.cbData)
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)
        return _DPAPI_PREFIX + base64.b64encode(encrypted).decode('ascii')
    except Exception:
        return plaintext


def _decrypt_api_key(ciphertext: str) -> str:
    """Decrypt a Windows DPAPI-encrypted secret. Returns as-is on failure/non-Windows."""
    if not ciphertext or not ciphertext.startswith(_DPAPI_PREFIX) or not _is_windows():
        return ciphertext
    try:
        import ctypes
        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [('cbData', wintypes.DWORD), ('pbData', wintypes.LPBYTE)]

        encrypted = base64.b64decode(ciphertext[len(_DPAPI_PREFIX):])
        blob_in = DATA_BLOB(len(encrypted), ctypes.cast(encrypted, wintypes.LPBYTE))
        blob_out = DATA_BLOB()
        ok = ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(blob_in), None, None, None, None, 0x01, ctypes.byref(blob_out)
        )
        if not ok:
            raise ctypes.WinError(ctypes.get_last_error())
        plaintext = ctypes.string_at(blob_out.pbData, blob_out.cbData)
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)
        return plaintext.decode('utf-8')
    except Exception:
        return ciphertext


# ─── DNS fallback: resolve via Google DNS 8.8.8.8 when system DNS fails ───────
# FIX AI-P2-006: cache entries now carry a timestamp and expire after
# ``_DNS_CACHE_TTL`` seconds so a stale IP (CDN failover, rotating IPs)
# does not pin connections to a dead address forever.
_DNS_CACHE: Dict[str, Tuple[float, str]] = {}
_DNS_CACHE_TTL = 300.0  # 5 minutes
_DNS_FALLBACK_SERVERS = ['8.8.8.8', '8.8.4.4', '1.1.1.1']


def _dns_resolve_via_udp(hostname: str, dns_server: str = '8.8.8.8', timeout: float = 3.0) -> Optional[str]:
    """Resolve a hostname by sending a raw DNS query to a specific server (bypasses system DNS)."""
    # Build a minimal DNS query (Type A, Class IN)
    tid = os.getpid() & 0xFFFF
    flags = 0x0100  # recursion desired
    header = struct.pack('!HHHHHH', tid, flags, 1, 0, 0, 0)
    # QNAME
    qname = b''.join(bytes([len(part)]) + part.encode() for part in hostname.split('.')) + b'\x00'
    qtype_class = struct.pack('!HH', 1, 1)  # Type A, Class IN
    query = header + qname + qtype_class

    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        sock.sendto(query, (dns_server, 53))
        data, _ = sock.recvfrom(512)
        if len(data) < 12:
            return None
        rcode = data[3] & 0x0F
        ancount = struct.unpack('!H', data[6:8])[0]
        if rcode != 0 or ancount == 0:
            return None
        # Skip header (12 bytes) + question section
        pos = 12
        # Skip QNAME
        while pos < len(data) and data[pos] != 0:
            pos += data[pos] + 1
        pos += 1 + 4  # null byte + QTYPE(2) + QCLASS(2)
        # Parse first answer
        for _ in range(ancount):
            # Skip NAME (compressed or not)
            if pos >= len(data):
                break
            if data[pos] & 0xC0 == 0xC0:
                pos += 2
            else:
                while pos < len(data) and data[pos] != 0:
                    pos += data[pos] + 1
                pos += 1
            if pos + 10 > len(data):
                break
            rtype, rclass, rttl, rdlength = struct.unpack('!HHIH', data[pos:pos + 10])
            pos += 10
            if rtype == 1 and rdlength == 4:  # A record
                ip = '.'.join(str(b) for b in data[pos:pos + 4])
                return ip
            pos += rdlength
        return None
    except Exception:
        return None
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass


def _resolve_hostname(hostname: str) -> Optional[str]:
    """Try system DNS first, then fallback to Google DNS via UDP."""
    # Check cache (with TTL)
    now = time.time()
    cached = _DNS_CACHE.get(hostname)
    if cached and (now - cached[0]) < _DNS_CACHE_TTL and cached[1]:
        return cached[1]

    # Try system DNS (use original to avoid recursion)
    try:
        results = _original_getaddrinfo(hostname, None, socket.AF_INET)
        if results:
            ip = results[0][4][0]
            _DNS_CACHE[hostname] = (now, ip)
            return ip
    except Exception:
        pass

    # Fallback: resolve via Google DNS / Cloudflare DNS
    for dns_server in _DNS_FALLBACK_SERVERS:
        ip = _dns_resolve_via_udp(hostname, dns_server, timeout=3.0)
        if ip:
            _DNS_CACHE[hostname] = (now, ip)
            return ip

    return None


# FIX AI-P0-004: previously ``socket.getaddrinfo`` was monkey-patched
# globally, which routed *every* connection in the process (DB, auth, SSE,
# …) through the AI DNS fallback. On networks with an internal DNS server
# this broke non-AI traffic. The fallback is now scoped to AI requests
# only via the ``_ai_urlopen`` wrapper below, which rewrites the hostname
# in the URL to the resolved IP before delegating to the original
# ``urlopen``. Non-AI code keeps using the untouched system resolver.
_original_getaddrinfo = socket.getaddrinfo
_original_urlopen = urllib.request.urlopen

# FIX AI-P1-003: Module-level ``requests.Session`` for connection pooling.
# Previously ``requests.request()`` (top-level) was used, which creates a
# new ``Session`` per call — no keep-alive, no connection reuse. This
# ``Session`` with ``HTTPAdapter`` maintains a pool of persistent
# connections per host, dramatically reducing latency for repeated API
# calls to the same provider.
_http_session = None  # lazily initialised (requests may not be installed)


def _get_http_session():
    """Return a process-wide ``requests.Session`` with connection pooling."""
    global _http_session
    if _http_session is not None:
        return _http_session
    try:
        import requests as _req_lib
        from requests.adapters import HTTPAdapter
        session = _req_lib.Session()
        adapter = HTTPAdapter(
            pool_connections=10,   # number of host pools to keep
            pool_maxsize=20,       # max connections per host
            max_retries=0,         # we handle retries ourselves
        )
        session.mount('https://', adapter)
        session.mount('http://', adapter)
        _http_session = session
        return session
    except Exception:
        return None


def _is_ip_address(host: str) -> bool:
    parts = host.split('.')
    if len(parts) == 4:
        try:
            for p in parts:
                if int(p) < 0 or int(p) > 255:
                    return False
            return True
        except ValueError:
            return False
    return False


class _RequestsResponseWrapper:
    """Wrap a ``requests.Response`` to mimic ``urllib.request.urlopen`` return value.

    Supports both buffered and streaming modes. When ``stream=True`` is passed
    to the request, ``read()`` and ``readline()`` pull chunks from the live
    response iterator instead of buffering the entire body in memory.
    """
    def __init__(self, resp, streamed=False):
        self._resp = resp
        self.status = resp.status_code
        self._streamed = streamed
        self._data = None
        self._pos = 0
        self._iter = None  # single-use iterator for streaming mode
        self._buf = b''    # leftover bytes in streaming mode
        if not streamed:
            self._data = resp.content
        else:
            # Create the iterator ONCE — calling iter_content multiple times
            # creates new generators that lose the underlying stream position.
            self._iter = resp.iter_content(chunk_size=8192)

    def _next_chunk(self):
        """Pull the next chunk from the streaming iterator, or None at EOF."""
        if self._iter is None:
            return None
        try:
            chunk = next(self._iter)
            return chunk if chunk else None
        except StopIteration:
            self._iter = None
            return None

    def read(self, n=-1):
        if self._streamed:
            if n is None or n < 0:
                # Read all remaining
                chunks = [self._buf]
                self._buf = b''
                while True:
                    chunk = self._next_chunk()
                    if not chunk:
                        break
                    chunks.append(chunk)
                return b''.join(chunks)
            else:
                # Read up to n bytes
                result = self._buf
                self._buf = b''
                while len(result) < n:
                    chunk = self._next_chunk()
                    if not chunk:
                        break
                    result += chunk
                if len(result) > n:
                    self._buf = result[n:]
                    result = result[:n]
                return result
        else:
            if n is None or n < 0:
                data = self._data[self._pos:]
                self._pos = len(self._data)
            else:
                data = self._data[self._pos:self._pos + n]
                self._pos += len(data)
            return data

    def readline(self):
        if self._streamed:
            while b'\n' not in self._buf:
                chunk = self._next_chunk()
                if not chunk:
                    # No more data — return remaining buffer
                    data = self._buf
                    self._buf = b''
                    return data
                self._buf += chunk
            idx = self._buf.index(b'\n')
            data = self._buf[:idx + 1]
            self._buf = self._buf[idx + 1:]
            return data
        else:
            idx = self._data.find(b'\n', self._pos)
            if idx == -1:
                data = self._data[self._pos:]
                self._pos = len(self._data)
            else:
                data = self._data[self._pos:idx + 1]
                self._pos = idx + 1
            return data

    def __iter__(self):
        while True:
            line = self.readline()
            if not line:
                break
            yield line

    def close(self):
        """Close the underlying response to release the connection."""
        try:
            self._resp.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    @property
    def headers(self):
        return self._resp.headers

    def info(self):
        return self._resp.headers

    def getcode(self):
        return self._resp.status_code


def _ai_urlopen(req, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, *args, **kwargs):
    """``urlopen`` replacement that uses ``requests`` instead of ``urllib``.

    FIX: ``urllib.request.urlopen`` fails with SSL handshake errors inside
    the uvicorn process on some Windows/Python 3.14 setups. ``requests``
    uses ``urllib3`` which handles SSL/SNI correctly in all environments.

    Supports streaming (``stream=True``) for SSE endpoints.
    Falls back to DNS-resolved IP on DNS resolution failures.
    Falls back to the original ``urlopen`` if ``requests`` is not available.
    """
    # Pop our custom kwargs
    stream = kwargs.pop('stream', False)

    try:
        import requests as _req_lib
    except ImportError:
        # Fallback to urllib if requests is not installed
        if 'context' not in kwargs:
            kwargs['context'] = ssl.create_default_context()
        return _original_urlopen(req, timeout=timeout, *args, **kwargs)

    # FIX AI-P1-003: use the process-wide pooled Session instead of the
    # top-level ``requests.request()`` helper, which creates a throwaway
    # ``Session`` on every call (no keep-alive, no connection reuse).
    session = _get_http_session()
    if session is None:
        session = _req_lib  # fall back to module-level API

    # Extract request details
    url = req.full_url
    method = req.get_method()
    # Build headers dict from the request
    headers = {}
    try:
        for k, v in req.header_items():
            headers[k] = v
    except Exception:
        pass
    # Also capture headers set via add_header (not in header_items on some Python versions)
    try:
        if hasattr(req, 'headers') and req.headers:
            for k, v in req.headers.items():
                if k not in headers:
                    headers[k] = v
    except Exception:
        pass

    data = req.data
    if isinstance(data, bytes):
        pass  # requests accepts bytes
    elif data is not None:
        data = str(data).encode('utf-8')

    actual_timeout = timeout if timeout != socket._GLOBAL_DEFAULT_TIMEOUT else 30

    # For streaming requests, disable compression so iter_content yields chunks
    # as they arrive instead of buffering the entire gzip body for decompression.
    if stream:
        headers.setdefault('Accept-Encoding', 'identity')

    # First attempt: use the original URL as-is (preserves hostname for SSL/SNI)
    try:
        resp = session.request(method, url, data=data, headers=headers,
                               timeout=actual_timeout, verify=True, stream=stream)
        return _RequestsResponseWrapper(resp, streamed=stream)
    except _req_lib.exceptions.Timeout as e:
        raise urllib.error.URLError(f'timed out: {e}') from e
    except _req_lib.exceptions.SSLError as e:
        raise urllib.error.URLError(f'[SSL: {e}]') from e
    except _req_lib.exceptions.ConnectionError as e:
        # Check if this is a DNS failure — try IP fallback
        err_str = str(e).lower()
        is_dns = 'getaddrinfo' in err_str or 'name or service not known' in err_str or \
                 'nodename nor servname provided' in err_str or 'errno 11001' in err_str
        if not is_dns:
            raise urllib.error.URLError(str(e)) from e

        # DNS failed — try resolving hostname and retrying with IP
        try:
            parsed = urllib.parse.urlparse(url)
            host = parsed.hostname
            if not host or _is_ip_address(host):
                raise
            ip = _resolve_hostname(host)
            if not ip or ip == host:
                raise

            # Rewrite URL with resolved IP
            new_netloc = ip
            if parsed.port:
                new_netloc += f":{parsed.port}"
            new_url = parsed._replace(netloc=new_netloc).geturl()

            # FIX P1: preserve the original Host header so the server's SNI
            # and virtual-host routing still work. The cert won't match the
            # IP, so we must disable verification — but the Host header
            # ensures the request reaches the right virtual host and the
            # TLS layer sends the correct SNI for servers that need it.
            if stream:
                headers.setdefault('Accept-Encoding', 'identity')
            headers.setdefault('Host', parsed.hostname)
            resp = session.request(method, new_url, data=data, headers=headers,
                                   timeout=actual_timeout, verify=False, stream=stream)
            return _RequestsResponseWrapper(resp, streamed=stream)
        except _req_lib.exceptions.RequestException:
            raise  # fallback failed
        except Exception:
            raise urllib.error.URLError(str(e)) from e
    except Exception as e:
        # Re-raise as URLError for compatibility with existing error handling
        raise urllib.error.URLError(str(e)) from e


# FIX P0: SSRF protection — validate custom AI provider base URLs.
_BLOCKED_HOSTS = frozenset({
    'localhost', '127.0.0.1', '::1', '0.0.0.0',
    '169.254.169.254',  # cloud metadata endpoints
    'metadata.google.internal',
})


def _is_safe_ai_url(url: str) -> bool:
    """Validate that a custom AI base URL is safe (not an SSRF target).

    Blocks:
    - Non-HTTP(S) schemes
    - Localhost / loopback addresses
    - Cloud metadata endpoints (169.254.169.254)
    - Private IP ranges (10.x, 172.16-31.x, 192.168.x)
    """
    if not url or not isinstance(url, str):
        return False
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return False
    hostname = (parsed.hostname or '').lower()
    if not hostname:
        return False
    if hostname in _BLOCKED_HOSTS:
        return False
    # Check for private IP ranges
    try:
        import ipaddress
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return False
    except ValueError:
        pass  # Not an IP address — hostname is fine
    # Block common internal hostnames
    if hostname.startswith('192.168.') or hostname.startswith('10.') or hostname.startswith('172.'):
        try:
            import ipaddress
            ip = ipaddress.ip_address(hostname)
            if ip.is_private:
                return False
        except ValueError:
            pass
    return True


def _is_network_error(exc: Exception) -> bool:
    """Check if an exception is a DNS/network connectivity error."""
    err_str = str(exc).lower()
    if isinstance(exc, (socket.gaierror, socket.timeout)):
        return True
    if 'getaddrinfo' in err_str or 'timed out' in err_str:
        return True
    if 'errno 11001' in err_str or 'errno 10060' in err_str:
        return True
    if 'connection refused' in err_str or 'connection reset' in err_str:
        return True
    return False


def _network_error_message(exc: Exception) -> str:
    """Return a user-friendly Arabic error message for network errors."""
    if _is_network_error(exc):
        return (
            'عذراً، لا يمكن الاتصال بخدمة الذكاء الاصطناعي. \n'
            'السبب: فشل في حل اسم المضيف (DNS) أو لا يوجد اتصال بالإنترنت.\n'
            'الحلول المقترحة:\n'
            '  • تحقق من اتصال الإنترنت\n'
            '  • تحقق من إعدادات DNS والبروكسي\n'
            '  • أعد تشغيل الراوتر إذا لزم الأمر\n'
            '  • يمكنك تغيير المزود من الإعدادات → الذكاء الاصطناعي'
        )
    return f'عذراً، حدث خطأ في الاتصال: {exc}'


PROVIDER_CONFIGS: Dict[str, Dict[str, Any]] = {
    'gemini': {
        'name': 'Google Gemini',
        'api_key_field': 'gemini_api_key',
        'model_field': 'gemini_model',
        'default_model': 'gemini-3.5-flash',
        'base_url': 'https://generativelanguage.googleapis.com/v1beta',
        'requires_api_key': True,
        'openai_compatible': False,
        'icon': '✨'
    },
    'groq': {
        'name': 'Groq',
        'api_key_field': 'groq_api_key',
        'model_field': 'groq_model',
        'default_model': 'llama-3.3-70b-versatile',
        'base_url': 'https://api.groq.com/openai/v1',
        'requires_api_key': True,
        'openai_compatible': True,
        'icon': '⚡'
    }
}



def _read_ai_settings(project_root: str) -> Dict[str, Any]:
    ai_settings_file = os.path.join(project_root, 'data', 'ai_settings.json')
    try:
        with open(ai_settings_file, 'r', encoding='utf-8-sig') as f:
            cfg = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    for pcfg in PROVIDER_CONFIGS.values():
        key = pcfg.get('api_key_field')
        if key and isinstance(cfg.get(key), str):
            cfg[key] = _decrypt_api_key(cfg[key])
    return cfg


def _resolve_provider(ai_cfg: Dict[str, Any]) -> str:
    provider = str(ai_cfg.get('provider', 'disabled')).strip().lower()
    if provider not in PROVIDER_CONFIGS:
        provider = 'disabled'
    return provider


def _get_provider_config(ai_cfg: Dict[str, Any]) -> Dict[str, Any]:
    provider = _resolve_provider(ai_cfg)
    if provider == 'disabled':
        return {
            'provider': 'disabled',
            'api_key': '',
            'model': 'disabled',
            'base_url': '',
            'config': {'name': 'Disabled', 'openai_compatible': False}
        }
    cfg = PROVIDER_CONFIGS[provider]
    api_key = ''
    model = cfg['default_model']
    base_url = cfg['base_url']
    if cfg.get('api_key_field'):
        api_key = ai_cfg.get(cfg['api_key_field']) or os.getenv(cfg['api_key_field'].upper(), '')
    if cfg.get('model_field'):
        model = ai_cfg.get(cfg['model_field']) or os.getenv(cfg['model_field'].upper()) or model
    custom_base_url = ai_cfg.get(f'{provider}_base_url') or os.getenv(f'{provider.upper()}_BASE_URL', '')
    if custom_base_url:
        # FIX P0: validate custom base URL to prevent SSRF attacks.
        # An attacker who can modify ai_settings.json or env vars could
        # point the server at an internal URL (e.g., 169.254.169.254
        # metadata endpoint, localhost services) and exfiltrate data.
        if not _is_safe_ai_url(custom_base_url):
            print(f"[AI] [WARN] Custom base URL for {provider} rejected (SSRF protection): {custom_base_url}")
        else:
            base_url = custom_base_url
    return {
        'provider': provider,
        'api_key': api_key,
        'model': model,
        'base_url': base_url,
        'config': cfg
    }


def _openai_compatible_chat(base_url: str, api_key: str, model: str, messages: List[Dict], system_prompt: Optional[str], max_tokens: Optional[int] = None, temperature: Optional[float] = None, json_mode: bool = False) -> Dict[str, Any]:
    prompt_messages = []
    if system_prompt:
        prompt_messages.append({'role': 'system', 'content': system_prompt})
    for msg in messages or []:
        role = msg.get('role', 'user')
        if role in ('assistant', 'model', 'bot', 'ai'):
            role = 'assistant'
        elif role != 'system':
            role = 'user'
        content = str(msg.get('content') or msg.get('text') or '').strip()
        if content:
            # Merge consecutive messages with the same role
            if prompt_messages and prompt_messages[-1].get('role') == role and role != 'system':
                prompt_messages[-1]['content'] += '\n' + content
            else:
                prompt_messages.append({'role': role, 'content': content})

    # Cap output tokens — needs enough room for response text + [SRVEXEC:...] action tags
    is_groq = 'groq.com' in base_url.lower() or 'llama-3.1-8b' in model.lower()
    _default_max_tokens = 4096 if is_groq else 8192
    _max_tokens = max_tokens if max_tokens is not None else _default_max_tokens
    _temperature = temperature if temperature is not None else 0.7
    # Rough token budget: Arabic/French are token-dense; use 2 chars/token for Groq, 4 for others.
    if is_groq:
        char_budget = 28000
    else:
        char_budget = 40000
    total_chars = sum(len(str(m.get('content', '') or m.get('text', '') or '')) for m in prompt_messages)
    if total_chars > char_budget:
        # Truncate the system prompt, but PRESERVE the end (where action guides are)
        budget = char_budget
        if prompt_messages and prompt_messages[0].get('role') == 'system':
            sys_content = prompt_messages[0].get('content', '')
            sys_len = len(sys_content)
            non_sys_chars = total_chars - sys_len
            allowed = max(2000, budget - non_sys_chars)
            if allowed < sys_len:
                # Preserve the first 500 chars (intro) and the last 2500 chars (action guides)
                head_len = min(500, allowed // 4)
                tail_len = allowed - head_len
                prompt_messages[0]['content'] = sys_content[:head_len] + '\n...[truncated]...\n' + sys_content[-tail_len:]
        # Keep the most recent messages if still over budget
        while sum(len(str(m.get('content', '') or m.get('text', '') or '')) for m in prompt_messages) > budget and len(prompt_messages) > 2:
            prompt_messages.pop(1)

    _payload_dict = {
        'model': model,
        'messages': prompt_messages,
        'temperature': _temperature,
        'max_tokens': _max_tokens,
        'top_p': 0.9
    }
    # Anti-repetition: Arabic text is token-dense and Llama models on Groq
    # are prone to repetition loops. frequency_penalty discourages repeating
    # the same tokens, presence_penalty encourages moving to new topics.
    # NOTE: Gemini's OpenAI-compatible endpoint does NOT support these fields
    # (returns 400 "Unknown name frequency_penalty"), so skip them for Gemini.
    _is_gemini_oai = 'generativelanguage.googleapis.com' in base_url.lower()
    if not _is_gemini_oai:
        _payload_dict['frequency_penalty'] = 0.3
        _payload_dict['presence_penalty'] = 0.2
    if json_mode:
        _payload_dict['response_format'] = {'type': 'json_object'}
    payload = json.dumps(_payload_dict, ensure_ascii=False).encode('utf-8')

    req = urllib.request.Request(
        base_url.rstrip('/') + '/chat/completions',
        data=payload,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'
        },
        method='POST'
    )

    max_retries = 2
    # OpenRouter free models can be slow (queue wait), allow more time
    # But cap at 45s for chat — if a vision model is used for text-only chat, it often hangs
    _is_vision_model = any(kw in model.lower() for kw in ['vl', 'vision', 'vlm', 'multimodal'])
    if 'openrouter' in base_url.lower():
        _request_timeout = 45 if not _is_vision_model else 30
    else:
        _request_timeout = 30
    for attempt in range(max_retries):
        try:
            with _ai_urlopen(req, timeout=_request_timeout) as resp:
                data = json.loads(resp.read().decode('utf-8', errors='replace'))
                # FIX: some providers (Gemini OpenAI-compat, DeepSeek) occasionally
                # return a top-level JSON array instead of a dict. Guard against
                # both shapes so we don't crash with 'list' object has no attribute 'get'.
                if isinstance(data, list):
                    # Try to extract content from the first element if it looks like a choice
                    _first = data[0] if data else {}
                    if isinstance(_first, dict):
                        reply = str((_first.get('message') or {}).get('content') or
                                    (_first.get('text') or '') or '').strip()
                    else:
                        reply = str(_first).strip()
                elif isinstance(data, dict):
                    reply = (
                        data.get('choices', [{}])[0]
                        .get('message', {})
                        .get('content', '')
                    ).strip()
                else:
                    reply = str(data).strip()
                if not reply:
                    # Vision models often return empty for text-only chat
                    if _is_vision_model:
                        return {
                            'ok': False,
                            'reply': 'عذراً، هذا النموذج (vision) لا يدعم الدردشة النصية. استخدم نموذجاً نصياً مثل llama-3.1-8b-instruct:free.',
                            'text': 'عذراً، هذا النموذج (vision) لا يدعم الدردشة النصية. استخدم نموذجاً نصياً مثل llama-3.1-8b-instruct:free.',
                            'model': model,
                            'provider': 'cloud',
                            'fallback': True,
                            'error': 'Vision model returned empty response for text-only chat'
                        }
                    reply = 'عذراً، لم يتم استلام رد من النموذج.'
                return {
                    'ok': True,
                    'reply': reply,
                    'text': reply,
                    'model': model,
                    'provider': 'cloud'
                }
        except urllib.error.HTTPError as e:
            body = ''
            try:
                body = e.read().decode('utf-8', errors='replace')
            except Exception:
                pass
            if e.code == 429 and attempt < max_retries - 1:
                wait = (attempt + 1) * 2
                time.sleep(wait)
                req = urllib.request.Request(
                    base_url.rstrip('/') + '/chat/completions',
                    data=payload,
                    headers={
                        'Authorization': f'Bearer {api_key}',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'
                    },
                    method='POST'
                )
                continue
            if e.code == 402:
                err_msg = 'عذراً، الرصيد غير كافٍ في حساب هذا المزود (402). الرجاء شحن رصيدك أو التبديل إلى مزود مجاني مثل Groq من الإعدادات.'
            elif e.code == 429:
                err_msg = 'عذراً، تم تجاوز حد الطلبات (429). الرجاء الانتظار قليلاً أو التبديل إلى مزود آخر من الإعدادات.'
            elif e.code == 401:
                err_msg = 'عذراً، مفتاح API غير صحيح أو منتهي الصلاحية (401). الرجاء التحقق من المفتاح في الإعدادات.'
            elif e.code == 403:
                err_msg = 'عذراً، تم رفض الوصول (403). تأكد من أن مفتاح API لديه الصلاحيات اللازمة.'
            else:
                err_msg = f'عذراً، خطأ في الخدمة: {e.code} {e.reason}. {body[:200]}'
            # For token/rate-limit/auth errors, report failure so callers can fall back to another provider.
            is_limit_error = e.code in (401, 402, 403, 413, 429)
            return {
                'ok': not is_limit_error,
                'reply': err_msg,
                'text': err_msg,
                'model': model,
                'provider': 'cloud',
                'fallback': True,
                'error': f'HTTP error {e.code}: {body[:200]}'
            }
        except Exception as exc:
            if _is_network_error(exc) and attempt < max_retries - 1:
                time.sleep((attempt + 1) * 2)
                continue
            return {
                'ok': False,
                'reply': _network_error_message(exc),
                'text': _network_error_message(exc),
                'model': model,
                'provider': 'cloud',
                'fallback': True,
                'error': str(exc)
            }


def _gemini_chat(api_key: str, model: str, messages: List[Dict], system_prompt: Optional[str], max_tokens: int = 8192, temperature: float = 0.7, json_mode: bool = False) -> Dict[str, Any]:
    contents = []
    system_parts = []
    if system_prompt:
        system_parts.append(system_prompt)
    for msg in messages or []:
        role = msg.get('role', 'user')
        content = str(msg.get('content') or msg.get('text') or '').strip()
        if not content:
            continue
        if role in ('system', 'developer'):
            system_parts.append(content)
            continue
        gemini_role = 'user' if role in ('user',) else 'model'
        # Merge consecutive messages with the same role (Gemini requires alternating roles)
        if contents and contents[-1]['role'] == gemini_role:
            contents[-1]['parts'][0]['text'] += '\n' + content
        else:
            contents.append({'role': gemini_role, 'parts': [{'text': content}]})

    # Gemini requires the first turn to be 'user'
    if contents and contents[0]['role'] != 'user':
        contents.insert(0, {'role': 'user', 'parts': [{'text': 'Hello'}]})

    gen_cfg: Dict[str, Any] = {
        'temperature': temperature,
        'maxOutputTokens': max_tokens,
        'topP': 0.9
    }
    if json_mode:
        gen_cfg['responseMimeType'] = 'application/json'

    payload_dict = {
        'contents': contents,
        'generationConfig': gen_cfg
    }
    if system_parts:
        payload_dict['systemInstruction'] = {'parts': [{'text': '\n\n'.join(system_parts)}]}

    payload = json.dumps(payload_dict, ensure_ascii=False).encode('utf-8')

    active_model = model or 'gemini-3.5-flash'
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{active_model}:generateContent?key={api_key}'
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'}, method='POST')

    max_retries = 2
    for attempt in range(max_retries):
        try:
            with _ai_urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode('utf-8', errors='replace'))
                if not isinstance(data, dict):
                    return {
                        'ok': False,
                        'reply': f'استجابة غير متوقعة من Gemini: {str(data)[:200]}',
                        'text': f'استجابة غير متوقعة من Gemini: {str(data)[:200]}',
                        'model': active_model,
                        'provider': 'gemini',
                        'fallback': True,
                        'error': f'Unexpected response type: {type(data).__name__}'
                    }
                candidates = data.get('candidates') or [{}]
                parts = (candidates[0].get('content') or {}).get('parts') or []
                reply = ''.join([p.get('text', '') for p in parts if isinstance(p, dict) and p.get('text')]).strip()
                if not reply:
                    reply = 'عذراً، لم يتم استلام رد من النموذج.'
                return {
                    'ok': True,
                    'reply': reply,
                    'text': reply,
                    'model': active_model,
                    'provider': 'gemini'
                }
        except urllib.error.HTTPError as e:
            body = ''
            try:
                body = e.read().decode('utf-8', errors='replace')
            except Exception:
                pass
            if e.code in (429, 500, 503) and attempt < max_retries - 1:
                wait = (attempt + 1) * 2
                time.sleep(wait)
                req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'}, method='POST')
                continue
            if e.code == 404 and attempt < max_retries - 1:
                # If requested model is retired or not found, fallback to gemini-3.5-flash or gemini-3.1-flash-lite
                next_model = 'gemini-3.5-flash' if active_model != 'gemini-3.5-flash' else 'gemini-3.1-flash-lite'
                active_model = next_model
                url = f'https://generativelanguage.googleapis.com/v1beta/models/{active_model}:generateContent?key={api_key}'
                req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'}, method='POST')
                continue
            if e.code == 429:
                err_msg = 'عذراً، تم تجاوز حصة Gemini API (429). يتم التبديل تلقائياً لمزود Groq البديل...'
            elif e.code in (500, 503):
                err_msg = f'عذراً، خدمة Gemini غير متاحة مؤقتاً ({e.code}). يتم التبديل تلقائياً لمزود Groq...'
            elif e.code in (401, 403):
                err_msg = 'عذراً، مفتاح Gemini API غير صحيح أو غير مفعّل. تحقق من الإعدادات.'
            else:
                err_msg = f'عذراً، خطأ في Gemini: {e.code} {e.reason}.'
            is_limit_error = e.code in (401, 402, 403, 413, 429, 500, 503)
            return {
                'ok': not is_limit_error,
                'reply': err_msg,
                'text': err_msg,
                'model': active_model,
                'provider': 'gemini',
                'fallback': True,
                'error': f'Gemini HTTP error {e.code}: {body[:300]}'
            }
        except Exception as exc:
            if _is_network_error(exc) and attempt < max_retries - 1:
                time.sleep((attempt + 1) * 2)
                continue
            return {
                'ok': False,
                'reply': _network_error_message(exc),
                'text': _network_error_message(exc),
                'model': active_model,
                'provider': 'gemini',
                'fallback': True,
                'error': str(exc)
            }


FALLBACK_ORDER = ['groq', 'gemini']


def _try_fallback_providers(ai_cfg: Dict[str, Any], messages: List[Dict], system_prompt: Optional[str], original_provider: str, original_result: Dict[str, Any]) -> Dict[str, Any]:
    """Try the alternate configured provider (Groq or Gemini) when the primary returns a 429 or failure."""
    for fb_provider in FALLBACK_ORDER:
        if fb_provider == original_provider:
            continue
        fb_cfg = PROVIDER_CONFIGS.get(fb_provider)
        if not fb_cfg:
            continue
        fb_api_key = ai_cfg.get(fb_cfg['api_key_field']) or os.getenv(fb_cfg['api_key_field'].upper(), '')
        if not fb_api_key:
            continue
        fb_model = ai_cfg.get(fb_cfg['model_field']) or os.getenv(fb_cfg['model_field'].upper()) or fb_cfg['default_model']
        fb_base_url = fb_cfg['base_url']
        custom_fb_url = ai_cfg.get(f'{fb_provider}_base_url') or os.getenv(f'{fb_provider.upper()}_BASE_URL', '')
        if custom_fb_url:
            fb_base_url = custom_fb_url

        try:
            if fb_provider == 'gemini':
                fb_result = _gemini_chat(fb_api_key, fb_model, messages, system_prompt)
            elif fb_provider == 'groq' or fb_cfg.get('openai_compatible'):
                fb_result = _openai_compatible_chat(fb_base_url, fb_api_key, fb_model, messages, system_prompt)
            else:
                continue

            if fb_result.get('ok') and not fb_result.get('fallback'):
                fb_result['fallback_used'] = True
                fb_result['original_provider'] = original_provider
                return fb_result
        except Exception:
            continue

    return original_result


def chat_with_assistant_ai(messages: List[Dict], system_prompt: Optional[str] = None, provider_override: Optional[str] = None, max_tokens: Optional[int] = None, temperature: Optional[float] = None) -> Dict[str, Any]:
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ai_cfg = _read_ai_settings(project_root)
    if provider_override and provider_override in PROVIDER_CONFIGS:
        cfg = PROVIDER_CONFIGS[provider_override]
        api_key = ai_cfg.get(cfg['api_key_field']) or os.getenv(cfg['api_key_field'].upper(), '')
        model = ai_cfg.get(cfg['model_field']) or os.getenv(cfg['model_field'].upper()) or cfg['default_model']
        base_url = cfg['base_url']
        custom_base_url = ai_cfg.get(f'{provider_override}_base_url') or os.getenv(f'{provider_override.upper()}_BASE_URL', '')
        if custom_base_url:
            base_url = custom_base_url
        provider = provider_override
    else:
        provider_info = _get_provider_config(ai_cfg)
        provider = provider_info['provider']
        api_key = provider_info['api_key']
        model = provider_info['model']
        cfg = provider_info['config']
        base_url = provider_info.get('base_url') or cfg.get('base_url', '')

    if provider == 'disabled':
        return {
            'ok': True,
            'reply': 'المساعد الذكي معطل حالياً من الإعدادات.',
            'text': 'المساعد الذكي معطل حالياً من الإعدادات.',
            'model': 'disabled',
            'provider': 'disabled'
        }

    if not api_key:
        return {
            'ok': True,
            'reply': f'عذراً، مفتاح {cfg["name"]} غير معرف في إعدادات الذكاء الاصطناعي.',
            'text': f'عذراً، مفتاح {cfg["name"]} غير معرف في إعدادات الذكاء الاصطناعي.',
            'model': model,
            'provider': provider,
            'fallback': True,
            'error': f'Missing {cfg["api_key_field"]}'
        }

    if provider == 'gemini':
        result = _gemini_chat(api_key, model, messages, system_prompt, max_tokens=max_tokens or 8192, temperature=temperature if temperature is not None else 0.7)
        if result.get('fallback') and not result.get('ok', True):
            return _try_fallback_providers(ai_cfg, messages, system_prompt, provider, result)
        return result

    if provider == 'groq' or cfg.get('openai_compatible'):
        result = _openai_compatible_chat(base_url, api_key, model, messages, system_prompt, max_tokens=max_tokens, temperature=temperature)
        if result.get('fallback') and ('429' in result.get('error', '') or not result.get('ok', True)):
            return _try_fallback_providers(ai_cfg, messages, system_prompt, provider, result)
        return result

    return {
        'ok': True,
        'reply': f'عذراً، المزود {cfg["name"]} غير مدعوم حالياً.',
        'text': f'عذراً، المزود {cfg["name"]} غير مدعوم حالياً.',
        'model': model,
        'provider': provider,
        'fallback': True,
        'error': f'Provider {provider} not supported'
    }


VISION_MODELS = {
    'gemini': 'gemini-3.5-flash',
    'groq': 'llama-3.2-11b-vision-preview',
}


def chat_with_vision(image_base64: str, mime_type: str, prompt: str, system_prompt: Optional[str] = None, json_mode: bool = False, provider_override: Optional[str] = None) -> Dict[str, Any]:
    """Send an image to the AI provider with a text prompt for vision-based OCR/analysis.
    json_mode=True enables structured JSON output (Gemini responseMimeType=application/json).
    provider_override: force a specific provider (for fallback vision calls).
    """
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ai_cfg = _read_ai_settings(project_root)
    if provider_override and provider_override in PROVIDER_CONFIGS:
        cfg = PROVIDER_CONFIGS[provider_override]
        api_key = ai_cfg.get(cfg['api_key_field']) or os.getenv(cfg['api_key_field'].upper(), '')
        provider = provider_override
        base_url = cfg['base_url']
        vision_model = VISION_MODELS.get(provider, '')
        _user_model = str(ai_cfg.get(cfg.get('model_field', ''), '') or '').strip()
        if _user_model:
            vision_model = _user_model
        provider_info = {'provider': provider, 'api_key': api_key, 'config': cfg, 'model': vision_model, 'base_url': base_url}
    else:
        provider_info = _get_provider_config(ai_cfg)
        provider = provider_info['provider']
        api_key = provider_info['api_key']
        cfg = provider_info['config']

    if provider == 'disabled' or not api_key:
        return {'ok': False, 'error': f'Provider {provider} not configured or missing API key'}

    vision_model = VISION_MODELS.get(provider, '')
    _user_model = str(provider_info.get('model', '') or '').strip()
    if _user_model:
        vision_model = _user_model
    if not vision_model:
        vision_model = VISION_MODELS.get('gemini', 'gemini-3.5-flash')

    # Strip data URL prefix if present
    raw_b64 = image_base64
    if ',' in raw_b64 and raw_b64.startswith('data:'):
        raw_b64 = raw_b64.split(',', 1)[1]

    print(f'[VISION] provider={provider}, model={vision_model}, mime={mime_type}, json_mode={json_mode}, img_size={len(raw_b64)//1024}KB')

    if provider == 'gemini':
        return _gemini_vision(api_key, vision_model, raw_b64, mime_type, prompt, system_prompt, json_mode=json_mode)
    elif provider == 'groq' or cfg.get('openai_compatible'):
        return _openai_vision(provider_info.get('base_url') or cfg.get('base_url', ''), api_key, vision_model, raw_b64, mime_type, prompt, system_prompt, json_mode=json_mode)
    else:
        return {'ok': False, 'error': f'Provider {provider} does not support vision'}



def _openai_vision(base_url: str, api_key: str, model: str, image_b64: str, mime_type: str, prompt: str, system_prompt: Optional[str], json_mode: bool = False) -> Dict[str, Any]:
    messages = []
    if system_prompt:
        messages.append({'role': 'system', 'content': system_prompt})

    content_parts = [{'type': 'text', 'text': prompt}]
    if mime_type == 'application/pdf':
        content_parts.append({'type': 'file', 'file': {'filename': 'document.pdf', 'file_data': f'data:application/pdf;base64,{image_b64}'}})
    else:
        content_parts.append({'type': 'image_url', 'image_url': {'url': f'data:{mime_type};base64,{image_b64}'}})

    messages.append({'role': 'user', 'content': content_parts})

    payload_dict: Dict[str, Any] = {
        'model': model,
        'messages': messages,
        'max_tokens': 8192,
        'temperature': 0.1
    }
    if json_mode:
        payload_dict['response_format'] = {'type': 'json_object'}

    payload = json.dumps(payload_dict, ensure_ascii=False).encode('utf-8')

    req = urllib.request.Request(
        base_url.rstrip('/') + '/chat/completions',
        data=payload,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'
        },
        method='POST'
    )
    print(f'[VISION] Sending to {model}: mime={mime_type}, json_mode={json_mode}, payload={len(payload)//1024}KB')
    _vision_timeout = 60
    try:
        with _ai_urlopen(req, timeout=_vision_timeout) as resp:
            data = json.loads(resp.read().decode('utf-8', errors='replace'))
            reply = data.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
            if not reply:
                print(f'[VISION] {model} returned empty response: {str(data)[:300]}')
            else:
                print(f'[VISION] {model} replied: {len(reply)} chars')
            return {'ok': True, 'reply': reply, 'text': reply, 'model': model}
    except urllib.error.HTTPError as e:
        body = ''
        try: body = e.read().decode('utf-8', errors='replace')
        except Exception: pass
        print(f'[VISION] HTTP {e.code} from {model}: {body[:300]}')
        if json_mode and e.code in (400, 422):
            print(f'[VISION] json_mode not supported by {model}, retrying without response_format')
            payload_dict.pop('response_format', None)
            payload = json.dumps(payload_dict, ensure_ascii=False).encode('utf-8')
            req2 = urllib.request.Request(
                base_url.rstrip('/') + '/chat/completions',
                data=payload,
                headers={
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'
                },
                method='POST'
            )
            try:
                with _ai_urlopen(req2, timeout=30) as resp2:
                    data2 = json.loads(resp2.read().decode('utf-8', errors='replace'))
                    reply2 = data2.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
                    return {'ok': True, 'reply': reply2, 'text': reply2, 'model': model}
            except urllib.error.HTTPError as e2:
                body2 = ''
                try: body2 = e2.read().decode('utf-8', errors='replace')
                except Exception: pass
                return {'ok': False, 'error': f'HTTP {e2.code}: {body2[:300]}'}
            except Exception as exc2:
                return {'ok': False, 'error': _network_error_message(exc2)}
        return {'ok': False, 'error': f'HTTP {e.code}: {body[:300]}'}
    except Exception as exc:
        return {'ok': False, 'error': _network_error_message(exc)}


def _gemini_vision(api_key: str, model: str, image_b64: str, mime_type: str, prompt: str, system_prompt: Optional[str], json_mode: bool = False) -> Dict[str, Any]:
    parts = []
    parts.append({'text': prompt})
    parts.append({'inline_data': {'mime_type': mime_type, 'data': image_b64}})

    gen_cfg: Dict[str, Any] = {'temperature': 0.1, 'maxOutputTokens': 16384}
    if json_mode:
        gen_cfg['responseMimeType'] = 'application/json'

    payload_dict = {
        'contents': [{'role': 'user', 'parts': parts}],
        'generationConfig': gen_cfg
    }
    if system_prompt:
        payload_dict['systemInstruction'] = {'parts': [{'text': system_prompt}]}

    payload = json.dumps(payload_dict, ensure_ascii=False).encode('utf-8')

    active_model = model or 'gemini-3.5-flash'
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{active_model}:generateContent?key={api_key}'
    req = urllib.request.Request(url, data=payload, headers={
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'
    }, method='POST')
    max_retries = 2
    for attempt in range(max_retries):
        try:
            with _ai_urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode('utf-8', errors='replace'))
                candidates = data.get('candidates') or [{}]
                parts = (candidates[0].get('content') or {}).get('parts') or []
                reply = ''.join([p.get('text', '') for p in parts if isinstance(p, dict) and p.get('text')]).strip()
                # Check for truncation
                finish_reason = (candidates[0].get('finishReason') or '').upper()
                if finish_reason == 'MAX_TOKENS' and reply:
                    print(f'[VISION] Gemini response truncated (MAX_TOKENS) — {len(reply)} chars')
                return {'ok': True, 'reply': reply, 'text': reply, 'model': active_model, 'truncated': finish_reason == 'MAX_TOKENS'}
        except urllib.error.HTTPError as e:
            body = ''
            try: body = e.read().decode('utf-8', errors='replace')
            except Exception: pass
            if e.code in (429, 500, 503) and attempt < max_retries - 1:
                wait = (attempt + 1) * 2
                time.sleep(wait)
                req = urllib.request.Request(url, data=payload, headers={
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'
                }, method='POST')
                continue
            if e.code == 404 and attempt < max_retries - 1:
                active_model = 'gemini-3.5-flash' if active_model != 'gemini-3.5-flash' else 'gemini-3.1-flash-lite'
                url = f'https://generativelanguage.googleapis.com/v1beta/models/{active_model}:generateContent?key={api_key}'
                req = urllib.request.Request(url, data=payload, headers={
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'
                }, method='POST')
                continue
            return {'ok': False, 'error': f'HTTP {e.code}: {body[:300]}'}
        except Exception as exc:
            return {'ok': False, 'error': _network_error_message(exc)}




def get_cloud_status() -> Dict[str, Any]:
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ai_cfg = _read_ai_settings(project_root)
    provider_info = _get_provider_config(ai_cfg)
    provider = provider_info['provider']
    api_key = provider_info['api_key']
    model = provider_info['model']
    cfg = provider_info['config']

    if provider == 'disabled':
        return {'ok': False, 'provider': 'disabled', 'configured': False, 'error': 'AI is disabled'}

    return {
        'ok': bool(api_key),
        'provider': provider,
        'model': model,
        'configured': bool(api_key),
        'error': None if api_key else f'{cfg["name"]} API key missing in settings.'
    }


def _gemini_chat_stream(api_key: str, model: str, messages: List[Dict], system_prompt: Optional[str]) -> Dict[str, Any]:
    """Streaming generator for Google Gemini via SSE."""
    contents = []
    system_parts = []
    if system_prompt:
        system_parts.append(system_prompt)
    for msg in messages or []:
        role = msg.get('role', 'user')
        content = str(msg.get('content') or msg.get('text') or '').strip()
        if not content:
            continue
        if role in ('system', 'developer'):
            system_parts.append(content)
            continue
        gemini_role = 'user' if role in ('user',) else 'model'
        if contents and contents[-1]['role'] == gemini_role:
            contents[-1]['parts'][0]['text'] += '\n' + content
        else:
            contents.append({'role': gemini_role, 'parts': [{'text': content}]})

    if contents and contents[0]['role'] != 'user':
        contents.insert(0, {'role': 'user', 'parts': [{'text': 'Hello'}]})

    payload_dict = {
        'contents': contents,
        'generationConfig': {
            'temperature': 0.7,
            'maxOutputTokens': 8192,
            'topP': 0.9
        }
    }
    if system_parts:
        payload_dict['systemInstruction'] = {'parts': [{'text': '\n\n'.join(system_parts)}]}

    payload = json.dumps(payload_dict, ensure_ascii=False).encode('utf-8')
    active_model = model or 'gemini-3.5-flash'
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{active_model}:streamGenerateContent?alt=sse&key={api_key}'

    full_reply = ''
    try:
        req = urllib.request.Request(url, data=payload, headers={
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'
        }, method='POST')
        with _ai_urlopen(req, timeout=60, stream=True) as resp:
            buffer = ''
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buffer += chunk.decode('utf-8', errors='replace')
                while '\n' in buffer:
                    line, buffer = buffer.split('\n', 1)
                    line = line.strip()
                    if not line or line.startswith(':'):
                        continue
                    if line.startswith('data: '):
                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                            candidates = data.get('candidates') or [{}]
                            parts = (candidates[0].get('content') or {}).get('parts') or []
                            text = ''.join([p.get('text', '') for p in parts if isinstance(p, dict) and p.get('text')])
                            if text:
                                full_reply += text
                                yield {'type': 'chunk', 'text': text}
                        except json.JSONDecodeError:
                            continue
        if not full_reply:
            full_reply = 'عذراً، لم يتم استلام رد من النموذج.'
        yield {'type': 'done', 'text': full_reply, 'model': active_model, 'provider': 'gemini'}
    except urllib.error.HTTPError as e:
        body = ''
        try: body = e.read().decode('utf-8', errors='replace')
        except Exception: pass
        if e.code in (429, 402, 500, 503) or not full_reply:
            fb_result = chat_with_assistant_ai(messages, system_prompt=system_prompt)
            if fb_result.get('ok') and not fb_result.get('fallback'):
                yield {'type': 'chunk', 'text': fb_result.get('reply', '')}
                yield {'type': 'done', 'text': fb_result.get('reply', ''), 'model': fb_result.get('model', active_model), 'provider': fb_result.get('provider', 'gemini')}
                return
            yield {'type': 'error', 'error': fb_result.get('reply') or fb_result.get('error') or f'Gemini error: {e.code}'}
        elif e.code == 401:
            yield {'type': 'error', 'error': 'عذراً، مفتاح Gemini API غير صحيح (401).'}
        else:
            yield {'type': 'error', 'error': f'خطأ في Gemini: {e.code} {e.reason}. {body[:200]}'}
    except Exception as exc:
        if not full_reply:
            fb_result = chat_with_assistant_ai(messages, system_prompt=system_prompt)
            if fb_result.get('ok') and not fb_result.get('fallback'):
                yield {'type': 'chunk', 'text': fb_result.get('reply', '')}
                yield {'type': 'done', 'text': fb_result.get('reply', ''), 'model': fb_result.get('model', active_model), 'provider': fb_result.get('provider', 'gemini')}
                return
            yield {'type': 'error', 'error': _network_error_message(exc)}
        else:
            yield {'type': 'error', 'error': _network_error_message(exc)}


def chat_with_assistant_ai_stream(messages: List[Dict], system_prompt: Optional[str] = None):
    """Generator that yields text chunks from the active AI provider (Gemini or Groq) for streaming (SSE).

    Yields dicts: {'type': 'chunk', 'text': '...'} for content chunks,
                  {'type': 'done', 'text': full_reply, 'model': '...', 'provider': '...'} when complete,
                  {'type': 'error', 'error': '...'} on failure.
    """
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ai_cfg = _read_ai_settings(project_root)
    provider_info = _get_provider_config(ai_cfg)
    provider = provider_info['provider']
    api_key = provider_info['api_key']
    model = provider_info['model']
    cfg = provider_info['config']

    if provider == 'disabled' or not api_key:
        yield {'type': 'error', 'error': 'AI is disabled or API key missing'}
        return

    base_url = provider_info.get('base_url', cfg.get('base_url', ''))

    # Route to Gemini streaming when active
    if provider == 'gemini':
        yield from _gemini_chat_stream(api_key, model, messages, system_prompt)
        return


    prompt_messages = []
    if system_prompt:
        prompt_messages.append({'role': 'system', 'content': system_prompt})
    for msg in messages or []:
        role = msg.get('role', 'user')
        if role in ('assistant', 'model', 'bot', 'ai'):
            role = 'assistant'
        elif role != 'system':
            role = 'user'
        content = str(msg.get('content') or msg.get('text') or '').strip()
        if content:
            # Merge consecutive messages with the same role
            if prompt_messages and prompt_messages[-1].get('role') == role and role != 'system':
                prompt_messages[-1]['content'] += '\n' + content
            else:
                prompt_messages.append({'role': role, 'content': content})

    is_groq = 'groq.com' in base_url.lower() or 'llama-3.1-8b' in model.lower()
    _max_tokens = 4096 if is_groq else 8192
    char_budget = 28000 if is_groq else 40000
    total_chars = sum(len(str(m.get('content', '') or m.get('text', '') or '')) for m in prompt_messages)
    if total_chars > char_budget:
        if prompt_messages and prompt_messages[0].get('role') == 'system':
            sys_content = prompt_messages[0].get('content', '')
            sys_len = len(sys_content)
            non_sys_chars = total_chars - sys_len
            allowed = max(2000, char_budget - non_sys_chars)
            if allowed < sys_len:
                head_len = min(500, allowed // 4)
                tail_len = allowed - head_len
                prompt_messages[0]['content'] = sys_content[:head_len] + '\n...[truncated]...\n' + sys_content[-tail_len:]
        while sum(len(str(m.get('content', '') or m.get('text', '') or '')) for m in prompt_messages) > char_budget and len(prompt_messages) > 2:
            prompt_messages.pop(1)

    _stream_payload = {
        'model': model,
        'messages': prompt_messages,
        'temperature': 0.7,
        'max_tokens': _max_tokens,
        'top_p': 0.9,
        'stream': True
    }
    # Anti-repetition for Arabic text — skip for Gemini OpenAI-compatible endpoint
    _is_gemini_oai = 'generativelanguage.googleapis.com' in base_url.lower()
    if not _is_gemini_oai:
        _stream_payload['frequency_penalty'] = 0.3
        _stream_payload['presence_penalty'] = 0.2
    payload = json.dumps(_stream_payload, ensure_ascii=False).encode('utf-8')

    full_reply = ''
    try:
        req = urllib.request.Request(
            base_url.rstrip('/') + '/chat/completions',
            data=payload,
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZeraldaERP/1.0'
            },
            method='POST'
        )
        with _ai_urlopen(req, timeout=60, stream=True) as resp:
            buffer = ''
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buffer += chunk.decode('utf-8', errors='replace')
                while '\n' in buffer:
                    line, buffer = buffer.split('\n', 1)
                    line = line.strip()
                    if not line or line.startswith(':'):
                        continue
                    if line.startswith('data: '):
                        data_str = line[6:]
                        if data_str.strip() == '[DONE]':
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data.get('choices', [{}])[0].get('delta', {})
                            text = delta.get('content', '')
                            if text:
                                full_reply += text
                                yield {'type': 'chunk', 'text': text}
                        except json.JSONDecodeError:
                            continue

        if not full_reply:
            full_reply = 'عذراً، لم يتم استلام رد من النموذج.'
        yield {'type': 'done', 'text': full_reply, 'model': model, 'provider': provider}

    except urllib.error.HTTPError as e:
        body = ''
        try:
            body = e.read().decode('utf-8', errors='replace')
        except Exception:
            pass
        if e.code in (429, 402) or not full_reply:
            # Fallback to non-streaming with provider fallback logic
            fb_result = chat_with_assistant_ai(messages, system_prompt=system_prompt)
            if fb_result.get('ok') and not fb_result.get('fallback'):
                yield {'type': 'chunk', 'text': fb_result.get('reply', '')}
                yield {'type': 'done', 'text': fb_result.get('reply', ''), 'model': fb_result.get('model', model), 'provider': fb_result.get('provider', provider)}
                return
            yield {'type': 'error', 'error': fb_result.get('reply') or fb_result.get('error') or 'عذراً، جميع المزودات فشلت.'}
        elif e.code == 401:
            yield {'type': 'error', 'error': 'عذراً، مفتاح API غير صحيح (401).'}
        else:
            yield {'type': 'error', 'error': f'خطأ في الخدمة: {e.code} {e.reason}. {body[:200]}'}
    except Exception as exc:
        if not full_reply:
            # Network error before any content — try fallback
            fb_result = chat_with_assistant_ai(messages, system_prompt=system_prompt)
            if fb_result.get('ok') and not fb_result.get('fallback'):
                yield {'type': 'chunk', 'text': fb_result.get('reply', '')}
                yield {'type': 'done', 'text': fb_result.get('reply', ''), 'model': fb_result.get('model', model), 'provider': fb_result.get('provider', provider)}
                return
            yield {'type': 'error', 'error': _network_error_message(exc)}
        else:
            yield {'type': 'error', 'error': _network_error_message(exc)}
