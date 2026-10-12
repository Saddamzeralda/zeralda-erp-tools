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
