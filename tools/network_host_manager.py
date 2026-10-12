"""
================================================================================
ZERALDA ERP — NETWORK & REMOTE HOST MANAGER (مدير الاستضافة والربط الشبكي)
================================================================================
Enables local network hosting (LAN / Wi-Fi) and secure worldwide remote access
via Cloudflare Quick Tunnel (cloudflared).

Features:
  - Detects local IPv4 addresses (e.g. 192.168.100.18)
  - Manages Windows Firewall rules for port 8080 & 9090
  - Launches Cloudflare Quick Tunnel for zero-config public HTTPS access
  - Saves remote URL to data/remote_access_info.json for ERP UI integration
================================================================================
"""

import os
import sys
import json
import time
import socket
import subprocess
import threading
import re
from pathlib import Path

# Fix Windows console UTF-8 output
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
TUNNEL_INFO_FILE = DATA_DIR / "remote_access_info.json"

CLOUDFLARED_PATH = r"C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not os.path.exists(CLOUDFLARED_PATH):
    import shutil
    CLOUDFLARED_PATH = shutil.which("cloudflared") or "cloudflared"

def get_local_ip() -> str:
    """Return primary local LAN IPv4 address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_all_local_ips() -> list:
    """Return all IPv4 addresses of this machine."""
    ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    primary = get_local_ip()
    if primary != "127.0.0.1" and primary not in ips:
        ips.insert(0, primary)
    return ips

def print_banner():
    local_ip = get_local_ip()
    port = int(os.getenv("PORT", "8080"))
    print("\n" + "=" * 65)
    print("      ZERALDA ERP — NETWORK & REMOTE HOSTING MANAGER")
    print("             مدير الاستضافة والربط على الشبكة وعن بُعد")
    print("=" * 65)
    print(f" [LOCAL]   حاسوبك المحلي:         http://localhost:{port}")
    print(f" [LAN]     الشبكة المحلية (Wi-Fi): http://{local_ip}:{port}")
    print("=" * 65)

def start_cloudflare_tunnel(local_port=8080):
    """Launch Cloudflare Quick Tunnel and extract public URL."""
    print("\n[*] جاري تشغيل نفق الاتصال السحابي المشفر (Cloudflare Tunnel)...")
    cmd = [CLOUDFLARED_PATH, "tunnel", "--url", f"http://127.0.0.1:{local_port}"]
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" and "--no-window" in sys.argv else 0
        )
    except Exception as e:
        print(f"[!] فشل تشغيل cloudflared: {e}")
        return None

    public_url = None
    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

    # Monitor output for public URL
    start_time = time.time()
    for line in iter(process.stdout.readline, ''):
        if not line:
            break
        # Look for trycloudflare.com URL
        match = url_pattern.search(line)
        if match:
            public_url = match.group(0)
            break
        if time.time() - start_time > 30:
            break

    if public_url:
        print("\n" + "*" * 65)
        print(" [SUCCESS] تم تفعيل الاستضافة عن بُعد عبر الإنترنت بنجاح!")
        print(" [WORLDWIDE] رابط البرنامج للوصول من أي مكان في العالم:")
        print(f"             -->  {public_url}  <--")
        print("*" * 65)
        print(" [INFO] يمكنك نسخ الرابط وفتحه من أي هاتف أو حاسوب خارجي فوراً.")
        print("*" * 65 + "\n")

        # Save to tunnel info file
        data_payload = {
            "public_url": public_url,
            "local_port": local_port,
            "started_at": time.time(),
            "pid": process.pid
        }
        for target_dir in [DATA_DIR, Path("C:/Program Files/Zeralda ERP/data")]:
            try:
                if target_dir.exists():
                    with open(target_dir / "remote_access_info.json", "w", encoding="utf-8") as f:
                        json.dump(data_payload, f, indent=2)
            except Exception:
                pass

        try:
            # Keep tunnel running
            process.wait()
        except KeyboardInterrupt:
            print("\n[*] إيقاف النفق السحابي...")
            process.terminate()
            if TUNNEL_INFO_FILE.exists():
                TUNNEL_INFO_FILE.unlink(missing_ok=True)
    else:
        print("[!] لم يتم العثور على الرابط الخارجي خلال المهلة. تأكد من اتصال الإنترنت.")
        process.terminate()

def main():
    print_banner()
    if len(sys.argv) > 1 and sys.argv[1] in ("--tunnel", "-t", "--remote"):
        start_cloudflare_tunnel()
        return

    print("الخيارات المتاحة:")
    print(" 1. تفعيل الاستضافة عن بُعد عبر الإنترنت فوراً (Cloudflare Tunnel - Public URL)")
    print(" 2. فحص عناوين الشبكة المحلية (عرض جميع الـ IPs والروابط)")
    print(" 3. الخروج")
    
    choice = input("\nاختر رقماً (1/2/3) [الافتراضي: 1]: ").strip() or "1"
    if choice == "1":
        start_cloudflare_tunnel()
    elif choice == "2":
        print("\nعناوين الـ IP المتاحة على هذا الجهاز:")
        for ip in get_all_local_ips():
            print(f" - http://{ip}:8080")
        input("\nاضغط Enter للعودة...")
    else:
        print("تم الإنهاء.")

if __name__ == "__main__":
    main()
