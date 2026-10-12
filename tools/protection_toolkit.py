#!/usr/bin/env python3
"""
Zeralda ERP — Protection Toolkit
=================================
برنامج موحد لإدارة واختبار نظام حماية حقوق المطور

يجمع في واجهة واحدة:
  1. توليد وإدارة مفاتيح التفعيل (keygen) + التراخيص (license)
  2. لوحة الإحصائيات (analytics) — أجهزة، أحداث، نشاط مشبوه
  3. تعمية الكود (obfuscation) — JS + Python
  4. فحص سلامة الملفات (integrity check)
  5. اختبار شامل للنظام الموحد

التشغيل:
  python tools/protection_toolkit.py
  python tools/protection_toolkit.py --gui    (واجهة رسومية)
"""
from __future__ import annotations

import os
import sys
import json
import time
import base64
import hashlib
import datetime

# ── Force UTF-8 output (Windows console defaults to cp1252) ────────────────
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ── Setup paths ────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))
if '__file__' in dir() else os.getcwd())
# When run from tools/ subfolder, BASE_DIR is the parent
if os.path.basename(os.path.dirname(os.path.abspath(__file__))) == 'tools':
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, BASE_DIR)
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("AUTH_DISABLED_IN_DEV", "true")

# ── Colors (Windows-compatible) ────────────────────────────────────────────
class C:
    R = "\033[0m"
    BOLD = "\033[1m"
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    GRAY = "\033[90m"

# Enable ANSI colors on Windows
if sys.platform == "win32":
    try:
        os.system("")  # enables VT100
    except Exception:
        pass


def _header(title):
    width = 64
    print()
    print(C.CYAN + "=" * width + C.R)
    print(C.CYAN + C.BOLD + f"  {title}".ljust(width) + C.R)
    print(C.CYAN + "=" * width + C.R)


def _ok(msg):
    print(f"  {C.GREEN}✅{C.R} {msg}")

def _warn(msg):
    print(f"  {C.YELLOW}⚠️ {C.R} {msg}")

def _err(msg):
    print(f"  {C.RED}❌{C.R} {msg}")

def _info(msg):
    print(f"  {C.BLUE}ℹ️ {C.R} {msg}")

def _ts(ts):
    if not ts:
        return "—"
    try:
        return datetime.datetime.fromtimestamp(int(ts)).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return str(ts)

def _time_ago(ts):
    if not ts:
        return "—"
    diff = int(time.time()) - int(ts)
    if diff < 60:
        return f"منذ {diff}ث"
    if diff < 3600:
        return f"منذ {diff//60}د"
    if diff < 86400:
        return f"منذ {diff//3600}س"
    return f"منذ {diff//86400}ي"


# ═══════════════════════════════════════════════════════════════════════════
#  MODULE 1: Keygen + License (Unified)
# ═══════════════════════════════════════════════════════════════════════════

def mod_generate_key():
    """توليد مفتاح تفعيل + ترخيص RSA مرتبط"""
    _header("توليد مفتاح تفعيل + ترخيص")
    phone = input("  رقم الهاتف (مثال: +213661234567): ").strip()
    if not phone:
        _err("رقم الهاتف مطلوب"); return
    email = input("  البريد الإلكتروني (اختياري): ").strip() or None
    expires = input("  صلاحية الترخيص بالأيام (0=دائم): ").strip() or "0"
    try:
        expires = int(expires)
    except ValueError:
        expires = 0

    from backend import keygen_service
    result = keygen_service.generate_key(phone, user_email=email,
                                          license_expires_days=expires, force_new=True)
    if result.get("ok"):
        _ok("تم التوليد بنجاح!")
        print(f"     المفتاح (keygen):  {C.BOLD}{result['key']}{C.R}")
        if result.get("licenseKey"):
            print(f"     الترخيص (license): {C.BOLD}{result['licenseKey']}{C.R}")
            print(f"     {C.GREEN}النظام الموحد: keygen + RSA license مرتبطان{C.R}")
        else:
            _warn("لم يتم إنشاء ترخيص مرتبط (license_service غير متاح)")
        print(f"     الهاتف: {result.get('phone')}")
    else:
        _err(result.get("error", "فشل التوليد"))
    _pause()


def mod_list_unified():
    """عرض موحد للمفاتيح + التراخيص"""
    _header("العرض الموحد: المفاتيح + التراخيص")
    from backend import keygen_service
    result = keygen_service.list_unified()
    if result["count"] == 0:
        _info("لا توجد مفاتيح"); _pause(); return

    print(f"\n  {C.GRAY}إجمالي: {result['count']} مفتاح{C.R}\n")
    print(f"  {'المفتاح':<22} {'الهاتف':<18} {'الترخيص':<28} {'نشط':<6} {'مربوط':<8}")
    print(f"  {'-'*22} {'-'*18} {'-'*28} {'-'*6} {'-'*8}")
    for e in result["keys"]:
        key = e["key"]
        phone = e.get("phone") or "—"
        active = f"{C.GREEN}نعم{C.R}" if e.get("active") else f"{C.RED}لا{C.R}"
        lic = e.get("license") or {}
        lk = lic.get("licenseKey", "—")
        hw = f"{C.GREEN}نعم{C.R}" if lic.get("hwFingerprint") else "لا"
        print(f"  {key:<22} {phone:<18} {lk:<28} {active:<6} {hw:<8}")
    _pause()


def mod_show_license():
    """عرض ترخيص مرتبط بمفتاح"""
    _header("عرض ترخيص مرتبط")
    key = input("  أدخل المفتاح (KEY-XXXX-XXXX-XXXX): ").strip().upper()
    if not key:
        _err("المفتاح مطلوب"); return
    from backend import keygen_service
    result = keygen_service.get_license_for_key(key)
    if result.get("ok"):
        p = result["payload"]
        _ok("ترخيص مرتبط موجود!")
        print(f"     المفتاح:     {key}")
        print(f"     الترخيص:     {result['licenseKey']}")
        print(f"     النوع:       {p.get('type', '?')}")
        print(f"     العميل:      {p.get('customer', '?')}")
        print(f"     الهاتف:      {p.get('phone', '?')}")
        print(f"     البريد:      {p.get('email', '—')}")
        print(f"     أجهزة مسموحة: {p.get('maxDevices', 1)}")
        hw = p.get("hwFingerprint", "")
        print(f"     مربوط بجهاز: {'نعم (' + p.get('hwId', '') + ')' if hw else 'لا'}")
        print(f"     ملغى:        {p.get('revoked', False)}")
        exp = p.get("expiresAt", 0)
        if exp and exp > 0:
            print(f"     ينتهي:       {_ts(exp)}")
        else:
            print(f"     ينتهي:       دائم")
    else:
        _err(result.get("error", "لا يوجد ترخيص مرتبط"))
    _pause()


def mod_revoke_key():
    """إلغاء مفتاح + ترخيصه المرتبط"""
    _header("إلغاء مفتاح + ترخيص")
    key = input("  أدخل المفتاح للإلغاء (KEY-XXXX-XXXX-XXXX): ").strip().upper()
    if not key:
        _err("المفتاح مطلوب"); return
    confirm = input(f"  {C.RED}تأكيد إلغاء {key}؟ (yes/no): {C.R}").strip().lower()
    if confirm != "yes":
        _info("تم الإلغاء"); _pause(); return
    from backend import keygen_service
    result = keygen_service.revoke_key(key)
    if result.get("ok"):
        _ok(result["message"])
    else:
        _err(result.get("error", "فشل الإلغاء"))
    _pause()


def mod_test_login():
    """محاكاة تسجيل دخول بمفتاح + تفعيل ترخيص"""
    _header("محاكاة تسجيل دخول + تفعيل ترخيص")
    phone = input("  الهاتف: ").strip()
    key = input("  المفتاح: ").strip().upper()
    hw_fp = input("  بصمة الهاردوير (أو اترك فارغ للتوليد التلقائي): ").strip()
    if not hw_fp:
        hw_fp = hashlib.sha256(os.urandom(32)).hexdigest()[:32]
    hw_id = input("  معرف الجهاز (أو اترك فارغ): ").strip() or f"HW-{hw_fp[:4].upper()}-{hw_fp[4:8].upper()}-{hw_fp[8:12].upper()}-{hw_fp[12:16].upper()}"

    from backend import keygen_service
    from app.services import license_service

    # Authenticate
    auth = keygen_service.authenticate_with_key(phone, key)
    if not auth.get("ok"):
        _err(f"فشل المصادقة: {auth.get('error')}"); _pause(); return
    _ok("المصادقة نجحت")

    # Find linked license
    record = license_service.find_license_by_keygen_key(key)
    if not record:
        _warn("لا يوجد ترخيص مرتبط"); _pause(); return

    lic_key = record["payload"]["licenseKey"]
    _info(f"الترخيص المرتبط: {lic_key}")

    # Activate
    activation = license_service.activate_license_for_hw(lic_key, hw_fp, hw_id)
    if activation.get("ok"):
        _ok("تم تفعيل الترخيص على الجهاز!")
        print(f"     الجهاز: {hw_id}")
        print(f"     البصمة: {hw_fp[:16]}...")
        print(f"     signedPayload: {len(activation['signedPayload'])} حرف")
        # Verify signature
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding
            sp = activation["signedPayload"]
            parts = sp.split(".")
            pb = parts[0].replace("-", "+").replace("_", "/")
            sb = parts[1].replace("-", "+").replace("_", "/")
            pb += "=" * ((4 - len(pb) % 4) % 4)
            sb += "=" * ((4 - len(sb) % 4) % 4)
            pbuf = base64.b64decode(pb)
            sbuf = base64.b64decode(sb)
            pub_path = os.path.join(BASE_DIR, "data", "license_public_key.pem")
            with open(pub_path, "rb") as f:
                pub = serialization.load_pem_public_key(f.read())
            pub.verify(sbuf, pbuf,
                padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=hashes.SHA256().digest_size),
                hashes.SHA256())
            _ok("التوقيع RSA صالح ✓")
        except Exception as e:
            _err(f"التوقيع غير صالح: {e}")
    else:
        _err(f"فشل التفعيل: {activation.get('error')} (code: {activation.get('code')})")
    _pause()


# ═══════════════════════════════════════════════════════════════════════════
#  MODULE 2: Analytics (الإحصائيات)
# ═══════════════════════════════════════════════════════════════════════════

def mod_analytics_dashboard():
    """لوحة الإحصائيات"""
    _header("لوحة إحصائيات الحماية")
    from app.services import license_service
    stats = license_service.get_usage_stats()
    s = stats["summary"]

    # Summary cards
    print(f"\n  {C.BOLD}📊 الملخص{C.R}")
    print(f"  ┌─────────────────┬─────────────────┬─────────────────┐")
    print(f"  │ {C.CYAN}الأجهزة: {s['totalDevices']:<5}{C.R}     │ "
          f"{C.GREEN}نشط 24س: {s['activeDevices24h']:<5}{C.R} │ "
          f"{C.YELLOW}أحداث 24س: {s['events24h']:<5}{C.R}     │")
    print(f"  ├─────────────────┼─────────────────┼─────────────────┤")
    print(f"  │ {C.CYAN}التراخيص: {s['totalLicenses']:<5}{C.R}    │ "
          f"{C.GREEN}نشطة: {s['activeLicenses']:<9}{C.R} │ "
          f"{C.RED}ملغاة: {s['revokedLicenses']:<10}{C.R}  │")
    print(f"  └─────────────────┴─────────────────┴─────────────────┘")

    # Suspicious activity
    susp = stats.get("suspicious", [])
    print(f"\n  {C.BOLD}🚨 النشاط المشبوه ({len(susp)}){C.R}")
    if not susp:
        _ok("لا يوجد نشاط مشبوه")
    else:
        for a in susp:
            icon = "🔴" if a["severity"] == "high" else "🟡"
            print(f"  {icon} [{a['severity'].upper()}] {a['type']}")
            print(f"     {a['detail']}")

    # Devices
    devices = stats.get("devices", [])
    print(f"\n  {C.BOLD}💻 الأجهزة ({len(devices)}){C.R}")
    if devices:
        print(f"  {'الجهاز':<20} {'الهاتف':<16} {'تراخيص':<8} {'أحداث':<8} {'آخر ظهور':<14} {'الحالة'}")
        print(f"  {'-'*20} {'-'*16} {'-'*8} {'-'*8} {'-'*14} {'-'*8}")
        for d in devices[:15]:
            hw = d.get("hwId", "—")[:20]
            ph = d.get("phone", "—")[:16]
            lks = len(d.get("licenseKeys", []))
            ev = d.get("eventCount", 0)
            last = _time_ago(d.get("lastSeen"))
            status = f"{C.GREEN}نشط{C.R}" if d.get("status") == "active" else f"{C.GRAY}خامل{C.R}"
            print(f"  {hw:<20} {ph:<16} {lks:<8} {ev:<8} {last:<14} {status}")
        if len(devices) > 15:
            print(f"  {C.GRAY}... و {len(devices)-15} جهاز آخر{C.R}")

    # Recent events
    events = stats.get("recentEvents", [])
    print(f"\n  {C.BOLD}📋 آخر الأحداث ({len(events)}){C.R}")
    if events:
        type_icons = {
            "activation": "🟢", "heartbeat": "💓", "revocation": "🔴",
            "tampering": "🐛", "hw_mismatch": "⚠️", "max_devices": "👥",
            "login_with_key": "🔑",
        }
        for e in events[:10]:
            icon = type_icons.get(e.get("type"), "•")
            t = _ts(e.get("ts"))
            typ = e.get("type", "?")
            hw = e.get("hwId", "—")[:16]
            ip = e.get("ip", "—")
            print(f"  {icon} {t}  {typ:<16} {hw:<16} {ip}")
        if len(events) > 10:
            print(f"  {C.GRAY}... و {len(events)-10} حدث آخر{C.R}")
    _pause()


def mod_analytics_clear():
    """مسح سجل الإحصائيات"""
    _header("مسح سجل الإحصائيات")
    confirm = input(f"  {C.RED}تأكيد مسح جميع البيانات؟ (yes/no): {C.R}").strip().lower()
    if confirm != "yes":
        _info("تم الإلغاء"); _pause(); return
    from app.services import license_service
    r = license_service.clear_usage_log()
    _ok(r["message"])
    _pause()


def mod_analytics_simulate():
    """محاكاة أحداث للاختبار"""
    _header("محاكاة أحداث (للاختبار)")
    from app.services import license_service
    print("  تسجيل 5 أحداث تجريبية...")
    license_service.log_usage_event("activation", license_key="ZERALDA-SIM-1",
        hw_fingerprint="sim-fp-1", hw_id="HW-SIM-1", phone="+213111", ip="192.168.1.1")
    license_service.log_usage_event("heartbeat", license_key="ZERALDA-SIM-1",
        hw_fingerprint="sim-fp-1", hw_id="HW-SIM-1", ip="192.168.1.1")
    license_service.log_usage_event("activation", license_key="ZERALDA-SIM-2",
        hw_fingerprint="sim-fp-2", hw_id="HW-SIM-2", phone="+213222", ip="10.0.0.5")
    license_service.log_usage_event("hw_mismatch", license_key="ZERALDA-SIM-1",
        hw_fingerprint="sim-fp-3", hw_id="HW-SIM-3")
    license_service.log_usage_event("activation", license_key="ZERALDA-SIM-1",
        hw_fingerprint="sim-fp-3", hw_id="HW-SIM-3")
    _ok("تم تسجيل 5 أحداث")
    _info("تشغيل 'لوحة الإحصائيات' لرؤية النشاط المشبوه")
    _pause()


# ═══════════════════════════════════════════════════════════════════════════
#  MODULE 3: Obfuscation (تعمية الكود)
# ═══════════════════════════════════════════════════════════════════════════

def mod_obfuscate_js():
    """تعمية ملفات JS"""
    _header("تعمية ملفات JavaScript")
    from tools.obfuscate_js import obfuscate_all
    results = obfuscate_all()
    if results:
        _ok(f"تم تعمية {len(results)} ملف")
        for r in results:
            print(f"     {r['file']}: {r['original_size']}B → {r['obfuscated_size']}B ({r['ratio']})")
    else:
        _warn("لم يتم تعمية أي ملف")
    _pause()


def mod_obfuscate_py():
    """تعمية ملفات Python"""
    _header("تعمية ملفات Python")
    from tools.obfuscate_py import obfuscate_all
    results = obfuscate_all()
    if results:
        _ok(f"تم تعمية {len(results)} ملف")
        for r in results:
            print(f"     {r['file']}: {r['original_size']}B → {r['obfuscated_size']}B ({r['ratio']})")
    else:
        _warn("لم يتم تعمية أي ملف")
    _pause()


def mod_restore_js():
    """استعادة ملفات JS الأصلية"""
    _header("استعادة ملفات JavaScript الأصلية")
    from tools.obfuscate_js import restore_all
    results = restore_all()
    if results:
        _ok(f"تم استعادة {len(results)} ملف")
    else:
        _warn("لم يتم استعادة أي ملف")
    _pause()


def mod_restore_py():
    """استعادة ملفات Python الأصلية"""
    _header("استعادة ملفات Python الأصلية")
    from tools.obfuscate_py import restore_all
    results = restore_all()
    if results:
        _ok(f"تم استعادة {len(results)} ملف")
    else:
        _warn("لم يتم استعادة أي ملف")
    _pause()


def mod_obfuscate_all():
    """تعمية كل الملفات (JS + Python)"""
    _header("تعمية شاملة (JS + Python)")
    from tools.obfuscate_js import obfuscate_all as obf_js
    from tools.obfuscate_py import obfuscate_all as obf_py
    print("  تعمية JavaScript...")
    r1 = obf_js()
    print("  تعمية Python...")
    r2 = obf_py()
    _ok(f"إجمالي: {len(r1)} JS + {len(r2)} Python = {len(r1)+len(r2)} ملف")
    _pause()


def mod_restore_all():
    """استعادة كل الملفات الأصلية"""
    _header("استعادة شاملة (JS + Python)")
    from tools.obfuscate_js import restore_all as rest_js
    from tools.obfuscate_py import restore_all as rest_py
    print("  استعادة JavaScript...")
    r1 = rest_js()
    print("  استعادة Python...")
    r2 = rest_py()
    _ok(f"إجمالي: {len(r1)} JS + {len(r2)} Python = {len(r1)+len(r2)} ملف")
    _pause()


# ═══════════════════════════════════════════════════════════════════════════
#  MODULE 4: Integrity (فحص السلامة)
# ═══════════════════════════════════════════════════════════════════════════

def mod_integrity_check():
    """فحص سلامة الملفات الحرجة"""
    _header("فحص سلامة الملفات الحرجة")
    from app.services import license_service
    result = license_service.check_integrity(strict=False)
    checked = result.get("checked", 0)
    mismatches = result.get("mismatches", [])
    if result.get("ok"):
        _ok(f"جميع الملفات سليمة ({checked} ملف)")
    else:
        _warn(f"تم العثور على {len(mismatches)} ملف معدل:")
        for m in mismatches:
            print(f"     {C.RED}{m.get('file', '?')}{C.R}")
            print(f"       متوقع: {m.get('expected', '')[:20]}...")
            print(f"       فعلي:  {m.get('actual', '')[:20]}...")
    _pause()


def mod_integrity_reset():
    """إعادة تسجيل hashes الملفات"""
    _header("إعادة تسجيل hashes الملفات")
    confirm = input("  تأكيد؟ سيتم تحديث الـ hashes (yes/no): ").strip().lower()
    if confirm != "yes":
        _info("تم الإلغاء"); _pause(); return
    from app.services import license_service
    r = license_service.reset_integrity()
    _ok(f"تم تسجيل {r.get('registered', 0)} ملف")
    _pause()


# ═══════════════════════════════════════════════════════════════════════════
#  MODULE 5: Full Test (اختبار شامل)
# ═══════════════════════════════════════════════════════════════════════════

def mod_full_test():
    """اختبار شامل لكل النظام"""
    _header("اختبار شامل للنظام الموحد")
    from backend import keygen_service
    from app.services import license_service

    TEST_PHONE = "+213661234567"
    TEST_EMAIL = "test@toolkit.dz"
    TEST_HW_FP = "toolkit-test-fp-abc123"
    TEST_HW_ID = "HW-TOOLKIT-1234-5678-ABCD"
    passed = 0
    failed = 0

    def test(name, condition, detail=""):
        nonlocal passed, failed
        if condition:
            _ok(f"{name} {detail}")
            passed += 1
        else:
            _err(f"{name} {detail}")
            failed += 1

    # Test 1: Generate keygen + linked license
    print(f"\n  {C.BOLD}1️⃣  توليد مفتاح + ترخيص مرتبط{C.R}")
    result = keygen_service.generate_key(TEST_PHONE, user_email=TEST_EMAIL, force_new=True)
    test("توليد المفتاح", result.get("ok"), result.get("key", ""))
    test("إنشاء ترخيص مرتبط", bool(result.get("licenseKey")), result.get("licenseKey", "NONE"))
    keygen_key = result.get("key")
    license_key = result.get("licenseKey")

    # Test 2: Find linked license
    print(f"\n  {C.BOLD}2️⃣  البحث عن الترخيص المرتبط{C.R}")
    record = license_service.find_license_by_keygen_key(keygen_key) if keygen_key else None
    test("العثور على الترخيص", record is not None)
    if record:
        p = record["payload"]
        test("ربط keygenKey صحيح", p.get("keygenKey") == keygen_key)
        test("ربط phone صحيح", p.get("phone") == TEST_PHONE)
        test("غير مربوط بجهاز", not p.get("hwFingerprint"))

    # Test 3: Activate license on hardware
    print(f"\n  {C.BOLD}3️⃣  تفعيل الترخيص على جهاز{C.R}")
    activation = license_service.activate_license_for_hw(license_key, TEST_HW_FP, TEST_HW_ID) if license_key else {}
    test("تفعيل الترخيص", activation.get("ok"))
    if activation.get("ok"):
        p2 = activation["payload"]
        test("ربط البصمة", p2.get("hwFingerprint") == TEST_HW_FP)
        test("ربط HW ID", p2.get("hwId") == TEST_HW_ID)
        test("signedPayload موجود", len(activation.get("signedPayload", "")) > 100)

    # Test 4: Verify RSA signature
    print(f"\n  {C.BOLD}4️⃣  التحقق من توقيع RSA{C.R}")
    sig_ok = False
    if activation.get("ok"):
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding
            sp = activation["signedPayload"]
            parts = sp.split(".")
            pb = parts[0].replace("-", "+").replace("_", "/") + "=" * ((4 - len(parts[0]) % 4) % 4)
            sb = parts[1].replace("-", "+").replace("_", "/") + "=" * ((4 - len(parts[1]) % 4) % 4)
            pbuf = base64.b64decode(pb)
            sbuf = base64.b64decode(sb)
            pub_path = os.path.join(BASE_DIR, "data", "license_public_key.pem")
            with open(pub_path, "rb") as f:
                pub = serialization.load_pem_public_key(f.read())
            pub.verify(sbuf, pbuf,
                padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=hashes.SHA256().digest_size),
                hashes.SHA256())
            sig_ok = True
        except Exception:
            pass
    test("التوقيع صالح", sig_ok)

    # Test 5: Re-activate on same HW
    print(f"\n  {C.BOLD}5️⃣  إعادة تفعيل على نفس الجهاز{C.R}")
    act2 = license_service.activate_license_for_hw(license_key, TEST_HW_FP, TEST_HW_ID) if license_key else {}
    test("إعادة التفعيل", act2.get("ok"))

    # Test 6: Reject different HW
    print(f"\n  {C.BOLD}6️⃣  رفض جهاز مختلف{C.R}")
    act3 = license_service.activate_license_for_hw(license_key, "different-fp", "HW-DIFF") if license_key else {}
    test("رفض الجهاز المختلف", not act3.get("ok") and act3.get("code") == "HW_MISMATCH")

    # Test 7: list_unified
    print(f"\n  {C.BOLD}7️⃣  العرض الموحد{C.R}")
    unified = keygen_service.list_unified(phone_number=TEST_PHONE)
    test("العرض الموحد يحتوي المفتاح", unified["count"] >= 1)
    found = any(e["key"] == keygen_key for e in unified["keys"]) if keygen_key else False
    test("المفتاح موجود في القائمة", found)

    # Test 8: Analytics
    print(f"\n  {C.BOLD}8️⃣  نظام الإحصائيات{C.R}")
    stats = license_service.get_usage_stats()
    test("الإحصائيات تعمل", stats.get("ok"))
    test("ملخص موجود", "summary" in stats)
    test("أجهزة مسجلة", stats["summary"]["totalDevices"] > 0)

    # Test 9: Revoke key + linked license
    print(f"\n  {C.BOLD}9️⃣  إلغاء المفتاح + الترخيص{C.R}")
    rev = keygen_service.revoke_key(keygen_key) if keygen_key else {}
    test("إلغاء المفتاح", rev.get("ok"))
    rec_after = license_service.find_license_by_keygen_key(keygen_key) if keygen_key else None
    test("الترخيص ملغى أيضاً", rec_after and rec_after["payload"].get("revoked") == True)

    # Test 10: Integrity check
    print(f"\n  {C.BOLD}🔟 فحص السلامة{C.R}")
    integ = license_service.check_integrity(strict=False)
    test("فحص السلامة", integ.get("ok"), f"({integ.get('checked', 0)} ملف)")

    # Cleanup
    print(f"\n  {C.BOLD}🧹 تنظيف{C.R}")
    try:
        keys = keygen_service._load_keys()
        if keygen_key and keygen_key in keys:
            del keys[keygen_key]
            keygen_service._save_keys(keys)
        lic_data = license_service._load_licenses()
        if license_key and license_key in lic_data.get("licenses", {}):
            del lic_data["licenses"][license_key]
            license_service._save_licenses(lic_data)
        license_service.clear_usage_log()
        _info("تم تنظيف البيانات التجريبية")
    except Exception as e:
        _warn(f"تنظيف جزئي: {e}")

    # Summary
    _header(f"النتيجة: {C.GREEN}{passed} نجح{C.R} / {C.RED if failed else C.GREEN}{failed} فشل{C.R}")
    if failed == 0:
        print(f"\n  {C.GREEN}{C.BOLD}🎉 جميع الاختبارات نجحت! النظام يعمل بشكل صحيح{C.R}")
    else:
        print(f"\n  {C.RED}{C.BOLD}⚠️  {failed} اختبار فشل — راجع النتائج أعلاه{C.R}")
    _pause()


# ═══════════════════════════════════════════════════════════════════════════
#  MODULE 6: Server Status
# ═══════════════════════════════════════════════════════════════════════════

def mod_server_status():
    """حالة الخادم والترخيص"""
    _header("حالة الخادم والترخيص")
    from app.services import license_service
    status = license_service.get_server_license_status()
    st = status.get("status", "unknown")
    colors = {"active": C.GREEN, "trial": C.CYAN, "grace": C.YELLOW, "expired": C.RED}
    color = colors.get(st, C.GRAY)
    print(f"\n  الحالة: {color}{C.BOLD}{st.upper()}{C.R}")
    if status.get("daysLeft"):
        print(f"  الأيام المتبقية: {status['daysLeft']}")
    if status.get("graceHoursLeft"):
        print(f"  ساعات السماح: {status['graceHoursLeft']}")
    if status.get("trialStart"):
        print(f"  بداية التجربة: {_ts(status['trialStart'])}")
    if status.get("lastHeartbeat"):
        print(f"  آخر heartbeat: {_time_ago(status['lastHeartbeat'])}")

    # Public key info
    try:
        spki = license_service.get_public_key_spki_b64()
        print(f"\n  المفتاح العام (SPKI): {spki[:40]}...")
        print(f"  الطول: {len(spki)} حرف (base64)")
    except Exception:
        pass

    # License DB info
    lic_data = license_service._load_licenses()
    total = len(lic_data.get("licenses", {}))
    active = sum(1 for r in lic_data.get("licenses", {}).values()
                 if not r.get("payload", {}).get("revoked", False))
    print(f"\n  قاعدة بيانات التراخيص: {total} إجمالي، {active} نشط")

    # Keys DB info
    try:
        from backend import keygen_service
        keys = keygen_service._load_keys()
        k_total = len(keys)
        k_active = sum(1 for v in keys.values() if v.get("active", True))
        print(f"  قاعدة بيانات المفاتيح: {k_total} إجمالي، {k_active} نشط")
    except Exception:
        pass
    _pause()


# ═══════════════════════════════════════════════════════════════════════════
#  MENU SYSTEM
# ═══════════════════════════════════════════════════════════════════════════

def _pause():
    input(f"\n  {C.GRAY}اضغط Enter للمتابعة...{C.R}")

def _clear():
    os.system("cls" if sys.platform == "win32" else "clear")


def main_menu():
    """القائمة الرئيسية"""
    while True:
        _clear()
        print(f"{C.CYAN}{C.BOLD}")
        print("  ╔══════════════════════════════════════════════════════╗")
        print("  ║     Zeralda ERP — Protection Toolkit                ║")
        print("  ║     نظام حماية حقوق المطور — أداة الإدارة            ║")
        print("  ╚══════════════════════════════════════════════════════╝")
        print(f"{C.R}")
        print(f"  {C.BOLD}1️⃣  المفاتيح والتراخيص (Keygen + License){C.R}")
        print(f"     1. توليد مفتاح + ترخيص")
        print(f"     2. العرض الموحد (مفاتيح + تراخيص)")
        print(f"     3. عرض ترخيص مرتبط بمفتاح")
        print(f"     4. إلغاء مفتاح + ترخيصه")
        print(f"     5. محاكاة تسجيل دخول + تفعيل")
        print()
        print(f"  {C.BOLD}2️⃣  الإحصائيات (Analytics){C.R}")
        print(f"     6. لوحة الإحصائيات")
        print(f"     7. محاكاة أحداث (للاختبار)")
        print(f"     8. مسح سجل الإحصائيات")
        print()
        print(f"  {C.BOLD}3️⃣  التعمية (Obfuscation){C.R}")
        print(f"     9.  تعمية JavaScript")
        print(f"     10. تعمية Python")
        print(f"     11. تعمية شاملة (الكل)")
        print(f"     12. استعادة JavaScript")
        print(f"     13. استعادة Python")
        print(f"     14. استعادة شاملة (الكل)")
        print()
        print(f"  {C.BOLD}4️⃣  السلامة (Integrity){C.R}")
        print(f"     15. فحص سلامة الملفات")
        print(f"     16. إعادة تسجيل الـ hashes")
        print()
        print(f"  {C.BOLD}5️⃣  أدوات{C.R}")
        print(f"     17. حالة الخادم والترخيص")
        print(f"     18. {C.GREEN}{C.BOLD}اختبار شامل (10 اختبارات){C.R}")
        print()
        print(f"     0. خروج")
        print()

        choice = input(f"  {C.CYAN}اختر (0-18): {C.R}").strip()

        actions = {
            "1": mod_generate_key,
            "2": mod_list_unified,
            "3": mod_show_license,
            "4": mod_revoke_key,
            "5": mod_test_login,
            "6": mod_analytics_dashboard,
            "7": mod_analytics_simulate,
            "8": mod_analytics_clear,
            "9": mod_obfuscate_js,
            "10": mod_obfuscate_py,
            "11": mod_obfuscate_all,
            "12": mod_restore_js,
            "13": mod_restore_py,
            "14": mod_restore_all,
            "15": mod_integrity_check,
            "16": mod_integrity_reset,
            "17": mod_server_status,
            "18": mod_full_test,
        }

        if choice == "0" or choice.lower() == "q":
            print(f"\n  {C.CYAN}إلى اللقاء! 👋{C.R}\n")
            break
        elif choice in actions:
            try:
                actions[choice]()
            except KeyboardInterrupt:
                print(f"\n  {C.YELLOW}تم الإلغاء{C.R}")
                _pause()
            except Exception as e:
                _err(f"خطأ: {e}")
                import traceback
                traceback.print_exc()
                _pause()
        else:
            _err("خيار غير صحيح")
            time.sleep(1)


# ═══════════════════════════════════════════════════════════════════════════
#  WEB SERVER MODE (--web)
# ═══════════════════════════════════════════════════════════════════════════

def _json_response(data, status=200):
    body = json.dumps(data, ensure_ascii=False, default=str).encode("utf-8")
    return {
        "status": status,
        "headers": [("Content-Type", "application/json; charset=utf-8"),
                     ("Access-Control-Allow-Origin", "*"),
                     ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
                     ("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")],
        "body": body
    }

def _html_response(content, status=200):
    if isinstance(content, str):
        content = content.encode("utf-8")
    return {
        "status": status,
        "headers": [("Content-Type", "text/html; charset=utf-8")],
        "body": content
    }

def _read_body(handler):
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {}

def _handle_api(path, method, handler):
    """Handle /api/toolkit/* endpoints"""
    try:
        # ── Keys ──
        if path == "/api/toolkit/keys/list" and method == "GET":
            from backend import keygen_service
            return _json_response(keygen_service.list_unified())

        if path == "/api/toolkit/keys/generate" and method == "POST":
            from backend import keygen_service
            data = _read_body(handler)
            result = keygen_service.generate_key(
                data.get("phone", ""),
                user_email=data.get("email"),
                license_expires_days=data.get("expires_days", 0),
                force_new=True
            )
            return _json_response(result, 200 if result.get("ok") else 400)

        if path == "/api/toolkit/keys/revoke" and method == "POST":
            from backend import keygen_service
            data = _read_body(handler)
            result = keygen_service.revoke_key(data.get("key", ""))
            return _json_response(result, 200 if result.get("ok") else 400)

        if path == "/api/toolkit/keys/delete" and method == "POST":
            from backend import keygen_service
            data = _read_body(handler)
            result = keygen_service.delete_key(data.get("key", ""))
            return _json_response(result, 200 if result.get("ok") else 400)

        if path == "/api/toolkit/keys/verify" and method == "POST":
            from backend import keygen_service
            data = _read_body(handler)
            result = keygen_service.verify_key(data.get("key", ""), data.get("phone", ""))
            return _json_response(result, 200)

        if path.startswith("/api/toolkit/keys/license/") and method == "GET":
            from backend import keygen_service
            key = path.split("/")[-1]
            result = keygen_service.get_license_for_key(key)
            return _json_response(result, 200 if result.get("ok") else 404)

        # ── Analytics ──
        if path == "/api/toolkit/analytics" and method == "GET":
            from app.services import license_service
            stats = license_service.get_usage_stats()
            # Also get server status
            try:
                stats["serverStatus"] = license_service.get_server_license_status()
            except Exception:
                pass
            return _json_response(stats)

        if path == "/api/toolkit/analytics/simulate" and method == "POST":
            from app.services import license_service
            license_service.log_usage_event("activation", license_key="ZERALDA-SIM-1",
                hw_fingerprint="sim-fp-1", hw_id="HW-SIM-1", phone="+213111", ip="192.168.1.1")
            license_service.log_usage_event("heartbeat", license_key="ZERALDA-SIM-1",
                hw_fingerprint="sim-fp-1", hw_id="HW-SIM-1", ip="192.168.1.1")
            license_service.log_usage_event("activation", license_key="ZERALDA-SIM-2",
                hw_fingerprint="sim-fp-2", hw_id="HW-SIM-2", phone="+213222", ip="10.0.0.5")
            license_service.log_usage_event("hw_mismatch", license_key="ZERALDA-SIM-1",
                hw_fingerprint="sim-fp-3", hw_id="HW-SIM-3")
            license_service.log_usage_event("activation", license_key="ZERALDA-SIM-1",
                hw_fingerprint="sim-fp-3", hw_id="HW-SIM-3")
            return _json_response({"ok": True, "message": "5 simulated events logged"})

        if path == "/api/toolkit/analytics/clear" and method == "POST":
            from app.services import license_service
            return _json_response(license_service.clear_usage_log())

        # ── Obfuscation ──
        if path == "/api/toolkit/obfuscate/js" and method == "POST":
            from tools.obfuscate_js import obfuscate_all
            results = obfuscate_all()
            return _json_response({"ok": True, "count": len(results), "files": results})

        if path == "/api/toolkit/obfuscate/py" and method == "POST":
            from tools.obfuscate_py import obfuscate_all
            results = obfuscate_all()
            return _json_response({"ok": True, "count": len(results), "files": results})

        if path == "/api/toolkit/obfuscate/all" and method == "POST":
            from tools.obfuscate_js import obfuscate_all as obf_js
            from tools.obfuscate_py import obfuscate_all as obf_py
            r1 = obf_js()
            r2 = obf_py()
            return _json_response({"ok": True, "total": len(r1) + len(r2),
                                   "js": r1, "py": r2, "files": r1 + r2})

        if path == "/api/toolkit/restore/js" and method == "POST":
            from tools.obfuscate_js import restore_all
            results = restore_all()
            return _json_response({"ok": True, "count": len(results), "restored": results})

        if path == "/api/toolkit/restore/py" and method == "POST":
            from tools.obfuscate_py import restore_all
            results = restore_all()
            return _json_response({"ok": True, "count": len(results), "restored": results})

        if path == "/api/toolkit/restore/all" and method == "POST":
            from tools.obfuscate_js import restore_all as rest_js
            from tools.obfuscate_py import restore_all as rest_py
            r1 = rest_js()
            r2 = rest_py()
            return _json_response({"ok": True, "total": len(r1) + len(r2),
                                   "restored": r1 + r2})

        # ── Integrity ──
        if path == "/api/toolkit/integrity/check" and method == "GET":
            from app.services import license_service
            return _json_response(license_service.check_integrity(strict=False))

        if path == "/api/toolkit/integrity/reset" and method == "POST":
            from app.services import license_service
            return _json_response(license_service.reset_integrity())

        # ── Server Status ──
        if path == "/api/toolkit/server/status" and method == "GET":
            from app.services import license_service
            status = license_service.get_server_license_status()
            try:
                spki = license_service.get_public_key_spki_b64()
                status["publicKeySpki"] = spki
            except Exception:
                pass
            # Keys DB
            try:
                from backend import keygen_service
                keys = keygen_service._load_keys()
                status["keysTotal"] = len(keys)
                status["keysActive"] = sum(1 for v in keys.values() if v.get("active", True))
            except Exception:
                pass
            # Licenses DB
            try:
                lic_data = license_service._load_licenses()
                status["licensesTotal"] = len(lic_data.get("licenses", {}))
            except Exception:
                pass
            return _json_response(status)

        # ── Full Test ──
        if path == "/api/toolkit/test/full" and method == "POST":
            results = _run_full_test_silent()
            return _json_response(results)

        return _json_response({"error": "Not found"}, 404)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return _json_response({"error": str(e)}, 500)


def _run_full_test_silent():
    """Run full test suite and return structured results"""
    from backend import keygen_service
    from app.services import license_service

    TEST_PHONE = "+213661234567"
    TEST_EMAIL = "test@toolkit.dz"
    TEST_HW_FP = "toolkit-test-fp-abc123"
    TEST_HW_ID = "HW-TOOLKIT-1234-5678-ABCD"
    tests = []
    passed = 0
    failed = 0

    def test(name, condition, detail=""):
        nonlocal passed, failed
        tests.append({"name": name, "pass": bool(condition), "detail": detail})
        if condition:
            passed += 1
        else:
            failed += 1

    # Test 1
    result = keygen_service.generate_key(TEST_PHONE, user_email=TEST_EMAIL, force_new=True)
    test("توليد المفتاح", result.get("ok"), result.get("key", ""))
    test("إنشاء ترخيص مرتبط", bool(result.get("licenseKey")), result.get("licenseKey", "NONE"))
    keygen_key = result.get("key")
    license_key = result.get("licenseKey")

    # Test 2
    record = license_service.find_license_by_keygen_key(keygen_key) if keygen_key else None
    test("العثور على الترخيص", record is not None)
    if record:
        p = record["payload"]
        test("ربط keygenKey صحيح", p.get("keygenKey") == keygen_key)
        test("ربط phone صحيح", p.get("phone") == TEST_PHONE)
        test("غير مربوط بجهاز", not p.get("hwFingerprint"))

    # Test 3
    activation = license_service.activate_license_for_hw(license_key, TEST_HW_FP, TEST_HW_ID) if license_key else {}
    test("تفعيل الترخيص", activation.get("ok"))
    if activation.get("ok"):
        p2 = activation["payload"]
        test("ربط البصمة", p2.get("hwFingerprint") == TEST_HW_FP)
        test("ربط HW ID", p2.get("hwId") == TEST_HW_ID)
        test("signedPayload موجود", len(activation.get("signedPayload", "")) > 100)

    # Test 4
    sig_ok = False
    if activation.get("ok"):
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding
            sp = activation["signedPayload"]
            parts = sp.split(".")
            pb = parts[0].replace("-", "+").replace("_", "/") + "=" * ((4 - len(parts[0]) % 4) % 4)
            sb = parts[1].replace("-", "+").replace("_", "/") + "=" * ((4 - len(parts[1]) % 4) % 4)
            pbuf = base64.b64decode(pb)
            sbuf = base64.b64decode(sb)
            pub_path = os.path.join(BASE_DIR, "data", "license_public_key.pem")
            with open(pub_path, "rb") as f:
                pub = serialization.load_pem_public_key(f.read())
            pub.verify(sbuf, pbuf,
                padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=hashes.SHA256().digest_size),
                hashes.SHA256())
            sig_ok = True
        except Exception:
            pass
    test("التوقيع RSA صالح", sig_ok)

    # Test 5
    act2 = license_service.activate_license_for_hw(license_key, TEST_HW_FP, TEST_HW_ID) if license_key else {}
    test("إعادة التفعيل على نفس الجهاز", act2.get("ok"))

    # Test 6
    act3 = license_service.activate_license_for_hw(license_key, "different-fp", "HW-DIFF") if license_key else {}
    test("رفض الجهاز المختلف", not act3.get("ok") and act3.get("code") == "HW_MISMATCH")

    # Test 7
    unified = keygen_service.list_unified(phone_number=TEST_PHONE)
    test("العرض الموحد يحتوي المفتاح", unified["count"] >= 1)
    found = any(e["key"] == keygen_key for e in unified["keys"]) if keygen_key else False
    test("المفتاح موجود في القائمة", found)

    # Test 8
    stats = license_service.get_usage_stats()
    test("الإحصائيات تعمل", stats.get("ok"))
    test("ملخص موجود", "summary" in stats)
    test("أجهزة مسجلة", stats["summary"]["totalDevices"] > 0)

    # Test 9
    rev = keygen_service.revoke_key(keygen_key) if keygen_key else {}
    test("إلغاء المفتاح", rev.get("ok"))
    rec_after = license_service.find_license_by_keygen_key(keygen_key) if keygen_key else None
    test("الترخيص ملغى أيضاً", rec_after and rec_after["payload"].get("revoked") == True)

    # Test 10
    integ = license_service.check_integrity(strict=False)
    test("فحص السلامة", integ.get("ok"), f"({integ.get('checked', 0)} ملف)")

    # Cleanup
    try:
        keys = keygen_service._load_keys()
        if keygen_key and keygen_key in keys:
            del keys[keygen_key]
            keygen_service._save_keys(keys)
        lic_data = license_service._load_licenses()
        if license_key and license_key in lic_data.get("licenses", {}):
            del lic_data["licenses"][license_key]
            license_service._save_licenses(lic_data)
        license_service.clear_usage_log()
    except Exception:
        pass

    return {"passed": passed, "failed": failed, "tests": tests}


class ToolkitHTTPHandler:
    """HTTP request handler using http.server"""
    def __init__(self, handler):
        self.handler = handler

    def serve(self):
        from http.server import HTTPServer, SimpleHTTPRequestHandler
        import urllib.parse
        import threading
        import webbrowser

        html_path = os.path.join(BASE_DIR, "protection_toolkit.html")
        if not os.path.exists(html_path):
            print(f"ERROR: protection_toolkit.html not found at {html_path}")
            return

        with open(html_path, "rb") as f:
            html_content = f.read()

        class Handler(SimpleHTTPRequestHandler):
            def log_message(self, format, *args):
                pass  # suppress logs

            def do_OPTIONS(self):
                self.send_response(200)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
                self.end_headers()

            def do_GET(self):
                parsed = urllib.parse.urlparse(self.path)
                path = parsed.path
                if path.startswith("/api/toolkit/"):
                    resp = _handle_api(path, "GET", self)
                    self._send(resp)
                elif path == "/" or path == "/protection_toolkit.html":
                    self._send(_html_response(html_content))
                elif path == "/favicon.ico":
                    # Serve favicon from project root
                    fav_path = os.path.join(BASE_DIR, "favicon.ico")
                    if os.path.exists(fav_path):
                        with open(fav_path, "rb") as ff:
                            fav_data = ff.read()
                        self._send({
                            "status": 200,
                            "headers": [("Content-Type", "image/x-icon"),
                                        ("Cache-Control", "max-age=86400")],
                            "body": fav_data
                        })
                    else:
                        # Empty 1x1 ico to avoid 404
                        self._send({
                            "status": 204,
                            "headers": [("Content-Type", "image/x-icon")],
                            "body": b""
                        })
                else:
                    self.send_error(404)

            def do_POST(self):
                parsed = urllib.parse.urlparse(self.path)
                path = parsed.path
                if path.startswith("/api/toolkit/"):
                    resp = _handle_api(path, "POST", self)
                    self._send(resp)
                else:
                    self.send_error(404)

            def _send(self, resp):
                self.send_response(resp["status"])
                for k, v in resp["headers"]:
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(resp["body"])))
                self.end_headers()
                if resp["body"]:
                    self.wfile.write(resp["body"])

        port = 9090
        # Allow port reuse to avoid "Address already in use" errors
        import socket
        class ReusableHTTPServer(HTTPServer):
            allow_reuse_address = True

        httpd = ReusableHTTPServer(("127.0.0.1", port), Handler)
        url = f"http://127.0.0.1:{port}"
        print(f"\n  {C.CYAN}{C.BOLD}🛡️  Protection Toolkit Web UI{C.R}")
        print(f"  {C.GREEN}▶  يعمل على: {url}{C.R}")
        print(f"  {C.GRAY}   اضغط Ctrl+C للإيقاف{C.R}\n")

        # Open browser AFTER server is ready (wait for it to accept connections)
        def open_browser():
            # Wait until server responds, then open browser
            for _ in range(20):
                try:
                    import urllib.request
                    req = urllib.request.urlopen(f"{url}/api/toolkit/server/status", timeout=1)
                    if req.status == 200:
                        break
                except Exception:
                    pass
                time.sleep(0.5)
            webbrowser.open(url)
        threading.Thread(target=open_browser, daemon=True).start()

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print(f"\n  {C.YELLOW}تم الإيقاف{C.R}\n")
            httpd.shutdown()


def main():
    # Handle --web flag (web UI mode)
    if "--web" in sys.argv or "--html" in sys.argv:
        ToolkitHTTPHandler(None).serve()
        return
    # Handle --gui flag (future: tkinter GUI)
    if "--gui" in sys.argv or "--desktop" in sys.argv:
        _info("واجهة GUI قيد التطوير — تشغيل CLI")
    main_menu()


if __name__ == "__main__":
    main()
