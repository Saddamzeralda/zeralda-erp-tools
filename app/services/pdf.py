"""Invoice PDF generator using PyMuPDF.

Extracted from legacy server.py lines 740-892. No logic changes — pure extraction.
"""
from __future__ import annotations

from typing import Any, Dict, Optional


def generate_invoice_pdf(inv: Dict[str, Any], doc_type: str = "invoice") -> Optional[bytes]:
    """Generate a PDF from an invoice/proforma dict. Returns bytes or None (PyMuPDF missing).

    doc_type: "invoice" (default) or "proforma" — controls the title and number field.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return None

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4

    dark = (0.06, 0.16, 0.27)
    gray = (0.42, 0.45, 0.50)
    light_gray = (0.93, 0.94, 0.96)
    accent = (0.15, 0.39, 0.92)

    y = 50
    left = 40
    right = 555

    page.draw_rect(fitz.Rect(0, 0, 595, 8), color=accent, fill=accent)
    # Title depends on document type
    if doc_type == "proforma":
        title = "PROFORMA / DEVIS"
    else:
        title = "FACTURE / INVOICE"
    page.insert_text(fitz.Point(left, y), title, fontsize=22, fontname="helv", color=dark)
    y += 10
    page.draw_line(fitz.Point(left, y), fitz.Point(right, y), color=light_gray, width=0.5)
    y += 25

    # Number field: proformas use "proformaNumber", invoices use "number"
    if doc_type == "proforma":
        inv_num = str(inv.get("proformaNumber") or inv.get("number") or inv.get("id") or "N/A")
    else:
        inv_num = str(inv.get("number") or inv.get("id") or "N/A")
    inv_date = str(inv.get("date") or inv.get("invoiceDate") or "")
    inv_due = str(inv.get("dueDate") or inv.get("due_date") or "")
    inv_status = str(inv.get("status") or "pending")

    meta_lines = [
        (f"Numero / Number: {inv_num}", True),
        (f"Date: {inv_date}", False),
        (f"Echeance / Due: {inv_due}" if inv_due else "", False),
        (f"Statut / Status: {inv_status}", False),
    ]
    for text, bold in meta_lines:
        if not text:
            continue
        page.insert_text(fitz.Point(left, y), text, fontsize=10, fontname="helv", color=dark if bold else gray)
        y += 16

    y += 10

    # Customer can be a string or a dict with "name" key
    customer = inv.get("customer") or inv.get("customerName") or ""
    if isinstance(customer, dict):
        customer = customer.get("name") or customer.get("customerName") or ""
    if customer:
        page.insert_text(fitz.Point(left, y), "Client / Customer:", fontsize=11, fontname="helv", color=dark)
        y += 14
        page.insert_text(fitz.Point(left + 10, y), str(customer), fontsize=10, fontname="helv", color=gray)
        y += 14
        cust_phone = inv.get("customerPhone") or inv.get("phone") or ""
        cust_addr = inv.get("customerAddress") or inv.get("address") or ""
        # If customer was a dict, extract phone/address from it
        cust_obj = inv.get("customer")
        if isinstance(cust_obj, dict):
            if not cust_phone:
                cust_phone = cust_obj.get("phone") or ""
            if not cust_addr:
                cust_addr = cust_obj.get("address") or cust_obj.get("city") or ""
        if cust_addr:
            page.insert_text(fitz.Point(left + 10, y), str(cust_addr), fontsize=9, fontname="helv", color=gray)
            y += 13
        if cust_phone:
            page.insert_text(fitz.Point(left + 10, y), str(cust_phone), fontsize=9, fontname="helv", color=gray)
            y += 13

    y += 10

    items = inv.get("items") or inv.get("lineItems") or []
    if not isinstance(items, list):
        items = []

    table_top = y
    page.draw_rect(fitz.Rect(left, y, right, y + 22), color=accent, fill=accent)
    headers = ["#", "Description", "Qty", "Prix/Price", "Total"]
    col_x = [left + 5, left + 30, left + 320, left + 380, left + 460]
    for i, h in enumerate(headers):
        page.insert_text(fitz.Point(col_x[i], y + 15), h, fontsize=9, fontname="helv", color=(1, 1, 1))
    y += 22

    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        if y > 770:
            page = doc.new_page(width=595, height=842)
            y = 50
            page.draw_rect(fitz.Rect(left, y, right, y + 22), color=accent, fill=accent)
            for i, h in enumerate(headers):
                page.insert_text(fitz.Point(col_x[i], y + 15), h, fontsize=9, fontname="helv", color=(1, 1, 1))
            y += 22

        row_bg = light_gray if idx % 2 == 0 else (1, 1, 1)
        page.draw_rect(fitz.Rect(left, y, right, y + 20), color=None, fill=row_bg)

        desc = str(item.get("description") or item.get("name") or item.get("product") or "")[:45]
        # Prepend F/P to description in the same field
        fp = str(item.get("fp") or "").strip()
        if fp:
            desc = fp + " " + desc
        qty = str(item.get("quantity") or item.get("qty") or "1")
        price = str(item.get("price") or item.get("unitPrice") or "0")
        total = str(item.get("total") or item.get("lineTotal") or "0")

        page.insert_text(fitz.Point(col_x[0], y + 14), str(idx + 1), fontsize=8, fontname="helv", color=gray)
        page.insert_text(fitz.Point(col_x[1], y + 14), desc, fontsize=8, fontname="helv", color=dark)
        page.insert_text(fitz.Point(col_x[2], y + 14), qty, fontsize=8, fontname="helv", color=gray)
        page.insert_text(fitz.Point(col_x[3], y + 14), price, fontsize=8, fontname="helv", color=gray)
        page.insert_text(fitz.Point(col_x[4], y + 14), total, fontsize=8, fontname="helv", color=dark)
        y += 20

    y += 15
    page.draw_line(fitz.Point(left, y), fitz.Point(right, y), color=light_gray, width=0.5)
    y += 18

    subtotal = inv.get("subtotal") or inv.get("subTotal")
    tax_rate = inv.get("taxRate") or inv.get("tax_rate")
    tax_amount = inv.get("taxAmount") or inv.get("tax_amount")
    total_amount = inv.get("total") or inv.get("totalAmount") or inv.get("grandTotal") or 0

    if subtotal is not None:
        page.insert_text(fitz.Point(right - 150, y), "Sous-total / Subtotal:", fontsize=9, fontname="helv", color=gray)
        page.insert_text(fitz.Point(right - 10, y), str(subtotal), fontsize=9, fontname="helv", color=dark)
        y += 15
    if tax_amount is not None:
        label = f"TVA ({tax_rate}%):" if tax_rate else "TVA / Tax:"
        page.insert_text(fitz.Point(right - 150, y), label, fontsize=9, fontname="helv", color=gray)
        page.insert_text(fitz.Point(right - 10, y), str(tax_amount), fontsize=9, fontname="helv", color=dark)
        y += 15
    if total_amount is not None:
        page.draw_line(fitz.Point(right - 160, y), fitz.Point(right, y), color=dark, width=1)
        y += 15
        page.insert_text(fitz.Point(right - 150, y), "TOTAL:", fontsize=12, fontname="helv", color=dark)
        page.insert_text(fitz.Point(right - 10, y), str(total_amount), fontsize=12, fontname="helv", color=accent)
        y += 20

    notes = inv.get("notes") or inv.get("note") or ""
    if notes and y < 800:
        y += 10
        page.insert_text(fitz.Point(left, y), "Notes:", fontsize=10, fontname="helv", color=dark)
        y += 14
        for line in str(notes).split("\n")[:5]:
            page.insert_text(fitz.Point(left + 10, y), line[:70], fontsize=8, fontname="helv", color=gray)
            y += 12

    page.draw_line(fitz.Point(left, 810), fitz.Point(right, 810), color=light_gray, width=0.5)
    page.insert_text(fitz.Point(left, 825), "Genere par Zeralda ERP", fontsize=7, fontname="helv", color=gray)
    page.insert_text(
        fitz.Point(right - 80, 825),
        datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        fontsize=7,
        fontname="helv",
        color=gray,
    )

    pdf_bytes = doc.tobytes(deflate=True)
    doc.close()
    return pdf_bytes


# Late import to avoid pulling datetime at module top (kept for parity with legacy)
import datetime  # noqa: E402
import html as _html
import io
import json
from typing import List


def _esc(val: Any) -> str:
    if val is None:
        return "-"
    s = str(val).strip()
    return _html.escape(s) if s else "-"


def _fmt_num(val: Any) -> str:
    try:
        n = float(val or 0)
        return f"{n:,.2f}"
    except Exception:
        return _esc(val)


def _extract_list(store: Dict[str, Any], base_keys: List[str], company_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Collect and deduplicate list records for given base keys across scoped and unscoped store entries."""
    results: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()

    def _add_items(raw: Any) -> None:
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                return
        if not isinstance(raw, list):
            return
        for item in raw:
            if not isinstance(item, dict):
                continue
            iid = str(item.get("id") or item.get("invoiceNumber") or item.get("proformaNumber") or item.get("number") or "")
            if iid and iid in seen_ids:
                continue
            if iid:
                seen_ids.add(iid)
            results.append(item)

    # 1. Exact company-scoped keys first if company_id is specified
    if company_id and company_id != "all":
        for bk in base_keys:
            _add_items(store.get(f"{bk}::{company_id}"))
            _add_items(store.get(f"{bk}__{company_id}"))

    # 2. Unscoped base keys
    for bk in base_keys:
        _add_items(store.get(bk))

    # 3. If still empty or company_id is None/"all", include any company-scoped variants
    if not results or not company_id or company_id == "all":
        for k, v in store.items():
            base = k.split("::", 1)[0].split("__", 1)[0]
            if base in base_keys:
                _add_items(v)

    return results


def generate_full_erp_pdf_report(
    store: Dict[str, Any],
    company_id: Optional[str] = None,
) -> Optional[bytes]:
    """Generate a comprehensive, multi-page organized PDF archive of all ERP modules and invoices."""
    try:
        import pymupdf as fitz
    except ImportError:
        try:
            import fitz  # type: ignore
        except ImportError:
            return None

    # Parse settings & company info
    settings = store.get("zeralda-settings") or {}
    if isinstance(settings, str):
        try:
            settings = json.loads(settings)
        except Exception:
            settings = {}
    if not isinstance(settings, dict):
        settings = {}

    companies = settings.get("companies") or []
    if isinstance(companies, str):
        try:
            companies = json.loads(companies)
        except Exception:
            companies = []

    active_cid = company_id or settings.get("activeCompanyId") or ""
    company_info: Dict[str, Any] = {}
    if isinstance(companies, list):
        for c in companies:
            if isinstance(c, dict) and str(c.get("id")) == str(active_cid):
                company_info = c
                break
        if not company_info and companies and isinstance(companies[0], dict):
            company_info = companies[0]

    comp_name = company_info.get("name") or settings.get("companyName") or "Zeralda ERP"
    comp_rc = company_info.get("rc") or company_info.get("regNumber") or "-"
    comp_nif = company_info.get("nif") or company_info.get("taxId") or "-"
    comp_nis = company_info.get("nis") or "-"
    comp_ai = company_info.get("ai") or company_info.get("artImp") or "-"
    comp_phone = company_info.get("phone") or settings.get("companyPhone") or "-"
    comp_email = company_info.get("email") or settings.get("companyEmail") or "-"
    comp_addr = company_info.get("address") or settings.get("companyAddress") or "-"
    currency = settings.get("systemCurrency") or store.get("system-currency") or "DZD"
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    # Collect data across all ERP pages/modules
    invoices = _extract_list(store, ["invoices-data"], active_cid)
    proformas = _extract_list(store, ["proformas-data"], active_cid)
    customers = _extract_list(store, ["customers-data"], active_cid)
    suppliers = _extract_list(store, ["suppliers-data"], active_cid)
    products = _extract_list(store, ["products-data"], active_cid)
    purchases = _extract_list(store, ["purchases-data", "purchase-orders", "purchase-orders-data"], active_cid)
    employees = _extract_list(store, ["employees-data"], active_cid)
    payroll = _extract_list(store, ["payroll-data"], active_cid)
    finance_tx = _extract_list(store, ["finance-transactions", "expenses-data"], active_cid)
    tenders = _extract_list(store, ["tenders-data", "consultations-data"], active_cid)

    # Compute Executive Summary KPIs
    total_sales = sum(float(inv.get("total") or inv.get("totalAmount") or 0) for inv in invoices)
    total_paid = sum(float(inv.get("paid") or inv.get("paidAmount") or (inv.get("total") if str(inv.get("status", "")).lower() == "paid" else 0) or 0) for inv in invoices)
    total_unpaid = max(0.0, total_sales - total_paid)
    total_proformas = sum(float(p.get("total") or p.get("totalAmount") or 0) for p in proformas)
    total_purchases = sum(float(p.get("total") or p.get("amount") or 0) for p in purchases)
    total_stock_val = sum(float(p.get("price") or p.get("salePrice") or 0) * float(p.get("quantity") or p.get("stock") or 0) for p in products)

    parts: List[str] = []
    parts.append("""
    <style>
        body { font-family: sans-serif; font-size: 9.5pt; color: #1e293b; line-height: 1.45; }
        h1 { font-size: 17pt; color: #0f172a; margin: 0 0 4pt 0; }
        h2 { font-size: 12.5pt; color: #1e40af; background-color: #eff6ff; padding: 6pt 10pt; margin: 14pt 0 6pt 0; border-left: 4pt solid #1d4ed8; }
        h3 { font-size: 10.5pt; color: #0f172a; margin: 8pt 0 4pt 0; }
        p { margin: 2pt 0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 10pt; }
        th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; padding: 5pt 6pt; font-size: 8.5pt; text-align: left; border: 0.5pt solid #1e3a8a; }
        td { padding: 4.5pt 6pt; font-size: 8.5pt; border: 0.5pt solid #cbd5e1; color: #1e293b; }
        .row-even { background-color: #f8fafc; }
        .meta-box { background-color: #f8fafc; border: 1pt solid #cbd5e1; padding: 8pt 10pt; margin-bottom: 10pt; }
        .inv-card { border: 1pt solid #94a3b8; background-color: #ffffff; padding: 8pt; margin-bottom: 10pt; }
        .badge-paid { color: #15803d; font-weight: bold; }
        .badge-pending { color: #b45309; font-weight: bold; }
    </style>
    """)

    # 1. Cover & Executive Summary
    parts.append(f"""
    <div dir="rtl">
        <h1>التقرير الأرشيفي الشامل لنظام Zeralda ERP</h1>
        <p><b>الشركة / المؤسسة:</b> {_esc(comp_name)} &nbsp;|&nbsp; <b>تاريخ التصدير:</b> {_esc(now_str)}</p>
        <div class="meta-box">
            <p><b>العنوان:</b> {_esc(comp_addr)} &nbsp;|&nbsp; <b>الهاتف:</b> {_esc(comp_phone)} &nbsp;|&nbsp; <b>البريد:</b> {_esc(comp_email)}</p>
            <p><b>السجل التجاري (RC):</b> {_esc(comp_rc)} &nbsp;|&nbsp; <b>الرقم الجبائي (NIF):</b> {_esc(comp_nif)} &nbsp;|&nbsp; <b>NIS:</b> {_esc(comp_nis)} &nbsp;|&nbsp; <b>AI:</b> {_esc(comp_ai)}</p>
        </div>

        <h2>1. الملخص التنفيذي لجميع أقسام النظام (Executive Summary)</h2>
        <table>
            <tr>
                <th>القسم / الوحدة (Module)</th>
                <th>عدد السجلات (Count)</th>
                <th>القيمة المالية الإجمالية ({_esc(currency)})</th>
                <th>ملاحظات وتفاصيل</th>
            </tr>
            <tr>
                <td><b>الفواتير النهائية (Invoices)</b></td>
                <td>{len(invoices)}</td>
                <td><b>{_fmt_num(total_sales)}</b></td>
                <td>المدفوع: {_fmt_num(total_paid)} | المتبقي (الديون): {_fmt_num(total_unpaid)}</td>
            </tr>
            <tr class="row-even">
                <td><b>الفواتير الشكلية / عروض الأسعار (Proformas)</b></td>
                <td>{len(proformas)}</td>
                <td>{_fmt_num(total_proformas)}</td>
                <td>عروض الأسعار المسجلة</td>
            </tr>
            <tr>
                <td><b>الزبائن والعملاء (Customers)</b></td>
                <td>{len(customers)}</td>
                <td>-</td>
                <td>قاعدة بيانات العملاء المسجلين</td>
            </tr>
            <tr class="row-even">
                <td><b>المنتجات والمخزون (Products & Stock)</b></td>
                <td>{len(products)}</td>
                <td>{_fmt_num(total_stock_val)}</td>
                <td>القيمة التقديرية للمخزون الحالي</td>
            </tr>
            <tr>
                <td><b>الموردون والمشتريات (Suppliers & Purchases)</b></td>
                <td>{len(suppliers)} مورد / {len(purchases)} عملية</td>
                <td>{_fmt_num(total_purchases)}</td>
                <td>إجمالي فواتير وأوامر الشراء</td>
            </tr>
            <tr class="row-even">
                <td><b>الموارد البشرية والرواتب (HR & Payroll)</b></td>
                <td>{len(employees)} موظف / {len(payroll)} كشف</td>
                <td>-</td>
                <td>سجلات الموظفين وكشوف الرواتب</td>
            </tr>
            <tr>
                <td><b>المعاملات المالية والمصاريف (Finance)</b></td>
                <td>{len(finance_tx)}</td>
                <td>-</td>
                <td>العمليات المالية والقيود</td>
            </tr>
            <tr class="row-even">
                <td><b>المناقصات والاستشارات (Tenders & Consultations)</b></td>
                <td>{len(tenders)}</td>
                <td>-</td>
                <td>ملفات الصفقات والاستشارات</td>
            </tr>
        </table>
    """)

    # 2. Invoices Register + Detailed Breakdown
    parts.append(f"""
        <h2>2. سجل الفواتير الشامل ({len(invoices)} فاتورة)</h2>
    """)
    if invoices:
        parts.append(f"""
        <table>
            <tr>
                <th>#</th>
                <th>رقم الفاتورة</th>
                <th>التاريخ</th>
                <th>الزبون (Client)</th>
                <th>المبلغ الصافي (HT)</th>
                <th>الضريبة (TVA)</th>
                <th>الإجمالي (TTC)</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>الدفع / الحالة</th>
            </tr>
        """)
        for i, inv in enumerate(invoices, 1):
            inv_num = inv.get("invoiceNumber") or inv.get("number") or inv.get("id") or f"INV-{i}"
            inv_date = inv.get("date") or inv.get("invoiceDate") or "-"
            cust = inv.get("customer") or inv.get("customerName") or "-"
            if isinstance(cust, dict):
                cust = cust.get("name") or cust.get("company") or cust.get("customerName") or "-"
            sub = float(inv.get("subtotal") or inv.get("subTotal") or 0)
            tax = float(inv.get("tax") or inv.get("taxAmount") or 0)
            tot = float(inv.get("total") or inv.get("totalAmount") or 0)
            status_raw = str(inv.get("status") or "Pending")
            paid = float(inv.get("paid") or inv.get("paidAmount") or (tot if status_raw.lower() == "paid" else 0) or 0)
            rem = max(0.0, tot - paid)
            pm = inv.get("paymentMethod") or "-"
            cls = " class='row-even'" if i % 2 == 0 else ""
            parts.append(f"""
            <tr{cls}>
                <td>{i}</td>
                <td><b>{_esc(inv_num)}</b></td>
                <td>{_esc(inv_date)}</td>
                <td>{_esc(cust)}</td>
                <td>{_fmt_num(sub)}</td>
                <td>{_fmt_num(tax)}</td>
                <td><b>{_fmt_num(tot)}</b></td>
                <td>{_fmt_num(paid)}</td>
                <td>{_fmt_num(rem)}</td>
                <td>{_esc(pm)} ({_esc(status_raw)})</td>
            </tr>
            """)
        parts.append("</table>")

        # Detailed items per invoice
        parts.append("<h3>تفاصيل أصناف الفواتير (Detailed Invoice Items)</h3>")
        for i, inv in enumerate(invoices, 1):
            inv_num = inv.get("invoiceNumber") or inv.get("number") or inv.get("id") or f"INV-{i}"
            inv_date = inv.get("date") or inv.get("invoiceDate") or "-"
            cust = inv.get("customer") or inv.get("customerName") or "-"
            if isinstance(cust, dict):
                cust = cust.get("name") or cust.get("company") or "-"
            tot = float(inv.get("total") or inv.get("totalAmount") or 0)
            items = inv.get("items") or inv.get("lineItems") or []
            parts.append(f"""
            <div class="inv-card">
                <p><b>فاتورة رقم: {_esc(inv_num)}</b> &nbsp;|&nbsp; <b>التاريخ:</b> {_esc(inv_date)} &nbsp;|&nbsp; <b>الزبون:</b> {_esc(cust)} &nbsp;|&nbsp; <b>الإجمالي:</b> {_fmt_num(tot)} {_esc(currency)}</p>
            """)
            if isinstance(items, list) and items:
                parts.append("""
                <table>
                    <tr>
                        <th>#</th>
                        <th>البيان / الصنف (Description)</th>
                        <th>الوحدة</th>
                        <th>الكمية (Qty)</th>
                        <th>سعر الوحدة (Unit Price)</th>
                        <th>الإجمالي (Total)</th>
                    </tr>
                """)
                for idx, it in enumerate(items, 1):
                    if not isinstance(it, dict):
                        continue
                    desc = it.get("description") or it.get("name") or it.get("product") or "-"
                    fp = str(it.get("fp") or "").strip()
                    if fp:
                        desc = f"[{fp}] {desc}"
                    unit = it.get("unit") or "U"
                    qty = it.get("quantity") or it.get("qty") or 1
                    price = it.get("price") or it.get("unitPrice") or 0
                    ltot = it.get("total") or it.get("lineTotal") or (float(qty or 0) * float(price or 0))
                    parts.append(f"""
                    <tr>
                        <td>{idx}</td>
                        <td>{_esc(desc)}</td>
                        <td>{_esc(unit)}</td>
                        <td>{_esc(qty)}</td>
                        <td>{_fmt_num(price)}</td>
                        <td><b>{_fmt_num(ltot)}</b></td>
                    </tr>
                    """)
                parts.append("</table>")
            parts.append("</div>")
    else:
        parts.append("<p>لا توجد فواتير مسجلة حالياً.</p>")

    # 3. Proformas / Quotes
    parts.append(f"<h2>3. سجل الفواتير الشكلية وعروض الأسعار ({len(proformas)})</h2>")
    if proformas:
        parts.append("""
        <table>
            <tr>
                <th>#</th>
                <th>رقم العرض (Proforma)</th>
                <th>التاريخ</th>
                <th>الزبون</th>
                <th>عدد الأصناف</th>
                <th>الإجمالي (TTC)</th>
                <th>الحالة</th>
            </tr>
        """)
        for i, pf in enumerate(proformas, 1):
            pnum = pf.get("proformaNumber") or pf.get("number") or pf.get("id") or f"PF-{i}"
            pdate = pf.get("date") or "-"
            cust = pf.get("customer") or pf.get("customerName") or "-"
            if isinstance(cust, dict):
                cust = cust.get("name") or cust.get("company") or "-"
            pitems = pf.get("items") if isinstance(pf.get("items"), list) else []
            ptot = pf.get("total") or pf.get("totalAmount") or 0
            pstat = pf.get("status") or "Draft"
            cls = " class='row-even'" if i % 2 == 0 else ""
            parts.append(f"""
            <tr{cls}>
                <td>{i}</td>
                <td><b>{_esc(pnum)}</b></td>
                <td>{_esc(pdate)}</td>
                <td>{_esc(cust)}</td>
                <td>{len(pitems)}</td>
                <td><b>{_fmt_num(ptot)}</b></td>
                <td>{_esc(pstat)}</td>
            </tr>
            """)
        parts.append("</table>")
    else:
        parts.append("<p>لا توجد فواتير شكلية مسجلة.</p>")

    # 4. Customers
    parts.append(f"<h2>4. قاعدة بيانات الزبائن والعملاء ({len(customers)})</h2>")
    if customers:
        parts.append("""
        <table>
            <tr>
                <th>#</th>
                <th>الاسم / المؤسسة</th>
                <th>الهاتف</th>
                <th>البريد الإلكتروني</th>
                <th>العنوان / الولاية</th>
                <th>البيانات الجبائية (NIF / RC)</th>
            </tr>
        """)
        for i, c in enumerate(customers, 1):
            name = c.get("name") or c.get("fullName") or c.get("company") or "-"
            phone = c.get("phone") or c.get("mobile") or "-"
            email = c.get("email") or "-"
            addr = c.get("address") or c.get("city") or "-"
            tax_info = " / ".join(filter(None, [str(c.get("nif") or "").strip(), str(c.get("rc") or "").strip()])) or "-"
            cls = " class='row-even'" if i % 2 == 0 else ""
            parts.append(f"""
            <tr{cls}>
                <td>{i}</td>
                <td><b>{_esc(name)}</b></td>
                <td>{_esc(phone)}</td>
                <td>{_esc(email)}</td>
                <td>{_esc(addr)}</td>
                <td>{_esc(tax_info)}</td>
            </tr>
            """)
        parts.append("</table>")
    else:
        parts.append("<p>لا يوجد زبائن مسجلون.</p>")

    # 5. Products & Inventory
    parts.append(f"<h2>5. سجل المنتجات والمخزون ({len(products)})</h2>")
    if products:
        parts.append("""
        <table>
            <tr>
                <th>#</th>
                <th>الرمز (SKU/Code)</th>
                <th>اسم المنتج / الخدمة</th>
                <th>التصنيف</th>
                <th>الكمية المتوفرة</th>
                <th>سعر الوحدة</th>
                <th>قيمة المخزون</th>
            </tr>
        """)
        for i, p in enumerate(products, 1):
            code = p.get("sku") or p.get("code") or p.get("id") or "-"
            name = p.get("name") or p.get("title") or "-"
            cat = p.get("category") or "-"
            qty = float(p.get("quantity") or p.get("stock") or 0)
            price = float(p.get("price") or p.get("salePrice") or 0)
            val = qty * price
            cls = " class='row-even'" if i % 2 == 0 else ""
            parts.append(f"""
            <tr{cls}>
                <td>{i}</td>
                <td>{_esc(code)}</td>
                <td><b>{_esc(name)}</b></td>
                <td>{_esc(cat)}</td>
                <td>{_esc(qty)}</td>
                <td>{_fmt_num(price)}</td>
                <td><b>{_fmt_num(val)}</b></td>
            </tr>
            """)
        parts.append("</table>")
    else:
        parts.append("<p>لا توجد منتجات مسجلة.</p>")

    # 6. Suppliers & Purchases
    parts.append(f"<h2>6. الموردون والمشتريات ({len(suppliers)} مورد / {len(purchases)} عملية شراء)</h2>")
    if suppliers:
        parts.append("""
        <table>
            <tr>
                <th>#</th>
                <th>اسم المورد</th>
                <th>الهاتف</th>
                <th>البريد الإلكتروني</th>
                <th>العنوان</th>
            </tr>
        """)
        for i, s in enumerate(suppliers, 1):
            cls = " class='row-even'" if i % 2 == 0 else ""
            parts.append(f"""
            <tr{cls}>
                <td>{i}</td>
                <td><b>{_esc(s.get("name") or s.get("company"))}</b></td>
                <td>{_esc(s.get("phone"))}</td>
                <td>{_esc(s.get("email"))}</td>
                <td>{_esc(s.get("address"))}</td>
            </tr>
            """)
        parts.append("</table>")

    if purchases:
        parts.append("""
        <table>
            <tr>
                <th>#</th>
                <th>رقم العملية</th>
                <th>التاريخ</th>
                <th>المورد</th>
                <th>المبلغ الإجمالي</th>
                <th>الحالة</th>
            </tr>
        """)
        for i, pu in enumerate(purchases, 1):
            cls = " class='row-even'" if i % 2 == 0 else ""
            parts.append(f"""
            <tr{cls}>
                <td>{i}</td>
                <td><b>{_esc(pu.get("number") or pu.get("id"))}</b></td>
                <td>{_esc(pu.get("date"))}</td>
                <td>{_esc(pu.get("supplier") or pu.get("supplierName"))}</td>
                <td><b>{_fmt_num(pu.get("total") or pu.get("amount") or 0)}</b></td>
                <td>{_esc(pu.get("status"))}</td>
            </tr>
            """)
        parts.append("</table>")

    # 7. HR & Employees
    parts.append(f"<h2>7. الموارد البشرية والموظفون ({len(employees)})</h2>")
    if employees:
        parts.append("""
        <table>
            <tr>
                <th>#</th>
                <th>اسم الموظف</th>
                <th>المنصب / الوظيفة</th>
                <th>القسم</th>
                <th>الهاتف</th>
                <th>الراتب الأساسي</th>
            </tr>
        """)
        for i, emp in enumerate(employees, 1):
            cls = " class='row-even'" if i % 2 == 0 else ""
            ename = emp.get("name") or emp.get("fullName") or f"{emp.get('firstName', '')} {emp.get('lastName', '')}".strip() or "-"
            parts.append(f"""
            <tr{cls}>
                <td>{i}</td>
                <td><b>{_esc(ename)}</b></td>
                <td>{_esc(emp.get("position") or emp.get("role") or emp.get("jobTitle"))}</td>
                <td>{_esc(emp.get("department"))}</td>
                <td>{_esc(emp.get("phone"))}</td>
                <td>{_fmt_num(emp.get("salary") or emp.get("baseSalary") or 0)}</td>
            </tr>
            """)
        parts.append("</table>")
    else:
        parts.append("<p>لا توجد سجلات موظفين.</p>")

    # 8. Finance & Tenders
    if finance_tx:
        parts.append(f"<h2>8. المعاملات المالية والمصاريف ({len(finance_tx)})</h2>")
        parts.append("""
        <table>
            <tr>
                <th>#</th>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>البيان / الوصف</th>
                <th>المبلغ</th>
            </tr>
        """)
        for i, tx in enumerate(finance_tx, 1):
            cls = " class='row-even'" if i % 2 == 0 else ""
            parts.append(f"""
            <tr{cls}>
                <td>{i}</td>
                <td>{_esc(tx.get("date") or tx.get("createdAt"))}</td>
                <td>{_esc(tx.get("type") or tx.get("category"))}</td>
                <td>{_esc(tx.get("description") or tx.get("title") or tx.get("note"))}</td>
                <td><b>{_fmt_num(tx.get("amount") or tx.get("total") or 0)}</b></td>
            </tr>
            """)
        parts.append("</table>")

    parts.append("</div>")
    full_html = "".join(parts)

    bio = io.BytesIO()
    story = fitz.Story(html=full_html)
    writer = fitz.DocumentWriter(bio)
    mediabox = fitz.paper_rect("a4")
    where = mediabox + (32, 46, -32, -42)
    more = 1
    while more:
        device = writer.begin_page(mediabox)
        more, _ = story.place(where)
        story.draw(device)
        writer.end_page()
    writer.close()

    # Stamp header bar and page numbers on every page
    doc = fitz.open("pdf", bio.getvalue())
    total_pages = len(doc)
    accent = (0.12, 0.25, 0.69)
    gray = (0.42, 0.45, 0.50)
    light_line = (0.85, 0.88, 0.92)
    for idx, page in enumerate(doc):
        page.draw_rect(fitz.Rect(0, 0, 595, 6), color=accent, fill=accent)
        page.draw_line(fitz.Point(32, 34), fitz.Point(563, 34), color=light_line, width=0.5)
        page.insert_text(
            fitz.Point(32, 26),
            f"Zeralda ERP - Full Archive Report | {comp_name[:40]}",
            fontsize=8,
            fontname="helv",
            color=gray,
        )
        page.draw_line(fitz.Point(32, 810), fitz.Point(563, 810), color=light_line, width=0.5)
        page.insert_text(
            fitz.Point(32, 824),
            f"Generated by Zeralda ERP on {now_str}",
            fontsize=7.5,
            fontname="helv",
            color=gray,
        )
        page.insert_text(
            fitz.Point(500, 824),
            f"Page {idx + 1} / {total_pages}",
            fontsize=8,
            fontname="helv",
            color=gray,
        )

    out_bytes = doc.tobytes(deflate=True)
    doc.close()
    return out_bytes
