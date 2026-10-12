"""Inject license_auto.js into all HTML pages that need protection."""
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TARGETS = [
    "zeralda_erp_dashboard.html",
    "settings.html",
    os.path.join("modules", "consulting", "consulting_tenders_management.html"),
    os.path.join("modules", "crm", "crm_management.html"),
    os.path.join("modules", "finance", "finance_accounting.html"),
    os.path.join("modules", "hr", "hr_management.html"),
    os.path.join("modules", "inventory", "inventory_management.html"),
    os.path.join("modules", "purchasing", "purchasing_management.html"),
    os.path.join("modules", "reports", "reports_analytics.html"),
    os.path.join("modules", "sales", "sales_management.html"),
    os.path.join("modules", "services", "services_management.html"),
]

SCRIPT_TAG = '    <script src="shared/license_auto.js?v=20260828a" defer></script>\n'

for rel in TARGETS:
    path = os.path.join(BASE, rel)
    if not os.path.exists(path):
        print(f"  {rel}: NOT FOUND")
        continue
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    if "license_auto.js" in content:
        print(f"  {rel}: already has it")
        continue
    m = re.search(r"</body>", content)
    if not m:
        print(f"  {rel}: no </body> tag")
        continue
    content = content[:m.start()] + SCRIPT_TAG + content[m.start():]
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  {rel}: added")

print("Done.")
