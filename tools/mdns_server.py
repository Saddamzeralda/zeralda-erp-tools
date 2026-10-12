"""
Lightweight mDNS / Zeroconf Responder for Zeralda ERP
Allows any device on Wi-Fi (phones, Macs, PCs) to access:
  http://zeralda.local:8080
  http://zeralda-erp.local:8080
without configuring routers or hosts files.
"""

import socket
import struct
import threading
import time

MDNS_ADDR = "224.0.0.251"
MDNS_PORT = 5353

def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def build_dns_response(query_id, qname_bytes, ip_str):
    """Build a minimal valid DNS A response."""
    # Header: ID, Flags (0x8400 = Response, Authoritative), QDCOUNT=1, ANCOUNT=1, NSCOUNT=0, ARCOUNT=0
    header = struct.pack(">HHHHHH", query_id, 0x8400, 1, 1, 0, 0)
    
    # Question section: repeat qname, QTYPE=A (1), QCLASS=IN (1) + FLUSH (0x8001)
    question = qname_bytes + struct.pack(">HH", 1, 1)

    # Answer section: name pointer to question (0xC00C), TYPE=A (1), CLASS=IN (0x8001), TTL=120s, RDLENGTH=4, RDATA=IP
    ip_parts = [int(p) for p in ip_str.split(".")]
    ip_bytes = bytes(ip_parts)
    answer = b"\xc0\x0c" + struct.pack(">HHIH", 1, 0x8001, 120, 4) + ip_bytes

    return header + question + answer

def run_mdns_responder(stop_event=None):
    lan_ip = get_lan_ip()
    if lan_ip.startswith("127."):
        return

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    
    try:
        sock.bind(("", MDNS_PORT))
        # Join multicast group on primary interface
        mreq = struct.pack("4s4s", socket.inet_aton(MDNS_ADDR), socket.inet_aton(lan_ip))
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        sock.settimeout(2.0)
    except Exception as e:
        # Port 5353 may be bound exclusively by Windows mDNS service
        return

    targets = [b"zeralda", b"zeralda-erp"]

    while not (stop_event and stop_event.is_set()):
        try:
            data, addr = sock.recvfrom(2048)
            if len(data) < 12:
                continue
            
            # Check if any target name is queried
            data_lower = data.lower()
            for target in targets:
                if target in data_lower:
                    query_id = struct.unpack(">H", data[:2])[0]
                    # Extract QNAME
                    idx = 12
                    while idx < len(data) and data[idx] != 0:
                        idx += 1 + data[idx]
                    if idx < len(data):
                        qname = data[12:idx+1]
                        resp = build_dns_response(query_id, qname, lan_ip)
                        sock.sendto(resp, (MDNS_ADDR, MDNS_PORT))
                    break
        except socket.timeout:
            continue
        except Exception:
            break

    try:
        sock.close()
    except Exception:
        pass

def start_mdns_background():
    stop_event = threading.Event()
    t = threading.Thread(target=run_mdns_responder, args=(stop_event,), daemon=True, name="zeralda-mdns")
    t.start()
    return stop_event

if __name__ == "__main__":
    print(f"[*] Starting mDNS responder for zeralda.local on IP {get_lan_ip()}...")
    run_mdns_responder()
