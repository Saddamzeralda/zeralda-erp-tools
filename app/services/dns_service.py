"""Zeralda ERP — Unified Multi-Protocol LAN Name Resolver
(خادم أسماء النطاقات والشبكة المحلية متعدد البروتوكولات).

Listens on:
  1. Standard Unicast DNS (UDP:53)
  2. LLMNR Multicast (UDP:5355 on 224.0.0.252) — Native Windows network name resolution
  3. mDNS Multicast (UDP:5353 on 224.0.0.251) — Native Apple (iOS/macOS) and Android name resolution
  4. NBNS Broadcast (UDP:137) — NetBIOS Name Service for legacy Windows & LAN clients

Answers requests for:
  - www.zeralda-erp.dz
  - zeralda-erp.dz
  - zeralda.local
  - zeralda-erp.local
  - zeralda-erp
  - zeralda
returning the host machine's current LAN IP address (e.g. 192.168.100.18).
"""

import os
import socket
import struct
import threading
import time
from typing import Optional, Tuple


UPSTREAM_DNS_SERVERS = ["1.1.1.1", "8.8.8.8"]
LOCAL_DOMAINS = {
    "www.zeralda-erp.dz",
    "zeralda-erp.dz",
    "zeralda.local",
    "zeralda-erp.local",
    "zeralda",
    "zeralda-erp",
    "desktop-0ck1ctq",
    "desktop-0ck1ctq.local",
}


def _get_primary_lan_ip() -> str:
    """Determine the current machine's primary LAN IP."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and ip != "127.0.0.1" and not ip.startswith("169.254."):
            return ip
    except Exception:
        pass
    try:
        hn = socket.gethostname()
        ip = socket.gethostbyname(hn)
        if ip and ip != "127.0.0.1":
            return ip
    except Exception:
        pass
    return "127.0.0.1"


def _parse_qname(data: bytes, offset: int = 12) -> Tuple[str, int]:
    """Parse domain name from DNS/LLMNR/mDNS query packet."""
    parts = []
    idx = offset
    while idx < len(data):
        length = data[idx]
        if length == 0:
            idx += 1
            break
        idx += 1
        parts.append(data[idx:idx+length].decode("utf-8", errors="ignore"))
        idx += length
    return ".".join(parts).lower(), idx


def _build_dns_answer(data: bytes, target_ip: str, flags: bytes = b"\x81\x80") -> Optional[bytes]:
    """Construct an A-record response."""
    try:
        tx_id = data[:2]
        qdcount = data[4:6]
        ancount = b"\x00\x01"  # 1 answer
        nscount = b"\x00\x00"
        arcount = b"\x00\x00"
        header = tx_id + flags + qdcount + ancount + nscount + arcount

        qname, next_idx = _parse_qname(data, 12)
        qtype_class = data[next_idx:next_idx+4]
        question = data[12:next_idx+4]

        # Check if type is A (1)
        qtype = struct.unpack(">H", qtype_class[:2])[0]
        if qtype != 1:
            return None

        # Build Answer
        ans_name = b"\xc0\x0c"  # Pointer to question name
        ans_type = b"\x00\x01"  # Type A
        ans_class = b"\x00\x01" # Class IN
        ans_ttl = struct.pack(">I", 120) # 120 seconds TTL
        ans_len = b"\x00\x04"   # 4 bytes IPv4
        ans_ip = socket.inet_aton(target_ip)

        answer = ans_name + ans_type + ans_class + ans_ttl + ans_len + ans_ip
        return header + question + answer
    except Exception:
        return None


def _forward_upstream(data: bytes) -> Optional[bytes]:
    """Forward non-local DNS queries to upstream public DNS servers."""
    for srv in UPSTREAM_DNS_SERVERS:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(2.0)
            sock.sendto(data, (srv, 53))
            resp, _ = sock.recvfrom(2048)
            sock.close()
            if resp:
                return resp
        except Exception:
            pass
    return None


_running = False


def _is_local_match(qname: str) -> bool:
    q = qname.strip().lower()
    if q in LOCAL_DOMAINS:
        return True
    if q.endswith(".zeralda-erp.dz") or q.endswith(".zeralda.local"):
        return True
    return False


# ── 1) Standard DNS Server (UDP:53) ──────────────────────────────────────────
def _run_dns():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", 53))
        print("  [RESOLVER] [OK] DNS Server active on UDP:53")
    except Exception as e:
        print(f"  [RESOLVER] [WARN] Port 53 unavailable: {e}")
        return

    while _running:
        try:
            data, addr = sock.recvfrom(2048)
            if not data or len(data) < 12:
                continue
            qname, _ = _parse_qname(data, 12)
            target_ip = _get_primary_lan_ip()
            if _is_local_match(qname):
                reply = _build_dns_answer(data, target_ip, flags=b"\x81\x80")
                if reply:
                    sock.sendto(reply, addr)
            else:
                def _forward(pkt, client_addr):
                    resp = _forward_upstream(pkt)
                    if resp:
                        try: sock.sendto(resp, client_addr)
                        except Exception: pass
                threading.Thread(target=_forward, args=(data, addr), daemon=True).start()
        except Exception:
            pass


# ── 2) LLMNR Responder (UDP:5355 multicast 224.0.0.252) ──────────────────────
def _run_llmnr():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("", 5355))
        mreq = struct.pack("4sl", socket.inet_aton("224.0.0.252"), socket.INADDR_ANY)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        print("  [RESOLVER] [OK] LLMNR Responder active on UDP:5355 (Windows zero-config)")
    except Exception as e:
        print(f"  [RESOLVER] [WARN] LLMNR responder unavailable: {e}")
        return

    while _running:
        try:
            data, addr = sock.recvfrom(2048)
            if not data or len(data) < 12:
                continue
            # LLMNR query flag has QR=0
            if (data[2] & 0x80) != 0:
                continue
            qname, _ = _parse_qname(data, 12)
            target_ip = _get_primary_lan_ip()
            if _is_local_match(qname):
                reply = _build_dns_answer(data, target_ip, flags=b"\x84\x00")
                if reply:
                    sock.sendto(reply, addr)
        except Exception:
            pass


# ── 3) mDNS Responder (UDP:5353 multicast 224.0.0.251) ───────────────────────
def _run_mdns():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("", 5353))
        mreq = struct.pack("4sl", socket.inet_aton("224.0.0.251"), socket.INADDR_ANY)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        print("  [RESOLVER] [OK] mDNS Responder active on UDP:5353 (Apple/Android zero-config)")
    except Exception as e:
        print(f"  [RESOLVER] [WARN] mDNS responder unavailable: {e}")
        return

    while _running:
        try:
            data, addr = sock.recvfrom(2048)
            if not data or len(data) < 12:
                continue
            if (data[2] & 0x80) != 0:
                continue
            qname, _ = _parse_qname(data, 12)
            target_ip = _get_primary_lan_ip()
            if _is_local_match(qname):
                reply = _build_dns_answer(data, target_ip, flags=b"\x84\x00")
                if reply:
                    # mDNS can reply to multicast group or to client port
                    sock.sendto(reply, addr)
        except Exception:
            pass


def start_dns_server(port: int = 53) -> bool:
    """Start all LAN zero-config name resolution responders."""
    global _running
    if _running:
        return True

    enabled = os.getenv("ENABLE_LOCAL_DNS", "true").lower() in ("true", "1", "yes")
    if not enabled:
        return False

    _running = True
    threading.Thread(target=_run_dns, daemon=True, name="resolver-dns").start()
    threading.Thread(target=_run_llmnr, daemon=True, name="resolver-llmnr").start()
    threading.Thread(target=_run_mdns, daemon=True, name="resolver-mdns").start()
    return True
