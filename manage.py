#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Zeralda ERP — Unified Control and Management CLI
مركز التحكم والإدارة الموحد لنظام زرالدة
"""

import os
import sys
import subprocess
import shutil
import webbrowser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

def print_header():
    print("=" * 68)
    print("           Zeralda ERP — لوحة التحكم والتشغيل الموحدة")
    print("=" * 68)

def print_menu():
    print_header()
    print("  [1] تشغيل النظام والمتصفح      (Launch ERP & Browser)")
    print("  [2] إيقاف الخادم والعمليات     (Force Stop ERP Server)")
    print("  [3] تشغيل النفق السحابي        (Start Cloudflare Tunnel)")
    print("  [4] فحص حالة النظام والتشخيص   (Diagnostic & Health Check)")
    print("  [5] أدوات الحماية والتراخيص     (Protection Toolkit & Keygen)")
    print("  [6] النشر المباشر على السحابة   (Deploy to Railway Cloud)")
    print("  [7] ربط الأجهزة عبر الشبكة     (Network Connection Hub)")
    print("  [8] تجهيز نسخة البيع للزبائن   (Build Client Setup Installer)")
    print("  [9] فحص واختبار النظام آلياً   (Run Core Automated Tests)")
    print("  [0] خروج                       (Exit)")
    print("=" * 68)

def action_run():
    print("\n[*] جاري بدء تشغيل خادم Zeralda ERP...")
    ps_script = os.path.join(BASE_DIR, "launcher", "Launch_ERP.ps1")
    cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps_script]
    try:
        subprocess.run(cmd)
    except Exception as e:
        print(f"[ERROR] فشل التشغيل: {e}")

def action_stop():
    print("\n[*] جاري إيقاف كافة عمليات وسيرفرات Zeralda ERP...")
    ps_script = os.path.join(BASE_DIR, "launcher", "Kill_ERP.ps1")
    cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps_script]
    try:
        subprocess.run(cmd)
        print("[OK] تم إيقاف جميع العمليات بنجاح.")
    except Exception as e:
        print(f"[ERROR] خطأ أثناء الإيقاف: {e}")

def action_tunnel():
    print("\n[*] جاري تشغيل النفق السحابي Cloudflare...")
    ps_script = os.path.join(BASE_DIR, "launcher", "Start_Quick_Tunnel.ps1")
    cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps_script]
    try:
        subprocess.run(cmd)
    except Exception as e:
        print(f"[ERROR] خطأ: {e}")

def action_diagnostic():
    print("\n" + "=" * 68)
    print("                 فحص وتشخيص بيئة Zeralda ERP")
    print("=" * 68)
    # Python
    print(f"[OK] Python الإصدار: {sys.version.split()[0]} ({sys.executable})")
    
    # Node
    node_res = shutil.which("node")
    if node_res:
        try:
            ver = subprocess.check_output([node_res, "--version"], text=True).strip()
            print(f"[OK] Node.js الإصدار: {ver} ({node_res})")
        except:
            print("[OK] Node.js متوفر.")
    else:
        print("[!] Node.js غير متاح في PATH العام.")

    # Port 8080
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        in_use = s.connect_ex(("127.0.0.1", 8080)) == 0
    if in_use:
        print("[INFO] المنفذ 8080 مشغول حالياً (الخادم يعمل بالفعل).")
    else:
        print("[OK] المنفذ 8080 متاح وغير مشغول.")
    print("=" * 68)

def action_toolkit():
    print("\n[*] جاري فتح أدوات الحماية والتراخيص...")
    html_toolkit = os.path.join(BASE_DIR, "tools", "protection_toolkit.html")
    py_toolkit = os.path.join(BASE_DIR, "tools", "protection_toolkit.py")
    if os.path.exists(html_toolkit):
        webbrowser.open(html_toolkit)
    else:
        subprocess.run([sys.executable, py_toolkit])

def action_keygen():
    print("\n[*] تشغيل مولد التراخيص Keygen...")
    keygen_py = os.path.join(BASE_DIR, "tools", "keygen_tool.py")
    if not os.path.exists(keygen_py):
        keygen_py = os.path.join(BASE_DIR, "tools", "keygen_cli.py")
    subprocess.run([sys.executable, keygen_py])

def action_deploy():
    print("\n" + "=" * 68)
    print("              النشر المباشر إلى خادم Railway Cloud")
    print("=" * 68)
    railway_bin = shutil.which("railway") or os.path.expandvars(r"%LOCALAPPDATA%\.railway\bin\railway.exe")
    if os.path.exists(railway_bin) or shutil.which("railway"):
        subprocess.run([railway_bin, "up", "-d"])
    else:
        print("[ERROR] أداة railway CLI غير متوفرة في النظام.")

def action_connect():
    print("\n[*] فتح واجهة الربط الشبكي...")
    webbrowser.open("http://127.0.0.1:8080/pages/connect.html")

def action_installer():
    print("\n[*] جاري فحص بيئة تجميع وتجهيز حزمة البيع (Inno Setup)...")
    iss_file = os.path.join(BASE_DIR, "installer", "Zeralda_ERP_Setup.iss")
    if not os.path.exists(iss_file):
        print(f"[ERROR] ملف الإعداد غير موجود: {iss_file}")
        return

    iscc_candidates = [
        "iscc",
        r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        r"C:\Program Files\Inno Setup 6\ISCC.exe",
    ]
    iscc_exe = None
    for cand in iscc_candidates:
        if shutil.which(cand) or (os.path.isabs(cand) and os.path.exists(cand)):
            iscc_exe = cand
            break

    if not iscc_exe:
        print("[!] لم يتم العثور على مترجم Inno Setup 6 (ISCC.exe) في المسار الافتراضي.")
        print("[*] لتوليد ملف التثبيت Setup.exe للبيع، اتبع الآتي:")
        print("    1. قم بتحميل Inno Setup 6 مجاناً من: https://jrsoftware.org/isdl.php")
        print("    2. بعد التثبيت، أعد تشغيل هذا الخيار أو شغّل: iscc installer\\Zeralda_ERP_Setup.iss")
        print("    3. سيتم إنشاء ملف التثبيت الجاهز للزبائن مباشرة داخل مجلد: installer\\dist\\")
        return

    print(f"[*] تم العثور على Inno Setup: {iscc_exe}")
    print("[*] جاري بناء وتجميع حزمة التثبيت الرسمية للعملاء...")
    try:
        res = subprocess.run([iscc_exe, iss_file])
        if res.returncode == 0:
            print("\n[OK] تم بناء ملف التثبيت بنجاح داخل مجلد installer/dist/")
            dist_dir = os.path.join(BASE_DIR, "installer", "dist")
            if os.path.exists(dist_dir):
                os.startfile(dist_dir)
        else:
            print(f"\n[ERROR] حدث خطأ أثناء التجميع (كود: {res.returncode})")
    except Exception as e:
        print(f"[ERROR] فشل تشغيل Inno Setup: {e}")

def action_test():
    print("\n" + "=" * 68)
    print("           تشغيل حزمة الاختبارات الآلية لنظام Zeralda ERP")
    print("=" * 68)
    test_file = os.path.join(BASE_DIR, "tests", "test_api_core.py")
    subprocess.run([sys.executable, test_file])

def main():
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd in ("run", "start"):
            action_run()
        elif cmd in ("stop", "kill"):
            action_stop()
        elif cmd == "tunnel":
            action_tunnel()
        elif cmd in ("diag", "diagnostic", "check"):
            action_diagnostic()
        elif cmd == "toolkit":
            action_toolkit()
        elif cmd == "keygen":
            action_keygen()
        elif cmd == "deploy":
            action_deploy()
        elif cmd == "connect":
            action_connect()
        elif cmd in ("installer", "build-installer", "package"):
            action_installer()
        elif cmd in ("test", "tests"):
            action_test()
        else:
            print(f"[ERROR] أمر غير معروف: {cmd}")
            print("الأوامر المتاحة: run, stop, tunnel, diag, toolkit, keygen, deploy, connect, installer, test")
            sys.exit(1)
        return

    while True:
        print_menu()
        try:
            choice = input("يرجى اختيار رقم العملية [0-9]: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nوداعاً!")
            break

        if choice == "1":
            action_run()
        elif choice == "2":
            action_stop()
        elif choice == "3":
            action_tunnel()
        elif choice == "4":
            action_diagnostic()
        elif choice == "5":
            action_toolkit()
        elif choice == "6":
            action_deploy()
        elif choice == "7":
            action_connect()
        elif choice == "8":
            action_installer()
        elif choice == "9":
            action_test()
        elif choice == "0":
            print("\nتم الخروج بنجاح.")
            break
        else:
            print("\n[!] اختيار غير صحيح، يرجى المحاولة مجدداً.")
        input("\nاضغط Enter للمتابعة...")

if __name__ == "__main__":
    main()

