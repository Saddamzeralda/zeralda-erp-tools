"""Invoice & Master ERP PDF generator using PyMuPDF.

Features:
- Individual high-fidelity invoice, proforma, purchase, and delivery PDFs with HarfBuzz Arabic RTL and French typography.
- Comprehensive Master Archive PDF covering all 8 ERP modules.
- Multi-document organized archive (.zip) structured by folder categories.
"""
from __future__ import annotations

import datetime
import html as _html
import io
import json
import re
from typing import Any, Dict, List, Optional
import zipfile


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


def _legacy_generate_invoice_pdf(inv: Dict[str, Any], doc_type: str = "invoice") -> Optional[bytes]:
    """Generate a PDF from an invoice/proforma dict using canvas fallback."""
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


def generate_single_document_pdf(
    inv: Dict[str, Any],
    doc_type: str = "invoice",
    company_info: Optional[Dict[str, Any]] = None,
    currency: str = "DZD",
) -> Optional[bytes]:
    """Generate a high-fidelity, single/multi-page PDF for an invoice, proforma, purchase, or delivery note
    with full Arabic RTL and French bilingual typography, company fiscal header, and itemized breakdown.
    """
    try:
        import pymupdf as fitz
    except ImportError:
        try:
            import fitz  # type: ignore
        except ImportError:
            return None

    # Colors & Titles mapping
    doc_type = (doc_type or "invoice").lower()
    if doc_type in ("proforma", "devis", "quotation"):
        title_ar = "فاتورة شكلية / عرض أسعار"
        title_fr = "FACTURE PROFORMA / DEVIS"
        accent = "#047857"
        accent_rgb = (0.02, 0.47, 0.34)
        accent_bg = "#ecfdf5"
        party_title_ar = "معلومات الزبون / العميل"
        party_title_fr = "Client / Prospect"
        is_purchase = False
    elif doc_type in ("purchase", "achat", "order"):
        title_ar = "فاتورة شراء / وصل طلب"
        title_fr = "FACTURE D'ACHAT / BON DE COMMANDE"
        accent = "#9a3412"
        accent_rgb = (0.60, 0.20, 0.07)
        accent_bg = "#fff7ed"
        party_title_ar = "معلومات المورد"
        party_title_fr = "Fournisseur"
        is_purchase = True
    elif doc_type in ("delivery", "bl", "bon_livraison"):
        title_ar = "وصل تسليم وبضاعة"
        title_fr = "BON DE LIVRAISON"
        accent = "#4338ca"
        accent_rgb = (0.26, 0.22, 0.79)
        accent_bg = "#eef2ff"
        party_title_ar = "معلومات الزبون / المستلم"
        party_title_fr = "Destinataire / Client"
        is_purchase = False
    else:
        title_ar = "فاتورة بيع رسمية"
        title_fr = "FACTURE DE VENTE"
        accent = "#1e3a8a"
        accent_rgb = (0.12, 0.23, 0.54)
        accent_bg = "#eff6ff"
        party_title_ar = "معلومات الزبون"
        party_title_fr = "Client"
        is_purchase = False

    comp = company_info or {}
    comp_name = comp.get("name") or comp.get("companyName") or "Zeralda ERP"
    comp_rc = comp.get("rc") or comp.get("regNumber") or "-"
    comp_nif = comp.get("nif") or comp.get("taxId") or "-"
    comp_nis = comp.get("nis") or "-"
    comp_ai = comp.get("ai") or comp.get("artImp") or "-"
    comp_phone = comp.get("phone") or "-"
    comp_email = comp.get("email") or "-"
    comp_addr = comp.get("address") or "-"

    # Document Number & Dates
    if doc_type == "proforma":
        doc_num = str(inv.get("proformaNumber") or inv.get("number") or inv.get("id") or "N/A")
    elif doc_type == "purchase":
        doc_num = str(inv.get("orderNumber") or inv.get("number") or inv.get("id") or "N/A")
    else:
        doc_num = str(inv.get("invoiceNumber") or inv.get("number") or inv.get("id") or "N/A")

    doc_date = str(inv.get("date") or inv.get("invoiceDate") or inv.get("proformaDate") or inv.get("orderDate") or "")
    if "T" in doc_date:
        doc_date = doc_date.split("T")[0]
    doc_due = str(inv.get("dueDate") or inv.get("due_date") or "")
    if "T" in doc_due:
        doc_due = doc_due.split("T")[0]

    status_raw = str(inv.get("status") or "pending").strip().lower()
    if status_raw in ("paid", "payé", "payee", "payée"):
        status_badge = "<span style='color: #15803d; font-weight: bold;'>مدفوعة (Payée)</span>"
    elif status_raw in ("partial", "partiel", "partielle"):
        status_badge = "<span style='color: #b45309; font-weight: bold;'>دفع جزئي (Partiel)</span>"
    else:
        status_badge = "<span style='color: #64748b; font-weight: bold;'>قيد المعالجة (En attente)</span>"

    pay_method = inv.get("paymentMethod") or inv.get("payment_method") or "-"

    # Partner details
    if is_purchase:
        p_obj = inv.get("supplier") or inv.get("supplierName") or {}
    else:
        p_obj = inv.get("customer") or inv.get("customerName") or {}

    if isinstance(p_obj, dict):
        p_name = p_obj.get("name") or p_obj.get("company") or p_obj.get("customerName") or p_obj.get("supplierName") or "-"
        p_phone = p_obj.get("phone") or inv.get("customerPhone") or inv.get("phone") or "-"
        p_addr = p_obj.get("address") or p_obj.get("city") or inv.get("customerAddress") or "-"
        p_rc = p_obj.get("rc") or "-"
        p_nif = p_obj.get("nif") or p_obj.get("taxId") or "-"
        p_nis = p_obj.get("nis") or "-"
        p_ai = p_obj.get("ai") or "-"
    else:
        p_name = str(p_obj or "-")
        p_phone = inv.get("customerPhone") or inv.get("phone") or "-"
        p_addr = inv.get("customerAddress") or inv.get("address") or "-"
        p_rc, p_nif, p_nis, p_ai = "-", "-", "-", "-"

    items = inv.get("items") or inv.get("lineItems") or []
    if not isinstance(items, list):
        items = []

    # Financial sums
    sum_items = 0.0
    for it in items:
        if isinstance(it, dict):
            q = float(it.get("quantity") or it.get("qty") or 1)
            p = float(it.get("price") or it.get("unitPrice") or 0)
            lt = float(it.get("total") or it.get("lineTotal") or (q * p))
            sum_items += lt

    subtotal = float(inv.get("subtotal") or inv.get("subTotal") or sum_items or 0)
    discount = float(inv.get("discount") or inv.get("remise") or 0)
    tax = float(inv.get("tax") or inv.get("taxAmount") or inv.get("tva") or 0)
    total_val = float(inv.get("total") or inv.get("totalAmount") or inv.get("amount") or (subtotal - discount + tax) or 0)
    paid_val = float(inv.get("paid") or inv.get("paidAmount") or (total_val if status_raw in ("paid", "payé", "payee", "payée") else 0))
    balance_val = max(0.0, total_val - paid_val)

    html_parts = []
    html_parts.append(f"""
    <style>
        body {{ font-family: sans-serif; font-size: 8.5pt; color: #1e293b; line-height: 1.35; }}
        table {{ width: 100%; border-collapse: collapse; margin-bottom: 7pt; }}
        .header-tbl {{ border: none; margin-bottom: 10pt; }}
        .header-tbl td {{ border: none; padding: 2pt 4pt; vertical-align: top; }}
        .comp-title {{ font-size: 14.5pt; font-weight: bold; color: {accent}; margin: 0 0 3pt 0; }}
        .comp-meta {{ font-size: 8pt; color: #475569; line-height: 1.45; }}
        .doc-badge {{ background-color: {accent_bg}; border: 1.5pt solid {accent}; padding: 7pt 9pt; text-align: center; border-radius: 4pt; }}
        .doc-title-ar {{ font-size: 11.5pt; font-weight: bold; color: {accent}; margin: 0; }}
        .doc-title-fr {{ font-size: 9pt; font-weight: bold; color: #334155; margin: 2pt 0 0 0; }}
        .doc-meta-line {{ font-size: 8pt; color: #1e293b; margin: 1.5pt 0; }}

        .partner-box {{ width: 100%; border-collapse: collapse; margin-bottom: 10pt; }}
        .partner-box td {{ width: 50%; border: 1pt solid #cbd5e1; background-color: #f8fafc; padding: 6pt 8pt; vertical-align: top; }}
        .box-header {{ font-size: 8.5pt; font-weight: bold; color: {accent}; border-bottom: 0.5pt solid #cbd5e1; padding-bottom: 2pt; margin-bottom: 3pt; }}

        .items-tbl th {{ background-color: {accent}; color: #ffffff; font-weight: bold; padding: 4.5pt 5pt; font-size: 8pt; text-align: left; border: 0.5pt solid {accent}; }}
        .items-tbl td {{ padding: 4pt 5pt; font-size: 8pt; border: 0.5pt solid #cbd5e1; color: #1e293b; }}
        .row-even {{ background-color: #f8fafc; }}

        .totals-tbl {{ width: 100%; border-collapse: collapse; margin-top: 2pt; }}
        .totals-tbl td {{ padding: 3.5pt 6pt; font-size: 8pt; border: 0.5pt solid #cbd5e1; }}
        .final-row {{ background-color: {accent_bg}; font-size: 9pt; font-weight: bold; color: {accent}; border: 1pt solid {accent}; }}

        .footer-tbl {{ width: 100%; border: none; margin-top: 10pt; }}
        .footer-tbl td {{ border: none; padding: 3pt; vertical-align: top; }}
        .stamp-card {{ border: 1pt dashed #94a3b8; height: 55pt; text-align: center; padding-top: 5pt; font-size: 7.5pt; color: #64748b; background-color: #fafafa; border-radius: 4pt; }}
    </style>
    """)

    html_parts.append(f"""
    <div dir="rtl">
        <table class="header-tbl">
            <tr>
                <td style="width: 58%;">
                    <div class="comp-title">{_esc(comp_name)}</div>
                    <div class="comp-meta">
                        <p style="margin: 1pt 0;"><b>العنوان:</b> {_esc(comp_addr)}</p>
                        <p style="margin: 1pt 0;"><b>الهاتف:</b> {_esc(comp_phone)} &nbsp;|&nbsp; <b>البريد:</b> {_esc(comp_email)}</p>
                        <p style="margin: 1pt 0;"><b>السجل التجاري (RC):</b> {_esc(comp_rc)} &nbsp;|&nbsp; <b>الرقم الجبائي (NIF):</b> {_esc(comp_nif)}</p>
                        <p style="margin: 1pt 0;"><b>NIS:</b> {_esc(comp_nis)} &nbsp;|&nbsp; <b>AI (المادة):</b> {_esc(comp_ai)}</p>
                    </div>
                </td>
                <td style="width: 42%;">
                    <div class="doc-badge">
                        <div class="doc-title-ar">{title_ar}</div>
                        <div class="doc-title-fr">{title_fr}</div>
                        <div class="doc-meta-line" style="margin-top: 4pt;"><b>الرقم / N°:</b> <span style="font-size: 10pt; font-weight: bold; color: {accent};">{_esc(doc_num)}</span></div>
                        <div class="doc-meta-line"><b>التاريخ / Date:</b> {_esc(doc_date)}</div>
                        {"<div class='doc-meta-line'><b>الاستحقاق / Échéance:</b> " + _esc(doc_due) + "</div>" if doc_due else ""}
                        <div class="doc-meta-line"><b>الحالة / Statut:</b> {status_badge}</div>
                    </div>
                </td>
            </tr>
        </table>

        <table class="partner-box">
            <tr>
                <td>
                    <div class="box-header">{party_title_ar} ({party_title_fr})</div>
                    <p style="margin: 2pt 0; font-size: 9pt;"><b>{_esc(p_name)}</b></p>
                    <p style="margin: 1.5pt 0;"><b>العنوان:</b> {_esc(p_addr)}</p>
                    <p style="margin: 1.5pt 0;"><b>الهاتف:</b> {_esc(p_phone)}</p>
                    {"<p style='margin: 1.5pt 0;'><b>NIF:</b> " + _esc(p_nif) + " &nbsp;|&nbsp; <b>RC:</b> " + _esc(p_rc) + "</p>" if (p_nif != "-" or p_rc != "-") else ""}
                </td>
                <td>
                    <div class="box-header">شروط المعاملة والدفع (Conditions de Paiement)</div>
                    <p style="margin: 2pt 0;"><b>طريقة الدفع:</b> {_esc(pay_method)}</p>
                    <p style="margin: 2pt 0;"><b>العملة المعتمدة:</b> {_esc(currency)}</p>
                    <p style="margin: 2pt 0;"><b>حالة الاستلام:</b> معتمد ومطابق</p>
                </td>
            </tr>
        </table>

        <table class="items-tbl">
            <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 47%;">البيان / تعيين الصنف (Désignation)</th>
                <th style="width: 8%;">الوحدة</th>
                <th style="width: 10%;">الكمية</th>
                <th style="width: 14%;">سعر الوحدة ({_esc(currency)})</th>
                <th style="width: 16%;">الإجمالي ({_esc(currency)})</th>
            </tr>
    """)

    if items:
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
            cls = " class='row-even'" if idx % 2 == 0 else ""
            html_parts.append(f"""
            <tr{cls}>
                <td>{idx}</td>
                <td>{_esc(desc)}</td>
                <td>{_esc(unit)}</td>
                <td>{_esc(qty)}</td>
                <td>{_fmt_num(price)}</td>
                <td><b>{_fmt_num(ltot)}</b></td>
            </tr>
            """)
    else:
        html_parts.append("<tr><td colspan='6' style='text-align: center; padding: 10pt;'>لا توجد بنود مسجلة في هذا المستند.</td></tr>")

    html_parts.append("</table>")

    # Financial totals block + Remarks
    notes = inv.get("notes") or inv.get("remarks") or ""
    html_parts.append(f"""
        <table style="width: 100%; border: none; margin-bottom: 8pt;">
            <tr>
                <td style="width: 50%; vertical-align: top; border: none; padding-right: 6pt;">
                    {"<div style='background: #f8fafc; border: 1pt solid #cbd5e1; padding: 5pt 7pt; border-radius: 4pt;'><div class='box-header'>ملاحظات (Notes / Conditions):</div><p style='margin: 0; font-size: 7.5pt; color: #475569;'>" + _esc(notes) + "</p></div>" if notes else ""}
                </td>
                <td style="width: 50%; vertical-align: top; border: none;">
                    <table class="totals-tbl">
                        <tr><td>المجموع قبل الضريبة (Total HT):</td><td><b>{_fmt_num(subtotal)} {_esc(currency)}</b></td></tr>
                        {"<tr><td>التخفيض (Remise):</td><td>-" + _fmt_num(discount) + " " + _esc(currency) + "</td></tr>" if discount > 0 else ""}
                        {"<tr><td>الرسم على القيمة المضافة (TVA):</td><td>+" + _fmt_num(tax) + " " + _esc(currency) + "</td></tr>" if tax > 0 else ""}
                        <tr class="final-row"><td>المبلغ الإجمالي (Net à Payer):</td><td>{_fmt_num(total_val)} {_esc(currency)}</td></tr>
                        {"<tr><td>المبلغ المدفوع (Versé):</td><td>" + _fmt_num(paid_val) + " " + _esc(currency) + "</td></tr>" if doc_type == "invoice" else ""}
                        {"<tr><td>المتبقي المستحق (Solde):</td><td><b style='color: #b91c1c;'>" + _fmt_num(balance_val) + " " + _esc(currency) + "</b></td></tr>" if (doc_type == "invoice" and balance_val > 0) else ""}
                    </table>
                </td>
            </tr>
        </table>

        <table class="footer-tbl">
            <tr>
                <td style="width: 50%;">
                    <div class="stamp-card">
                        <b>ختم وتوقيع المؤسسة</b><br>
                        Cachet & Signature de l'Entreprise
                    </div>
                </td>
                <td style="width: 50%;">
                    <div class="stamp-card">
                        <b>توقيع واستلام الطرف المعني</b><br>
                        Accord & Réception du Destinataire
                    </div>
                </td>
            </tr>
        </table>
    </div>
    """)

    full_html = "".join(html_parts)
    bio = io.BytesIO()
    story = fitz.Story(html=full_html)
    writer = fitz.DocumentWriter(bio)
    mediabox = fitz.paper_rect("a4")
    where = mediabox + (30, 38, -30, -36)
    more = 1
    while more:
        dev = writer.begin_page(mediabox)
        more, _ = story.place(where)
        story.draw(dev)
        writer.end_page()
    writer.close()

    # Stamping
    doc = fitz.open("pdf", bio.getvalue())
    total_pages = len(doc)
    gray = (0.42, 0.45, 0.50)
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    for idx, page in enumerate(doc):
        page.draw_rect(fitz.Rect(0, 0, 595, 5), color=accent_rgb, fill=accent_rgb)
        page.draw_line(fitz.Point(30, 26), fitz.Point(565, 26), color=(0.88, 0.90, 0.93), width=0.5)
        page.insert_text(
            fitz.Point(30, 20),
            f"{comp_name[:35]} | {title_fr} N° {doc_num}",
            fontsize=7.5,
            fontname="helv",
            color=gray,
        )
        page.draw_line(fitz.Point(30, 818), fitz.Point(565, 818), color=(0.88, 0.90, 0.93), width=0.5)
        page.insert_text(
            fitz.Point(30, 828),
            f"Zeralda ERP | {now_str}",
            fontsize=7,
            fontname="helv",
            color=gray,
        )
        page.insert_text(
            fitz.Point(505, 828),
            f"Page {idx + 1} / {total_pages}",
            fontsize=7.5,
            fontname="helv",
            color=gray,
        )

    out_bytes = doc.tobytes(deflate=True)
    doc.close()
    return out_bytes


def generate_invoice_pdf(
    inv: Dict[str, Any],
    doc_type: str = "invoice",
    company_info: Optional[Dict[str, Any]] = None,
    currency: str = "DZD",
) -> Optional[bytes]:
    """Generate a PDF from an invoice/proforma/purchase dict. Returns bytes or None."""
    try:
        pdf_bytes = generate_single_document_pdf(inv, doc_type=doc_type, company_info=company_info, currency=currency)
        if pdf_bytes:
            return pdf_bytes
    except Exception:
        pass
    return _legacy_generate_invoice_pdf(inv, doc_type=doc_type)


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


def _clean_path_segment(name: str, max_len: int = 40) -> str:
    """Sanitize filename/folder segment removing path separators and forbidden characters."""
    s = re.sub(r'[/\\:*?"<>|#\x00-\x1f]', '-', str(name or '').strip())
    s = re.sub(r'\s+', '_', s)
    s = re.sub(r'-+', '-', s)
    return s[:max_len] or 'Doc'


def get_organized_invoices_file_list(
    store: Dict[str, Any],
    company_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Generate individual PDF files for all invoice types in the store,
    grouped by folder category with metadata for ZIP packing and Google Drive upload.
    """
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

    currency = settings.get("systemCurrency") or store.get("system-currency") or "DZD"

    # Extract all document collections
    invoices = _extract_list(store, ["invoices-data"], active_cid)
    proformas = _extract_list(store, ["proformas-data"], active_cid)
    purchases = _extract_list(store, ["purchases-data", "purchase-orders", "purchase-orders-data"], active_cid)
    deliveries = _extract_list(store, ["delivery-notes", "bons-livraison", "delivery-notes-data"], active_cid)

    files_list: List[Dict[str, Any]] = []

    # 1. Sales Invoices
    folder_invoices = "01_فواتير_المبيعات_Sales_Invoices"
    drive_folder_invoices = "01_فواتير المبيعات (Sales Invoices)"
    for idx, inv in enumerate(invoices, 1):
        num = str(inv.get("number") or inv.get("invoiceNumber") or inv.get("id") or f"INV-{idx}")
        cust = inv.get("customer") or inv.get("customerName") or "Client"
        if isinstance(cust, dict):
            cust = cust.get("name") or cust.get("company") or "Client"
        dt = str(inv.get("date") or inv.get("invoiceDate") or "").split("T")[0] or "nodate"
        fname = f"Facture_{_clean_path_segment(num)}_{_clean_path_segment(cust)}_{_clean_path_segment(dt)}.pdf"
        pdf_bytes = generate_single_document_pdf(inv, doc_type="invoice", company_info=company_info, currency=currency)
        if pdf_bytes:
            files_list.append({
                "folder": folder_invoices,
                "drive_folder": drive_folder_invoices,
                "filename": fname,
                "pdf_bytes": pdf_bytes,
                "doc_type": "invoice",
                "number": num,
                "date": dt,
                "partner": str(cust),
                "amount": float(inv.get("total") or inv.get("totalAmount") or 0),
            })

    # 2. Proformas & Quotations
    folder_proformas = "02_الفواتير_الشكلية_Proforma_Invoices"
    drive_folder_proformas = "02_الفواتير الشكلية وعروض الأسعار (Proformas)"
    for idx, prof in enumerate(proformas, 1):
        num = str(prof.get("proformaNumber") or prof.get("number") or prof.get("id") or f"PRO-{idx}")
        cust = prof.get("customer") or prof.get("customerName") or "Client"
        if isinstance(cust, dict):
            cust = cust.get("name") or cust.get("company") or "Client"
        dt = str(prof.get("date") or prof.get("proformaDate") or "").split("T")[0] or "nodate"
        fname = f"Proforma_{_clean_path_segment(num)}_{_clean_path_segment(cust)}_{_clean_path_segment(dt)}.pdf"
        pdf_bytes = generate_single_document_pdf(prof, doc_type="proforma", company_info=company_info, currency=currency)
        if pdf_bytes:
            files_list.append({
                "folder": folder_proformas,
                "drive_folder": drive_folder_proformas,
                "filename": fname,
                "pdf_bytes": pdf_bytes,
                "doc_type": "proforma",
                "number": num,
                "date": dt,
                "partner": str(cust),
                "amount": float(prof.get("total") or prof.get("totalAmount") or 0),
            })

    # 3. Purchases & Supplier Invoices
    folder_purchases = "03_فواتير_الشراء_Purchase_Invoices"
    drive_folder_purchases = "03_فواتير الشراء والتوريد (Purchases)"
    for idx, purch in enumerate(purchases, 1):
        num = str(purch.get("orderNumber") or purch.get("number") or purch.get("id") or f"ACH-{idx}")
        supp = purch.get("supplier") or purch.get("supplierName") or "Fournisseur"
        if isinstance(supp, dict):
            supp = supp.get("name") or supp.get("company") or "Fournisseur"
        dt = str(purch.get("date") or purch.get("orderDate") or "").split("T")[0] or "nodate"
        fname = f"Achat_{_clean_path_segment(num)}_{_clean_path_segment(supp)}_{_clean_path_segment(dt)}.pdf"
        pdf_bytes = generate_single_document_pdf(purch, doc_type="purchase", company_info=company_info, currency=currency)
        if pdf_bytes:
            files_list.append({
                "folder": folder_purchases,
                "drive_folder": drive_folder_purchases,
                "filename": fname,
                "pdf_bytes": pdf_bytes,
                "doc_type": "purchase",
                "number": num,
                "date": dt,
                "partner": str(supp),
                "amount": float(purch.get("total") or purch.get("amount") or 0),
            })

    # 4. Delivery Notes (if any)
    if deliveries:
        folder_deliveries = "04_وصول_التسليم_Delivery_Notes"
        drive_folder_deliveries = "04_وصول التسليم (Bons de Livraison)"
        for idx, deliv in enumerate(deliveries, 1):
            num = str(deliv.get("number") or deliv.get("deliveryNumber") or deliv.get("id") or f"BL-{idx}")
            cust = deliv.get("customer") or deliv.get("customerName") or "Client"
            if isinstance(cust, dict):
                cust = cust.get("name") or cust.get("company") or "Client"
            dt = str(deliv.get("date") or "").split("T")[0] or "nodate"
            fname = f"BL_{_clean_path_segment(num)}_{_clean_path_segment(cust)}_{_clean_path_segment(dt)}.pdf"
            pdf_bytes = generate_single_document_pdf(deliv, doc_type="delivery", company_info=company_info, currency=currency)
            if pdf_bytes:
                files_list.append({
                    "folder": folder_deliveries,
                    "drive_folder": drive_folder_deliveries,
                    "filename": fname,
                    "pdf_bytes": pdf_bytes,
                    "doc_type": "delivery",
                    "number": num,
                    "date": dt,
                    "partner": str(cust),
                    "amount": float(deliv.get("total") or 0),
                })

    # 5. Master General Report
    master_bytes = generate_full_erp_pdf_report(store, company_id=active_cid)
    if master_bytes:
        comp_clean = _clean_path_segment(company_info.get("name") or "Zeralda_ERP")
        now_dt = datetime.datetime.now().strftime("%Y-%m-%d")
        files_list.append({
            "folder": "00_التقرير_الأرشيفي_الشامل_Master_Archive",
            "drive_folder": "00_التقرير الأرشيفي الشامل (Master Archive)",
            "filename": f"Zeralda_ERP_Master_Report_{comp_clean}_{now_dt}.pdf",
            "pdf_bytes": master_bytes,
            "doc_type": "master_report",
            "number": "FULL-ARCHIVE",
            "date": now_dt,
            "partner": str(company_info.get("name") or "Zeralda ERP"),
            "amount": sum(f.get("amount", 0) for f in files_list if f.get("doc_type") == "invoice"),
        })

    return files_list


def generate_organized_invoices_zip(
    store: Dict[str, Any],
    company_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate an organized ZIP archive containing individual PDFs for all invoice types,
    structured into neat categorized folders (Sales, Proformas, Purchases, Delivery Notes, Master Report).
    """
    files = get_organized_invoices_file_list(store, company_id=company_id)
    bio = io.BytesIO()

    # Company name and export details
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    comp_name = "Zeralda ERP"
    settings = store.get("zeralda-settings") or {}
    if isinstance(settings, str):
        try:
            settings = json.loads(settings)
        except Exception:
            settings = {}
    if isinstance(settings, dict):
        comp_name = settings.get("companyName") or comp_name

    sales_invs = [f for f in files if f.get("doc_type") == "invoice"]
    prof_invs = [f for f in files if f.get("doc_type") == "proforma"]
    purch_invs = [f for f in files if f.get("doc_type") == "purchase"]
    deliv_invs = [f for f in files if f.get("doc_type") == "delivery"]
    master_invs = [f for f in files if f.get("doc_type") == "master_report"]

    total_sales_amt = sum(f.get("amount", 0) for f in sales_invs)
    total_purch_amt = sum(f.get("amount", 0) for f in purch_invs)

    readme_lines = [
        "=================================================================",
        f" أرشيف الفواتير المنظمة والمصنفة - {comp_name}",
        f" Zeralda ERP - Organized Invoices Archive",
        f" تاريخ التصدير / Date: {now_str}",
        "=================================================================",
        "",
        "هذا الأرشيف يحتوي على جميع فواتير ووثائق المؤسسة مرتبة في مجلدات منفصلة:",
        "",
        f"• فواتير المبيعات (Sales Invoices): {len(sales_invs)} ملف | إجمالي: {total_sales_amt:,.2f} DZD",
        f"• الفواتير الشكلية وعروض الأسعار (Proformas): {len(prof_invs)} ملف",
        f"• فواتير وتوريدات الشراء (Purchases): {len(purch_invs)} ملف | إجمالي: {total_purch_amt:,.2f} DZD",
        f"• وصول التسليم (Delivery Notes): {len(deliv_invs)} ملف",
        f"• التقرير الأرشيفي الشامل المجمع: متوفر داخل مجلد 00_التقرير_الأرشيفي_الشامل_Master_Archive",
        "",
        "=================================================================",
        "فهرس الملفات المضمنة (Files Manifest):",
        "=================================================================",
    ]
    for idx, f in enumerate(files, 1):
        readme_lines.append(f"{idx:03d}. [{f['folder']}] {f['filename']} ({len(f['pdf_bytes']):,} bytes)")

    with zipfile.ZipFile(bio, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README_فهرس_الأرشيف.txt", "\n".join(readme_lines).encode("utf-8"))
        for item in files:
            arcpath = f"{item['folder']}/{item['filename']}"
            zf.writestr(arcpath, item["pdf_bytes"])

    zip_bytes = bio.getvalue()
    comp_clean = _clean_path_segment(comp_name, max_len=30)
    date_clean = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"Zeralda_Invoices_Archive_{comp_clean}_{date_clean}.zip"

    return {
        "zip_bytes": zip_bytes,
        "filename": filename,
        "total_files": len(files),
        "counts": {
            "invoices": len(sales_invs),
            "proformas": len(prof_invs),
            "purchases": len(purch_invs),
            "deliveries": len(deliv_invs),
            "master_reports": len(master_invs),
        },
        "size_bytes": len(zip_bytes),
    }
