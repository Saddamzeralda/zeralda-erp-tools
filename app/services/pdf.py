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


def _normalize_lang(lang: Optional[str]) -> str:
    l = str(lang or "ar").lower().strip()
    if l.startswith("fr"):
        return "fr"
    if l.startswith("en"):
        return "en"
    return "ar"


DOC_I18N: Dict[str, Dict[str, Any]] = {
    "ar": {
        "dir": "rtl",
        "align_start": "right",
        "align_end": "left",
        "titles": {
            "proforma": "فاتورة شكلية / عرض أسعار",
            "purchase": "فاتورة شراء / وصل طلب",
            "delivery": "وصل تسليم وبضاعة",
            "invoice": "فاتورة بيع رسمية",
        },
        "subtitles": {
            "proforma": "FACTURE PROFORMA / DEVIS",
            "purchase": "FACTURE D'ACHAT / BON DE COMMANDE",
            "delivery": "BON DE LIVRAISON",
            "invoice": "FACTURE DE VENTE",
        },
        "party_titles": {
            "customer": "معلومات الزبون / العميل",
            "supplier": "معلومات المورد",
            "delivery": "معلومات الزبون / المستلم",
        },
        "party_subtitles": {
            "customer": "Client / Prospect",
            "supplier": "Fournisseur",
            "delivery": "Destinataire / Client",
        },
        "doc_num": "الرقم / N°:",
        "doc_date": "التاريخ / Date:",
        "doc_due": "الاستحقاق / Échéance:",
        "doc_status": "الحالة / Statut:",
        "status_paid": "مدفوعة (Payée)",
        "status_partial": "دفع جزئي (Partiel)",
        "status_pending": "قيد المعالجة (En attente)",
        "terms_header": "شروط المعاملة والدفع (Conditions de Paiement)",
        "payment_method": "طريقة الدفع:",
        "currency_lbl": "العملة المعتمدة:",
        "compliance": "حالة الاستلام:",
        "compliance_val": "معتمد ومطابق",
        "addr": "العنوان:",
        "phone": "الهاتف:",
        "email": "البريد:",
        "rc": "السجل التجاري (RC):",
        "nif": "الرقم الجبائي (NIF):",
        "nis": "NIS:",
        "ai": "AI (المادة):",
        "th_num": "#",
        "th_desc": "البيان / تعيين الصنف (Désignation)",
        "th_unit": "الوحدة",
        "th_qty": "الكمية",
        "th_price": "سعر الوحدة",
        "th_total": "الإجمالي",
        "no_items": "لا توجد بنود مسجلة في هذا المستند.",
        "notes_title": "ملاحظات (Notes / Conditions):",
        "subtotal": "المجموع قبل الضريبة (Total HT):",
        "discount": "التخفيض (Remise):",
        "tax": "الرسم على القيمة المضافة (TVA):",
        "total": "المبلغ الإجمالي (Net à Payer):",
        "paid": "المبلغ المدفوع (Versé):",
        "balance": "المتبقي المستحق (Solde):",
        "stamp_company": "<b>ختم وتوقيع المؤسسة</b><br>Cachet & Signature de l'Entreprise",
        "stamp_client": "<b>توقيع واستلام الطرف المعني</b><br>Accord & Réception du Destinataire",
        "page_lbl": "صفحة",
    },
    "fr": {
        "dir": "ltr",
        "align_start": "left",
        "align_end": "right",
        "titles": {
            "proforma": "FACTURE PROFORMA / DEVIS",
            "purchase": "FACTURE D'ACHAT / COMMANDE",
            "delivery": "BON DE LIVRAISON",
            "invoice": "FACTURE DE VENTE",
        },
        "subtitles": {
            "proforma": "DEVIS & PROPOSITION COMMERCIALE",
            "purchase": "BON DE COMMANDE FOURNISSEUR",
            "delivery": "BORDEREAU DE LIVRAISON",
            "invoice": "DOCUMENT FISCAL OFFICIEL",
        },
        "party_titles": {
            "customer": "Informations Client",
            "supplier": "Informations Fournisseur",
            "delivery": "Destinataire & Réception",
        },
        "party_subtitles": {
            "customer": "Données de facturation",
            "supplier": "Compte Fournisseur",
            "delivery": "Adresse de livraison",
        },
        "doc_num": "N° Document :",
        "doc_date": "Date :",
        "doc_due": "Échéance :",
        "doc_status": "Statut :",
        "status_paid": "Payée",
        "status_partial": "Partiellement Payée",
        "status_pending": "En attente de paiement",
        "terms_header": "Conditions de Règlement & Modalités",
        "payment_method": "Mode de Règlement :",
        "currency_lbl": "Devise :",
        "compliance": "Conformité :",
        "compliance_val": "Conforme & Approuvé",
        "addr": "Adresse :",
        "phone": "Tél :",
        "email": "Email :",
        "rc": "RC :",
        "nif": "NIF :",
        "nis": "NIS :",
        "ai": "Article d'Imposition (AI) :",
        "th_num": "#",
        "th_desc": "Désignation des Articles / Prestations",
        "th_unit": "Unité",
        "th_qty": "Qté",
        "th_price": "Prix Unitaire",
        "th_total": "Total HT",
        "no_items": "Aucun article enregistré pour ce document.",
        "notes_title": "Notes & Mentions Légales :",
        "subtotal": "Sous-Total HT :",
        "discount": "Remise Accordée :",
        "tax": "TVA :",
        "total": "Net à Payer (TTC) :",
        "paid": "Montant Réglé :",
        "balance": "Reste à Payer (Solde) :",
        "stamp_company": "<b>Cachet & Signature de l'Entreprise</b><br>Bon pour accord",
        "stamp_client": "<b>Réception & Signature du Client</b><br>Mention manuscrite \"Lu et approuvé\"",
        "page_lbl": "Page",
    },
    "en": {
        "dir": "ltr",
        "align_start": "left",
        "align_end": "right",
        "titles": {
            "proforma": "PROFORMA INVOICE / QUOTATION",
            "purchase": "PURCHASE ORDER / INVOICE",
            "delivery": "DELIVERY NOTE",
            "invoice": "SALES INVOICE",
        },
        "subtitles": {
            "proforma": "PRICE QUOTE & ESTIMATE",
            "purchase": "VENDOR PURCHASE ORDER",
            "delivery": "GOODS DELIVERY RECEIPT",
            "invoice": "OFFICIAL COMMERCIAL INVOICE",
        },
        "party_titles": {
            "customer": "Customer Information",
            "supplier": "Supplier Information",
            "delivery": "Recipient Information",
        },
        "party_subtitles": {
            "customer": "Billing Details",
            "supplier": "Vendor Details",
            "delivery": "Shipping Details",
        },
        "doc_num": "Document No:",
        "doc_date": "Date:",
        "doc_due": "Due Date:",
        "doc_status": "Status:",
        "status_paid": "Paid in Full",
        "status_partial": "Partially Paid",
        "status_pending": "Pending Payment",
        "terms_header": "Payment Terms & Conditions",
        "payment_method": "Payment Method:",
        "currency_lbl": "Currency:",
        "compliance": "Compliance:",
        "compliance_val": "Conforming & Approved",
        "addr": "Address:",
        "phone": "Phone:",
        "email": "Email:",
        "rc": "Commercial Reg. (RC):",
        "nif": "Tax ID (NIF):",
        "nis": "NIS:",
        "ai": "Tax Article (AI):",
        "th_num": "#",
        "th_desc": "Description / Item Name",
        "th_unit": "Unit",
        "th_qty": "Qty",
        "th_price": "Unit Price",
        "th_total": "Total",
        "no_items": "No items recorded on this document.",
        "notes_title": "Notes & Terms:",
        "subtotal": "Subtotal:",
        "discount": "Discount:",
        "tax": "VAT / Tax:",
        "total": "Total Amount Due:",
        "paid": "Amount Paid:",
        "balance": "Balance Due:",
        "stamp_company": "<b>Authorized Company Stamp & Signature</b><br>Approved & Certified",
        "stamp_client": "<b>Recipient Signature & Acceptance</b><br>Received in good order and condition",
        "page_lbl": "Page",
    },
}

FOLDER_NAMES_I18N: Dict[str, Dict[str, str]] = {
    "ar": {
        "invoices": "01_فواتير_المبيعات_Sales_Invoices",
        "drive_invoices": "01_فواتير المبيعات (Sales Invoices)",
        "invoices_prefix": "Facture_",
        "proformas": "02_الفواتير_الشكلية_Proforma_Invoices",
        "drive_proformas": "02_الفواتير الشكلية وعروض الأسعار (Proformas)",
        "proformas_prefix": "Proforma_",
        "purchases": "03_فواتير_الشراء_Purchase_Invoices",
        "drive_purchases": "03_فواتير الشراء والتوريد (Purchases)",
        "purchases_prefix": "Achat_",
        "deliveries": "04_وصول_التسليم_Delivery_Notes",
        "drive_deliveries": "04_وصول التسليم (Bons de Livraison)",
        "deliveries_prefix": "BL_",
        "master": "00_التقرير_الأرشيفي_الشامل_Master_Archive",
        "drive_master": "00_التقرير الأرشيفي الشامل (Master Archive)",
        "readme_file": "README_فهرس_الأرشيف.txt",
        "zip_prefix": "Zeralda_Invoices_Archive_",
        "drive_company_folder_prefix": "أرشيف الفواتير المنظمة - ",
        "readme_title": "أرشيف الفواتير المنظمة والمصنفة",
        "readme_intro": "هذا الأرشيف يحتوي على جميع فواتير ووثائق المؤسسة مرتبة في مجلدات منفصلة:",
        "readme_sales": "فواتير المبيعات (Sales Invoices)",
        "readme_proformas": "الفواتير الشكلية وعروض الأسعار (Proformas)",
        "readme_purchases": "فواتير وتوريدات الشراء (Purchases)",
        "readme_deliveries": "وصول التسليم (Delivery Notes)",
        "readme_master": "التقرير الأرشيفي الشامل المجمع: متوفر داخل مجلد 00_التقرير_الأرشيفي_الشامل_Master_Archive",
        "readme_manifest": "فهرس الملفات المضمنة (Files Manifest):",
    },
    "fr": {
        "invoices": "01_Factures_de_Vente",
        "drive_invoices": "01_Factures de Vente",
        "invoices_prefix": "Facture_",
        "proformas": "02_Factures_Proforma_Devis",
        "drive_proformas": "02_Factures Proforma & Devis",
        "proformas_prefix": "Proforma_",
        "purchases": "03_Factures_d_Achat",
        "drive_purchases": "03_Factures d'Achat",
        "purchases_prefix": "Achat_",
        "deliveries": "04_Bons_de_Livraison",
        "drive_deliveries": "04_Bons de Livraison",
        "deliveries_prefix": "BL_",
        "master": "00_Rapport_General_Archive",
        "drive_master": "00_Rapport Général Archivé",
        "readme_file": "README_Index_Archive.txt",
        "zip_prefix": "Zeralda_Archive_Factures_",
        "drive_company_folder_prefix": "Archive Factures Organisées - ",
        "readme_title": "ARCHIVE DES FACTURES ORGANISÉES ET CLASSÉES",
        "readme_intro": "Cette archive contient l'ensemble des factures et documents de l'entreprise classés par dossiers :",
        "readme_sales": "Factures de Vente",
        "readme_proformas": "Devis et Factures Proforma",
        "readme_purchases": "Factures et Commandes d'Achat",
        "readme_deliveries": "Bons de Livraison",
        "readme_master": "Rapport Général & Synthèse ERP : disponible dans le dossier 00_Rapport_General_Archive",
        "readme_manifest": "Index des Fichiers Inclus (Files Manifest) :",
    },
    "en": {
        "invoices": "01_Sales_Invoices",
        "drive_invoices": "01_Sales Invoices",
        "invoices_prefix": "Invoice_",
        "proformas": "02_Proforma_Invoices",
        "drive_proformas": "02_Proforma Invoices & Quotes",
        "proformas_prefix": "Proforma_",
        "purchases": "03_Purchase_Invoices",
        "drive_purchases": "03_Purchase Invoices",
        "purchases_prefix": "Purchase_",
        "deliveries": "04_Delivery_Notes",
        "drive_deliveries": "04_Delivery Notes",
        "deliveries_prefix": "Delivery_",
        "master": "00_Master_Archive_Report",
        "drive_master": "00_Master Archive Report",
        "readme_file": "README_Archive_Index.txt",
        "zip_prefix": "Zeralda_Invoices_Archive_",
        "drive_company_folder_prefix": "Organized Invoices Archive - ",
        "readme_title": "ORGANIZED AND CATEGORIZED INVOICES ARCHIVE",
        "readme_intro": "This archive contains all company invoices and documents organized into separate folders:",
        "readme_sales": "Sales Invoices",
        "readme_proformas": "Proforma Invoices & Quotations",
        "readme_purchases": "Purchase Orders & Invoices",
        "readme_deliveries": "Delivery Notes",
        "readme_master": "Comprehensive Master Report: available in folder 00_Master_Archive_Report",
        "readme_manifest": "Files Manifest Index:",
    },
}

REPORT_I18N: Dict[str, Dict[str, Any]] = {
    "ar": {
        "dir": "rtl",
        "align_start": "right",
        "align_end": "left",
        "border_side": "border-right",
        "main_title": "التقرير الأرشيفي الشامل لنظام Zeralda ERP",
        "company_lbl": "الشركة / المؤسسة:",
        "export_date_lbl": "تاريخ التصدير:",
        "addr": "العنوان:",
        "phone": "الهاتف:",
        "email": "البريد:",
        "rc": "السجل التجاري (RC):",
        "nif": "الرقم الجبائي (NIF):",
        "nis": "NIS:",
        "ai": "AI:",
        "sec1_title": "1. الملخص التنفيذي لجميع أقسام النظام (Executive Summary)",
        "sec1_th": ["القسم / الوحدة (Module)", "عدد السجلات (Count)", "القيمة المالية الإجمالية", "ملاحظات وتفاصيل"],
        "sec1_sales_lbl": "الفواتير النهائية (Invoices)",
        "sec1_sales_notes": "المدفوع: {paid} | المتبقي (الديون): {unpaid}",
        "sec1_prof_lbl": "الفواتير الشكلية / عروض الأسعار (Proformas)",
        "sec1_prof_notes": "عروض الأسعار المسجلة",
        "sec1_cust_lbl": "الزبائن والعملاء (Customers)",
        "sec1_cust_notes": "قاعدة بيانات العملاء المسجلين",
        "sec1_stock_lbl": "المنتجات والمخزون (Products & Stock)",
        "sec1_stock_notes": "القيمة التقديرية للمخزون الحالي",
        "sec1_supp_lbl": "الموردون والمشتريات (Suppliers & Purchases)",
        "sec1_supp_notes": "{supp_cnt} مورد / {purch_cnt} عملية | إجمالي فواتير وأوامر الشراء",
        "sec1_hr_lbl": "الموارد البشرية والرواتب (HR & Payroll)",
        "sec1_hr_notes": "{emp_cnt} موظف / {pay_cnt} كشف | سجلات الموظفين وكشوف الرواتب",
        "sec1_fin_lbl": "المعاملات المالية والمصاريف (Finance)",
        "sec1_fin_notes": "العمليات المالية والقيود",
        "sec1_tenders_lbl": "المناقصات والاستشارات (Tenders & Consultations)",
        "sec1_tenders_notes": "ملفات الصفقات والاستشارات",
        "sec2_title": "2. سجل الفواتير الشامل ({count} فاتورة)",
        "sec2_th": ["#", "رقم الفاتورة", "التاريخ", "الزبون (Client)", "المبلغ الصافي (HT)", "الضريبة (TVA)", "الإجمالي (TTC)", "المدفوع", "المتبقي", "الدفع / الحالة"],
        "sec2_items_header": "تفاصيل أصناف الفواتير (Detailed Invoice Items)",
        "sec2_card_invoice": "فاتورة رقم:",
        "sec2_card_date": "التاريخ:",
        "sec2_card_cust": "الزبون:",
        "sec2_card_tot": "الإجمالي:",
        "sec2_items_th": ["#", "البيان / الصنف (Description)", "الوحدة", "الكمية (Qty)", "سعر الوحدة (Unit Price)", "الإجمالي (Total)"],
        "sec2_empty": "لا توجد فواتير مسجلة حالياً.",
        "sec3_title": "3. سجل الفواتير الشكلية وعروض الأسعار ({count})",
        "sec3_th": ["#", "رقم العرض (Proforma)", "التاريخ", "الزبون", "عدد الأصناف", "الإجمالي (TTC)", "الحالة"],
        "sec3_empty": "لا توجد فواتير شكلية مسجلة.",
        "sec4_title": "4. قاعدة بيانات الزبائن والعملاء ({count})",
        "sec4_th": ["#", "الاسم / المؤسسة", "الهاتف", "البريد الإلكتروني", "العنوان / الولاية", "البيانات الجبائية (NIF / RC)"],
        "sec4_empty": "لا يوجد زبائن مسجلون.",
        "sec5_title": "5. سجل المنتجات والمخزون ({count})",
        "sec5_th": ["#", "الرمز (SKU/Code)", "اسم المنتج / الخدمة", "التصنيف", "الكمية المتوفرة", "سعر الوحدة", "قيمة المخزون"],
        "sec5_empty": "لا توجد منتجات مسجلة.",
        "sec6_title": "6. الموردون والمشتريات ({supp_count} مورد / {purch_count} عملية شراء)",
        "sec6_th_supp": ["#", "اسم المورد", "الهاتف", "البريد الإلكتروني", "العنوان"],
        "sec6_th_purch": ["#", "رقم العملية", "التاريخ", "المورد", "المبلغ الإجمالي", "الحالة"],
        "sec7_title": "7. الموارد البشرية والموظفون ({count})",
        "sec7_th": ["#", "اسم الموظف", "المنصب / الوظيفة", "القسم", "الهاتف", "الراتب الأساسي"],
        "sec7_empty": "لا توجد سجلات موظفين.",
        "sec8_title": "8. المعاملات المالية والمصاريف ({count})",
        "sec8_th": ["#", "التاريخ", "النوع", "البيان / الوصف", "المبلغ"],
        "stamp_header": "التقرير الأرشيفي الشامل",
        "stamp_gen": "تم الإنشاء بواسطة Zeralda ERP بتاريخ",
        "page_lbl": "صفحة",
    },
    "fr": {
        "dir": "ltr",
        "align_start": "left",
        "align_end": "right",
        "border_side": "border-left",
        "main_title": "Rapport Général & Archivage Zeralda ERP",
        "company_lbl": "Entreprise :",
        "export_date_lbl": "Date d'exportation :",
        "addr": "Adresse :",
        "phone": "Tél :",
        "email": "Email :",
        "rc": "RC :",
        "nif": "NIF :",
        "nis": "NIS :",
        "ai": "AI :",
        "sec1_title": "1. Synthèse Exécutive des Modules ERP (Executive Summary)",
        "sec1_th": ["Module ERP", "Nombre d'Enregistrements", "Valeur Totale", "Observations & Détails"],
        "sec1_sales_lbl": "Factures de Vente (Invoices)",
        "sec1_sales_notes": "Réglé : {paid} | Solde restant : {unpaid}",
        "sec1_prof_lbl": "Factures Proforma & Devis",
        "sec1_prof_notes": "Propositions et devis émis",
        "sec1_cust_lbl": "Clients & Prospects",
        "sec1_cust_notes": "Fichier central des comptes clients",
        "sec1_stock_lbl": "Produits & Inventaire de Stock",
        "sec1_stock_notes": "Valeur marchande estimée du stock",
        "sec1_supp_lbl": "Fournisseurs & Commandes d'Achat",
        "sec1_supp_notes": "{supp_cnt} fournisseurs / {purch_cnt} commandes | Total achats",
        "sec1_hr_lbl": "Ressources Humaines & Paie",
        "sec1_hr_notes": "{emp_cnt} employés / {pay_cnt} fiches | Registre du personnel",
        "sec1_fin_lbl": "Transactions Financières & Dépenses",
        "sec1_fin_notes": "Mouvements financiers et charges",
        "sec1_tenders_lbl": "Marchés & Consultations",
        "sec1_tenders_notes": "Dossiers d'appels d'offres",
        "sec2_title": "2. Relevé Détaillé des Factures de Vente ({count} factures)",
        "sec2_th": ["#", "N° Facture", "Date", "Client", "Sous-Total HT", "TVA", "Total TTC", "Réglé", "Solde", "Mode / Statut"],
        "sec2_items_header": "Détail des Articles par Facture (Invoice Line Items)",
        "sec2_card_invoice": "Facture N° :",
        "sec2_card_date": "Date :",
        "sec2_card_cust": "Client :",
        "sec2_card_tot": "Total :",
        "sec2_items_th": ["#", "Désignation des Articles", "Unité", "Qté", "Prix Unitaire", "Total HT"],
        "sec2_empty": "Aucune facture enregistrée pour le moment.",
        "sec3_title": "3. Relevé des Devis et Factures Proforma ({count})",
        "sec3_th": ["#", "N° Proforma / Devis", "Date", "Client", "Nb Articles", "Total TTC", "Statut"],
        "sec3_empty": "Aucune proforma enregistrée.",
        "sec4_title": "4. Répertoire des Clients ({count})",
        "sec4_th": ["#", "Nom / Entreprise", "Téléphone", "Email", "Adresse / Ville", "Données Fiscales (NIF / RC)"],
        "sec4_empty": "Aucun client enregistré.",
        "sec5_title": "5. Inventaire des Produits & Stock ({count})",
        "sec5_th": ["#", "Code / SKU", "Désignation Produit / Service", "Catégorie", "Stock Dispo", "Prix Unitaire", "Valeur Stock"],
        "sec5_empty": "Aucun produit enregistré.",
        "sec6_title": "6. Fournisseurs et Achats ({supp_count} fournisseurs / {purch_count} achats)",
        "sec6_th_supp": ["#", "Fournisseur", "Téléphone", "Email", "Adresse"],
        "sec6_th_purch": ["#", "N° Commande / Facture", "Date", "Fournisseur", "Montant Total", "Statut"],
        "sec7_title": "7. Personnel & Ressources Humaines ({count})",
        "sec7_th": ["#", "Nom de l'Employé", "Fonction / Poste", "Département", "Téléphone", "Salaire de Base"],
        "sec7_empty": "Aucun employé enregistré.",
        "sec8_title": "8. Transactions Financières & Dépenses ({count})",
        "sec8_th": ["#", "Date", "Type", "Libellé / Description", "Montant"],
        "stamp_header": "Rapport Général Archivé",
        "stamp_gen": "Généré par Zeralda ERP le",
        "page_lbl": "Page",
    },
    "en": {
        "dir": "ltr",
        "align_start": "left",
        "align_end": "right",
        "border_side": "border-left",
        "main_title": "Zeralda ERP - Comprehensive Master Archive Report",
        "company_lbl": "Company:",
        "export_date_lbl": "Export Date:",
        "addr": "Address:",
        "phone": "Phone:",
        "email": "Email:",
        "rc": "RC:",
        "nif": "NIF:",
        "nis": "NIS:",
        "ai": "AI:",
        "sec1_title": "1. ERP Modules Executive Summary",
        "sec1_th": ["ERP Module", "Records Count", "Total Financial Value", "Notes & Details"],
        "sec1_sales_lbl": "Sales Invoices",
        "sec1_sales_notes": "Paid: {paid} | Outstanding Balance: {unpaid}",
        "sec1_prof_lbl": "Proforma Invoices & Quotations",
        "sec1_prof_notes": "Issued price quotations and estimates",
        "sec1_cust_lbl": "Customers & Clients",
        "sec1_cust_notes": "Registered customer accounts directory",
        "sec1_stock_lbl": "Products & Current Inventory",
        "sec1_stock_notes": "Estimated market value of current stock",
        "sec1_supp_lbl": "Suppliers & Purchases",
        "sec1_supp_notes": "{supp_cnt} suppliers / {purch_cnt} orders | Total purchases value",
        "sec1_hr_lbl": "Human Resources & Payroll",
        "sec1_hr_notes": "{emp_cnt} staff / {pay_cnt} payroll slips | Employee directory",
        "sec1_fin_lbl": "Financial Transactions & Expenses",
        "sec1_fin_notes": "Financial transactions and expense ledger",
        "sec1_tenders_lbl": "Tenders & Consultations",
        "sec1_tenders_notes": "Bids and project tenders files",
        "sec2_title": "2. Sales Invoices Register ({count} invoices)",
        "sec2_th": ["#", "Invoice No", "Date", "Customer", "Subtotal", "Tax", "Total Amount", "Paid", "Balance", "Method / Status"],
        "sec2_items_header": "Invoice Line Items Breakdown",
        "sec2_card_invoice": "Invoice No:",
        "sec2_card_date": "Date:",
        "sec2_card_cust": "Customer:",
        "sec2_card_tot": "Total:",
        "sec2_items_th": ["#", "Item Description", "Unit", "Qty", "Unit Price", "Total"],
        "sec2_empty": "No invoices currently recorded.",
        "sec3_title": "3. Proforma Invoices & Quotations ({count})",
        "sec3_th": ["#", "Proforma No", "Date", "Customer", "Items Count", "Total", "Status"],
        "sec3_empty": "No proforma invoices recorded.",
        "sec4_title": "4. Customer Accounts Directory ({count})",
        "sec4_th": ["#", "Name / Company", "Phone", "Email", "Address / City", "Fiscal Info (NIF / RC)"],
        "sec4_empty": "No customers recorded.",
        "sec5_title": "5. Products & Inventory Records ({count})",
        "sec5_th": ["#", "SKU / Code", "Product / Service Name", "Category", "In-Stock Qty", "Unit Price", "Stock Value"],
        "sec5_empty": "No products recorded.",
        "sec6_title": "6. Suppliers & Purchases ({supp_count} suppliers / {purch_count} purchases)",
        "sec6_th_supp": ["#", "Supplier Name", "Phone", "Email", "Address"],
        "sec6_th_purch": ["#", "Order No", "Date", "Supplier", "Total Amount", "Status"],
        "sec7_title": "7. Human Resources & Employees ({count})",
        "sec7_th": ["#", "Employee Name", "Role / Position", "Department", "Phone", "Base Salary"],
        "sec7_empty": "No employee records.",
        "sec8_title": "8. Financial Transactions & Expenses ({count})",
        "sec8_th": ["#", "Date", "Type", "Description / Title", "Amount"],
        "stamp_header": "Master Archive Report",
        "stamp_gen": "Generated by Zeralda ERP on",
        "page_lbl": "Page",
    },
}


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
    lang: str = "ar",
) -> Optional[bytes]:
    """Generate a high-fidelity, single/multi-page PDF for an invoice, proforma, purchase, or delivery note
    with full localization (Arabic RTL, French LTR, or English LTR), company fiscal header, and itemized breakdown.
    """
    try:
        import pymupdf as fitz
    except ImportError:
        try:
            import fitz  # type: ignore
        except ImportError:
            return None

    lang_code = _normalize_lang(lang)
    i18n = DOC_I18N.get(lang_code, DOC_I18N["ar"])

    # Colors & Document category mapping
    doc_type_raw = (doc_type or "invoice").lower()
    if doc_type_raw in ("proforma", "devis", "quotation"):
        doc_key = "proforma"
        accent = "#047857"
        accent_rgb = (0.02, 0.47, 0.34)
        accent_bg = "#ecfdf5"
        party_key = "customer"
        is_purchase = False
    elif doc_type_raw in ("purchase", "achat", "order"):
        doc_key = "purchase"
        accent = "#9a3412"
        accent_rgb = (0.60, 0.20, 0.07)
        accent_bg = "#fff7ed"
        party_key = "supplier"
        is_purchase = True
    elif doc_type_raw in ("delivery", "bl", "bon_livraison"):
        doc_key = "delivery"
        accent = "#4338ca"
        accent_rgb = (0.26, 0.22, 0.79)
        accent_bg = "#eef2ff"
        party_key = "delivery"
        is_purchase = False
    else:
        doc_key = "invoice"
        accent = "#1e3a8a"
        accent_rgb = (0.12, 0.23, 0.54)
        accent_bg = "#eff6ff"
        party_key = "customer"
        is_purchase = False

    title_main = i18n["titles"].get(doc_key, i18n["titles"]["invoice"])
    title_sub = i18n["subtitles"].get(doc_key, i18n["subtitles"]["invoice"])
    party_title = i18n["party_titles"].get(party_key, i18n["party_titles"]["customer"])
    party_sub = i18n["party_subtitles"].get(party_key, i18n["party_subtitles"]["customer"])

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
    if doc_key == "proforma":
        doc_num = str(inv.get("proformaNumber") or inv.get("number") or inv.get("id") or "N/A")
    elif doc_key == "purchase":
        doc_num = str(inv.get("orderNumber") or inv.get("number") or inv.get("id") or "N/A")
    elif doc_key == "delivery":
        doc_num = str(inv.get("deliveryNumber") or inv.get("number") or inv.get("id") or "N/A")
    else:
        doc_num = str(inv.get("invoiceNumber") or inv.get("number") or inv.get("id") or "N/A")

    doc_date = str(inv.get("date") or inv.get("invoiceDate") or inv.get("proformaDate") or inv.get("orderDate") or "")
    if "T" in doc_date:
        doc_date = doc_date.split("T")[0]
    doc_due = str(inv.get("dueDate") or inv.get("due_date") or "")
    if "T" in doc_due:
        doc_due = doc_due.split("T")[0]

    status_raw = str(inv.get("status") or "pending").strip().lower()
    if status_raw in ("paid", "payé", "payee", "payée", "مدفوعة", "saldée"):
        status_badge = f"<span style='color: #15803d; font-weight: bold;'>{_esc(i18n['status_paid'])}</span>"
    elif status_raw in ("partial", "partiel", "partielle", "جزئي"):
        status_badge = f"<span style='color: #b45309; font-weight: bold;'>{_esc(i18n['status_partial'])}</span>"
    else:
        status_badge = f"<span style='color: #64748b; font-weight: bold;'>{_esc(i18n['status_pending'])}</span>"

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
    paid_val = float(inv.get("paid") or inv.get("paidAmount") or (total_val if status_raw in ("paid", "payé", "payee", "payée", "مدفوعة") else 0))
    balance_val = max(0.0, total_val - paid_val)

    html_parts = []
    html_parts.append(f"""
    <style>
        body {{ font-family: sans-serif; font-size: 8.5pt; color: #1e293b; line-height: 1.35; }}
        table {{ width: 100%; border-collapse: collapse; margin-bottom: 7pt; }}
        .header-tbl {{ border: none; margin-bottom: 10pt; }}
        .header-tbl td {{ border: none; padding: 2pt 4pt; vertical-align: top; }}
        .comp-title {{ font-size: 14.5pt; font-weight: bold; color: {accent}; margin: 0 0 3pt 0; text-align: {i18n['align_start']}; }}
        .comp-meta {{ font-size: 8pt; color: #475569; line-height: 1.45; text-align: {i18n['align_start']}; }}
        .doc-badge {{ background-color: {accent_bg}; border: 1.5pt solid {accent}; padding: 7pt 9pt; text-align: center; border-radius: 4pt; }}
        .doc-title-main {{ font-size: 11.5pt; font-weight: bold; color: {accent}; margin: 0; }}
        .doc-title-sub {{ font-size: 8.5pt; font-weight: bold; color: #334155; margin: 2pt 0 0 0; }}
        .doc-meta-line {{ font-size: 8pt; color: #1e293b; margin: 1.5pt 0; }}

        .partner-box {{ width: 100%; border-collapse: collapse; margin-bottom: 10pt; }}
        .partner-box td {{ width: 50%; border: 1pt solid #cbd5e1; background-color: #f8fafc; padding: 6pt 8pt; vertical-align: top; text-align: {i18n['align_start']}; }}
        .box-header {{ font-size: 8.5pt; font-weight: bold; color: {accent}; border-bottom: 0.5pt solid #cbd5e1; padding-bottom: 2pt; margin-bottom: 3pt; }}

        .items-tbl th {{ background-color: {accent}; color: #ffffff; font-weight: bold; padding: 4.5pt 5pt; font-size: 8pt; text-align: {i18n['align_start']}; border: 0.5pt solid {accent}; }}
        .items-tbl td {{ padding: 4pt 5pt; font-size: 8pt; border: 0.5pt solid #cbd5e1; color: #1e293b; text-align: {i18n['align_start']}; }}
        .row-even {{ background-color: #f8fafc; }}

        .totals-tbl {{ width: 100%; border-collapse: collapse; margin-top: 2pt; }}
        .totals-tbl td {{ padding: 3.5pt 6pt; font-size: 8pt; border: 0.5pt solid #cbd5e1; }}
        .final-row {{ background-color: {accent_bg}; font-size: 9pt; font-weight: bold; color: {accent}; border: 1pt solid {accent}; }}

        .footer-tbl {{ width: 100%; border: none; margin-top: 10pt; }}
        .footer-tbl td {{ border: none; padding: 3pt; vertical-align: top; }}
        .stamp-card {{ border: 1pt dashed #94a3b8; height: 55pt; text-align: center; padding-top: 5pt; font-size: 7.5pt; color: #64748b; background-color: #fafafa; border-radius: 4pt; }}
    </style>
    """)

    note_padding = "padding-left: 6pt;" if i18n["dir"] == "rtl" else "padding-right: 6pt;"

    html_parts.append(f"""
    <div dir="{i18n['dir']}">
        <table class="header-tbl">
            <tr>
                <td style="width: 58%;">
                    <div class="comp-title">{_esc(comp_name)}</div>
                    <div class="comp-meta">
                        <p style="margin: 1pt 0;"><b>{i18n['addr']}</b> {_esc(comp_addr)}</p>
                        <p style="margin: 1pt 0;"><b>{i18n['phone']}</b> {_esc(comp_phone)} &nbsp;|&nbsp; <b>{i18n['email']}</b> {_esc(comp_email)}</p>
                        <p style="margin: 1pt 0;"><b>{i18n['rc']}</b> {_esc(comp_rc)} &nbsp;|&nbsp; <b>{i18n['nif']}</b> {_esc(comp_nif)}</p>
                        <p style="margin: 1pt 0;"><b>{i18n['nis']}</b> {_esc(comp_nis)} &nbsp;|&nbsp; <b>{i18n['ai']}</b> {_esc(comp_ai)}</p>
                    </div>
                </td>
                <td style="width: 42%;">
                    <div class="doc-badge">
                        <div class="doc-title-main">{title_main}</div>
                        <div class="doc-title-sub">{title_sub}</div>
                        <div class="doc-meta-line" style="margin-top: 4pt;"><b>{i18n['doc_num']}</b> <span style="font-size: 10pt; font-weight: bold; color: {accent};">{_esc(doc_num)}</span></div>
                        <div class="doc-meta-line"><b>{i18n['doc_date']}</b> {_esc(doc_date)}</div>
                        {"<div class='doc-meta-line'><b>" + i18n['doc_due'] + "</b> " + _esc(doc_due) + "</div>" if doc_due else ""}
                        <div class="doc-meta-line"><b>{i18n['doc_status']}</b> {status_badge}</div>
                    </div>
                </td>
            </tr>
        </table>

        <table class="partner-box">
            <tr>
                <td>
                    <div class="box-header">{party_title} ({party_sub})</div>
                    <p style="margin: 2pt 0; font-size: 9pt;"><b>{_esc(p_name)}</b></p>
                    <p style="margin: 1.5pt 0;"><b>{i18n['addr']}</b> {_esc(p_addr)}</p>
                    <p style="margin: 1.5pt 0;"><b>{i18n['phone']}</b> {_esc(p_phone)}</p>
                    {"<p style='margin: 1.5pt 0;'><b>" + i18n['nif'] + "</b> " + _esc(p_nif) + " &nbsp;|&nbsp; <b>" + i18n['rc'] + "</b> " + _esc(p_rc) + "</p>" if (p_nif != "-" or p_rc != "-") else ""}
                </td>
                <td>
                    <div class="box-header">{i18n['terms_header']}</div>
                    <p style="margin: 2pt 0;"><b>{i18n['payment_method']}</b> {_esc(pay_method)}</p>
                    <p style="margin: 2pt 0;"><b>{i18n['currency_lbl']}</b> {_esc(currency)}</p>
                    <p style="margin: 2pt 0;"><b>{i18n['compliance']}</b> {i18n['compliance_val']}</p>
                </td>
            </tr>
        </table>

        <table class="items-tbl">
            <tr>
                <th style="width: 5%; text-align: center;">{i18n['th_num']}</th>
                <th style="width: 47%;">{i18n['th_desc']}</th>
                <th style="width: 8%; text-align: center;">{i18n['th_unit']}</th>
                <th style="width: 10%; text-align: center;">{i18n['th_qty']}</th>
                <th style="width: 14%; text-align: {i18n['align_end']};">{i18n['th_price']} ({_esc(currency)})</th>
                <th style="width: 16%; text-align: {i18n['align_end']};">{i18n['th_total']} ({_esc(currency)})</th>
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
                <td style="text-align: center;">{idx}</td>
                <td>{_esc(desc)}</td>
                <td style="text-align: center;">{_esc(unit)}</td>
                <td style="text-align: center;">{_esc(qty)}</td>
                <td style="text-align: {i18n['align_end']};">{_fmt_num(price)}</td>
                <td style="text-align: {i18n['align_end']};"><b>{_fmt_num(ltot)}</b></td>
            </tr>
            """)
    else:
        html_parts.append(f"<tr><td colspan='6' style='text-align: center; padding: 10pt;'>{i18n['no_items']}</td></tr>")

    html_parts.append("</table>")

    # Financial totals block + Remarks
    notes = inv.get("notes") or inv.get("remarks") or ""
    html_parts.append(f"""
        <table style="width: 100%; border: none; margin-bottom: 8pt;">
            <tr>
                <td style="width: 50%; vertical-align: top; border: none; {note_padding}">
                    {"<div style='background: #f8fafc; border: 1pt solid #cbd5e1; padding: 5pt 7pt; border-radius: 4pt;'><div class='box-header'>" + i18n['notes_title'] + "</div><p style='margin: 0; font-size: 7.5pt; color: #475569;'>" + _esc(notes) + "</p></div>" if notes else ""}
                </td>
                <td style="width: 50%; vertical-align: top; border: none;">
                    <table class="totals-tbl">
                        <tr><td>{i18n['subtotal']}</td><td style="text-align: {i18n['align_end']};"><b>{_fmt_num(subtotal)} {_esc(currency)}</b></td></tr>
                        {"<tr><td>" + i18n['discount'] + "</td><td style='text-align: " + i18n['align_end'] + ";'>-" + _fmt_num(discount) + " " + _esc(currency) + "</td></tr>" if discount > 0 else ""}
                        {"<tr><td>" + i18n['tax'] + "</td><td style='text-align: " + i18n['align_end'] + ";'>+" + _fmt_num(tax) + " " + _esc(currency) + "</td></tr>" if tax > 0 else ""}
                        <tr class="final-row"><td>{i18n['total']}</td><td style="text-align: {i18n['align_end']};">{_fmt_num(total_val)} {_esc(currency)}</td></tr>
                        {"<tr><td>" + i18n['paid'] + "</td><td style='text-align: " + i18n['align_end'] + ";'>" + _fmt_num(paid_val) + " " + _esc(currency) + "</td></tr>" if doc_key == "invoice" else ""}
                        {"<tr><td>" + i18n['balance'] + "</td><td style='text-align: " + i18n['align_end'] + ";'><b style='color: #b91c1c;'>" + _fmt_num(balance_val) + " " + _esc(currency) + "</b></td></tr>" if (doc_key == "invoice" and balance_val > 0) else ""}
                    </table>
                </td>
            </tr>
        </table>

        <table class="footer-tbl">
            <tr>
                <td style="width: 50%;">
                    <div class="stamp-card">{i18n['stamp_company']}</div>
                </td>
                <td style="width: 50%;">
                    <div class="stamp-card">{i18n['stamp_client']}</div>
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
            f"{comp_name[:35]} | {title_main} N° {doc_num}",
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
            f"{i18n['page_lbl']} {idx + 1} / {total_pages}",
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
    lang: str = "ar",
) -> Optional[bytes]:
    """Generate a PDF from an invoice/proforma/purchase dict. Returns bytes or None."""
    try:
        pdf_bytes = generate_single_document_pdf(inv, doc_type=doc_type, company_info=company_info, currency=currency, lang=lang)
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
            iid = str(item.get("id") or item.get("invoiceNumber") or item.get("proformaNumber") or item.get("orderNumber") or item.get("order_number") or item.get("deliveryNumber") or item.get("number") or item.get("sku") or item.get("code") or "")
            if not iid:
                try:
                    iid = str(hash(json.dumps(item, sort_keys=True, default=str)))
                except Exception:
                    iid = ""
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
    lang: str = "ar",
) -> Optional[bytes]:
    """Generate a comprehensive, multi-page organized PDF archive of all ERP modules and invoices."""
    try:
        import pymupdf as fitz
    except ImportError:
        try:
            import fitz  # type: ignore
        except ImportError:
            return None

    lang_code = _normalize_lang(lang)
    rep = REPORT_I18N.get(lang_code, REPORT_I18N["ar"])

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
    total_paid = sum(float(inv.get("paid") or inv.get("paidAmount") or (inv.get("total") if str(inv.get("status", "")).lower() in ("paid", "payé", "payee", "مدفوعة") else 0) or 0) for inv in invoices)
    total_unpaid = max(0.0, total_sales - total_paid)
    total_proformas = sum(float(p.get("total") or p.get("totalAmount") or 0) for p in proformas)
    total_purchases = sum(float(p.get("total") or p.get("amount") or 0) for p in purchases)
    total_stock_val = sum(float(p.get("price") or p.get("salePrice") or 0) * float(p.get("quantity") or p.get("stock") or 0) for p in products)

    parts: List[str] = []
    parts.append(f"""
    <style>
        body {{ font-family: sans-serif; font-size: 9.5pt; color: #1e293b; line-height: 1.45; }}
        h1 {{ font-size: 17pt; color: #0f172a; margin: 0 0 4pt 0; text-align: {rep['align_start']}; }}
        h2 {{ font-size: 12.5pt; color: #1e40af; background-color: #eff6ff; padding: 6pt 10pt; margin: 14pt 0 6pt 0; {rep['border_side']}: 4pt solid #1d4ed8; text-align: {rep['align_start']}; }}
        h3 {{ font-size: 10.5pt; color: #0f172a; margin: 8pt 0 4pt 0; text-align: {rep['align_start']}; }}
        p {{ margin: 2pt 0; text-align: {rep['align_start']}; }}
        table {{ width: 100%; border-collapse: collapse; margin-bottom: 10pt; }}
        th {{ background-color: #1e3a8a; color: #ffffff; font-weight: bold; padding: 5pt 6pt; font-size: 8.5pt; text-align: {rep['align_start']}; border: 0.5pt solid #1e3a8a; }}
        td {{ padding: 4.5pt 6pt; font-size: 8.5pt; border: 0.5pt solid #cbd5e1; color: #1e293b; text-align: {rep['align_start']}; }}
        .row-even {{ background-color: #f8fafc; }}
        .meta-box {{ background-color: #f8fafc; border: 1pt solid #cbd5e1; padding: 8pt 10pt; margin-bottom: 10pt; text-align: {rep['align_start']}; }}
        .inv-card {{ border: 1pt solid #94a3b8; background-color: #ffffff; padding: 8pt; margin-bottom: 10pt; text-align: {rep['align_start']}; }}
        .badge-paid {{ color: #15803d; font-weight: bold; }}
        .badge-pending {{ color: #b45309; font-weight: bold; }}
    </style>
    """)

    # 1. Cover & Executive Summary
    parts.append(f"""
    <div dir="{rep['dir']}">
        <h1>{rep['main_title']}</h1>
        <p><b>{rep['company_lbl']}</b> {_esc(comp_name)} &nbsp;|&nbsp; <b>{rep['export_date_lbl']}</b> {_esc(now_str)}</p>
        <div class="meta-box">
            <p><b>{rep['addr']}</b> {_esc(comp_addr)} &nbsp;|&nbsp; <b>{rep['phone']}</b> {_esc(comp_phone)} &nbsp;|&nbsp; <b>{rep['email']}</b> {_esc(comp_email)}</p>
            <p><b>{rep['rc']}</b> {_esc(comp_rc)} &nbsp;|&nbsp; <b>{rep['nif']}</b> {_esc(comp_nif)} &nbsp;|&nbsp; <b>{rep['nis']}</b> {_esc(comp_nis)} &nbsp;|&nbsp; <b>{rep['ai']}</b> {_esc(comp_ai)}</p>
        </div>

        <h2>{rep['sec1_title']}</h2>
        <table>
            <tr>
                <th>{rep['sec1_th'][0]}</th>
                <th>{rep['sec1_th'][1]}</th>
                <th>{rep['sec1_th'][2]} ({_esc(currency)})</th>
                <th>{rep['sec1_th'][3]}</th>
            </tr>
            <tr>
                <td><b>{rep['sec1_sales_lbl']}</b></td>
                <td>{len(invoices)}</td>
                <td><b>{_fmt_num(total_sales)}</b></td>
                <td>{rep['sec1_sales_notes'].format(paid=_fmt_num(total_paid), unpaid=_fmt_num(total_unpaid))}</td>
            </tr>
            <tr class="row-even">
                <td><b>{rep['sec1_prof_lbl']}</b></td>
                <td>{len(proformas)}</td>
                <td>{_fmt_num(total_proformas)}</td>
                <td>{rep['sec1_prof_notes']}</td>
            </tr>
            <tr>
                <td><b>{rep['sec1_cust_lbl']}</b></td>
                <td>{len(customers)}</td>
                <td>-</td>
                <td>{rep['sec1_cust_notes']}</td>
            </tr>
            <tr class="row-even">
                <td><b>{rep['sec1_stock_lbl']}</b></td>
                <td>{len(products)}</td>
                <td>{_fmt_num(total_stock_val)}</td>
                <td>{rep['sec1_stock_notes']}</td>
            </tr>
            <tr>
                <td><b>{rep['sec1_supp_lbl']}</b></td>
                <td>{len(suppliers)} / {len(purchases)}</td>
                <td>{_fmt_num(total_purchases)}</td>
                <td>{rep['sec1_supp_notes'].format(supp_cnt=len(suppliers), purch_cnt=len(purchases))}</td>
            </tr>
            <tr class="row-even">
                <td><b>{rep['sec1_hr_lbl']}</b></td>
                <td>{len(employees)} / {len(payroll)}</td>
                <td>-</td>
                <td>{rep['sec1_hr_notes'].format(emp_cnt=len(employees), pay_cnt=len(payroll))}</td>
            </tr>
            <tr>
                <td><b>{rep['sec1_fin_lbl']}</b></td>
                <td>{len(finance_tx)}</td>
                <td>-</td>
                <td>{rep['sec1_fin_notes']}</td>
            </tr>
            <tr class="row-even">
                <td><b>{rep['sec1_tenders_lbl']}</b></td>
                <td>{len(tenders)}</td>
                <td>-</td>
                <td>{rep['sec1_tenders_notes']}</td>
            </tr>
        </table>
    """)

    # 2. Invoices Register + Detailed Breakdown
    parts.append(f"""
        <h2>{rep['sec2_title'].format(count=len(invoices))}</h2>
    """)
    if invoices:
        th_cells = "".join(f"<th>{h}</th>" for h in rep['sec2_th'])
        parts.append(f"""
        <table>
            <tr>{th_cells}</tr>
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
            paid = float(inv.get("paid") or inv.get("paidAmount") or (tot if status_raw.lower() in ("paid", "payé", "payee", "مدفوعة") else 0) or 0)
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
        parts.append(f"<h3>{rep['sec2_items_header']}</h3>")
        th_sub_cells = "".join(f"<th>{h}</th>" for h in rep['sec2_items_th'])
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
                <p><b>{rep['sec2_card_invoice']} {_esc(inv_num)}</b> &nbsp;|&nbsp; <b>{rep['sec2_card_date']}</b> {_esc(inv_date)} &nbsp;|&nbsp; <b>{rep['sec2_card_cust']}</b> {_esc(cust)} &nbsp;|&nbsp; <b>{rep['sec2_card_tot']}</b> {_fmt_num(tot)} {_esc(currency)}</p>
            """)
            if isinstance(items, list) and items:
                parts.append(f"""
                <table>
                    <tr>{th_sub_cells}</tr>
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
        parts.append(f"<p>{rep['sec2_empty']}</p>")

    # 3. Proformas / Quotes
    parts.append(f"<h2>{rep['sec3_title'].format(count=len(proformas))}</h2>")
    if proformas:
        th_pf_cells = "".join(f"<th>{h}</th>" for h in rep['sec3_th'])
        parts.append(f"""
        <table>
            <tr>{th_pf_cells}</tr>
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
        parts.append(f"<p>{rep['sec3_empty']}</p>")

    # 4. Customers
    parts.append(f"<h2>{rep['sec4_title'].format(count=len(customers))}</h2>")
    if customers:
        th_cust_cells = "".join(f"<th>{h}</th>" for h in rep['sec4_th'])
        parts.append(f"""
        <table>
            <tr>{th_cust_cells}</tr>
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
        parts.append(f"<p>{rep['sec4_empty']}</p>")

    # 5. Products & Inventory
    parts.append(f"<h2>{rep['sec5_title'].format(count=len(products))}</h2>")
    if products:
        th_prod_cells = "".join(f"<th>{h}</th>" for h in rep['sec5_th'])
        parts.append(f"""
        <table>
            <tr>{th_prod_cells}</tr>
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
        parts.append(f"<p>{rep['sec5_empty']}</p>")

    # 6. Suppliers & Purchases
    parts.append(f"<h2>{rep['sec6_title'].format(supp_count=len(suppliers), purch_count=len(purchases))}</h2>")
    if suppliers:
        th_supp_cells = "".join(f"<th>{h}</th>" for h in rep['sec6_th_supp'])
        parts.append(f"""
        <table>
            <tr>{th_supp_cells}</tr>
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
        th_purch_cells = "".join(f"<th>{h}</th>" for h in rep['sec6_th_purch'])
        parts.append(f"""
        <table>
            <tr>{th_purch_cells}</tr>
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
    parts.append(f"<h2>{rep['sec7_title'].format(count=len(employees))}</h2>")
    if employees:
        th_emp_cells = "".join(f"<th>{h}</th>" for h in rep['sec7_th'])
        parts.append(f"""
        <table>
            <tr>{th_emp_cells}</tr>
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
        parts.append(f"<p>{rep['sec7_empty']}</p>")

    # 8. Finance & Expenses
    if finance_tx:
        parts.append(f"<h2>{rep['sec8_title'].format(count=len(finance_tx))}</h2>")
        th_fin_cells = "".join(f"<th>{h}</th>" for h in rep['sec8_th'])
        parts.append(f"""
        <table>
            <tr>{th_fin_cells}</tr>
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
            f"Zeralda ERP - {rep['stamp_header']} | {comp_name[:40]}",
            fontsize=8,
            fontname="helv",
            color=gray,
        )
        page.draw_line(fitz.Point(32, 810), fitz.Point(563, 810), color=light_line, width=0.5)
        page.insert_text(
            fitz.Point(32, 824),
            f"{rep['stamp_gen']} {now_str}",
            fontsize=7.5,
            fontname="helv",
            color=gray,
        )
        page.insert_text(
            fitz.Point(500, 824),
            f"{rep['page_lbl']} {idx + 1} / {total_pages}",
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
    lang: str = "ar",
) -> List[Dict[str, Any]]:
    """Generate individual PDF files for all invoice types in the store,
    grouped by localized folder category with metadata for ZIP packing and Google Drive upload.
    """
    lang_code = _normalize_lang(lang)
    cfg = FOLDER_NAMES_I18N.get(lang_code, FOLDER_NAMES_I18N["ar"])

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
    folder_invoices = cfg["invoices"]
    drive_folder_invoices = cfg["drive_invoices"]
    prefix_invoices = cfg["invoices_prefix"]
    for idx, inv in enumerate(invoices, 1):
        num = str(inv.get("number") or inv.get("invoiceNumber") or inv.get("id") or f"INV-{idx}")
        cust = inv.get("customer") or inv.get("customerName") or "Client"
        if isinstance(cust, dict):
            cust = cust.get("name") or cust.get("company") or "Client"
        dt = str(inv.get("date") or inv.get("invoiceDate") or "").split("T")[0] or "nodate"
        fname = f"{prefix_invoices}{_clean_path_segment(num)}_{_clean_path_segment(cust)}_{_clean_path_segment(dt)}.pdf"
        pdf_bytes = generate_single_document_pdf(inv, doc_type="invoice", company_info=company_info, currency=currency, lang=lang_code)
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
    folder_proformas = cfg["proformas"]
    drive_folder_proformas = cfg["drive_proformas"]
    prefix_proformas = cfg["proformas_prefix"]
    for idx, prof in enumerate(proformas, 1):
        num = str(prof.get("proformaNumber") or prof.get("number") or prof.get("id") or f"PRO-{idx}")
        cust = prof.get("customer") or prof.get("customerName") or "Client"
        if isinstance(cust, dict):
            cust = cust.get("name") or cust.get("company") or "Client"
        dt = str(prof.get("date") or prof.get("proformaDate") or "").split("T")[0] or "nodate"
        fname = f"{prefix_proformas}{_clean_path_segment(num)}_{_clean_path_segment(cust)}_{_clean_path_segment(dt)}.pdf"
        pdf_bytes = generate_single_document_pdf(prof, doc_type="proforma", company_info=company_info, currency=currency, lang=lang_code)
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
    folder_purchases = cfg["purchases"]
    drive_folder_purchases = cfg["drive_purchases"]
    prefix_purchases = cfg["purchases_prefix"]
    for idx, purch in enumerate(purchases, 1):
        num = str(purch.get("orderNumber") or purch.get("number") or purch.get("id") or f"ACH-{idx}")
        supp = purch.get("supplier") or purch.get("supplierName") or "Fournisseur"
        if isinstance(supp, dict):
            supp = supp.get("name") or supp.get("company") or "Fournisseur"
        dt = str(purch.get("date") or purch.get("orderDate") or "").split("T")[0] or "nodate"
        fname = f"{prefix_purchases}{_clean_path_segment(num)}_{_clean_path_segment(supp)}_{_clean_path_segment(dt)}.pdf"
        pdf_bytes = generate_single_document_pdf(purch, doc_type="purchase", company_info=company_info, currency=currency, lang=lang_code)
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
        folder_deliveries = cfg["deliveries"]
        drive_folder_deliveries = cfg["drive_deliveries"]
        prefix_deliveries = cfg["deliveries_prefix"]
        for idx, deliv in enumerate(deliveries, 1):
            num = str(deliv.get("number") or deliv.get("deliveryNumber") or deliv.get("id") or f"BL-{idx}")
            cust = deliv.get("customer") or deliv.get("customerName") or "Client"
            if isinstance(cust, dict):
                cust = cust.get("name") or cust.get("company") or "Client"
            dt = str(deliv.get("date") or "").split("T")[0] or "nodate"
            fname = f"{prefix_deliveries}{_clean_path_segment(num)}_{_clean_path_segment(cust)}_{_clean_path_segment(dt)}.pdf"
            pdf_bytes = generate_single_document_pdf(deliv, doc_type="delivery", company_info=company_info, currency=currency, lang=lang_code)
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
    master_bytes = generate_full_erp_pdf_report(store, company_id=active_cid, lang=lang_code)
    if master_bytes:
        comp_clean = _clean_path_segment(company_info.get("name") or "Zeralda_ERP")
        now_dt = datetime.datetime.now().strftime("%Y-%m-%d")
        files_list.append({
            "folder": cfg["master"],
            "drive_folder": cfg["drive_master"],
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
    lang: str = "ar",
) -> Dict[str, Any]:
    """Generate an organized ZIP archive containing individual PDFs for all invoice types,
    structured into localized neat categorized folders (Sales, Proformas, Purchases, Delivery Notes, Master Report).
    """
    lang_code = _normalize_lang(lang)
    cfg = FOLDER_NAMES_I18N.get(lang_code, FOLDER_NAMES_I18N["ar"])

    files = get_organized_invoices_file_list(store, company_id=company_id, lang=lang_code)
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

    currency = settings.get("systemCurrency") or store.get("system-currency") or "DZD"

    sales_invs = [f for f in files if f.get("doc_type") == "invoice"]
    prof_invs = [f for f in files if f.get("doc_type") == "proforma"]
    purch_invs = [f for f in files if f.get("doc_type") == "purchase"]
    deliv_invs = [f for f in files if f.get("doc_type") == "delivery"]
    master_invs = [f for f in files if f.get("doc_type") == "master_report"]

    total_sales_amt = sum(f.get("amount", 0) for f in sales_invs)
    total_purch_amt = sum(f.get("amount", 0) for f in purch_invs)

    readme_lines = [
        "=================================================================",
        f" {cfg['readme_title']} - {comp_name}",
        f" Zeralda ERP - Organized Invoices Archive",
        f" Date: {now_str}",
        "=================================================================",
        "",
        cfg["readme_intro"],
        "",
        f"• {cfg['readme_sales']}: {len(sales_invs)} | Total: {total_sales_amt:,.2f} {currency}",
        f"• {cfg['readme_proformas']}: {len(prof_invs)}",
        f"• {cfg['readme_purchases']}: {len(purch_invs)} | Total: {total_purch_amt:,.2f} {currency}",
        f"• {cfg['readme_deliveries']}: {len(deliv_invs)}",
        f"• {cfg['readme_master']}",
        "",
        "=================================================================",
        cfg["readme_manifest"],
        "=================================================================",
    ]
    for idx, f in enumerate(files, 1):
        readme_lines.append(f"{idx:03d}. [{f['folder']}] {f['filename']} ({len(f['pdf_bytes']):,} bytes)")

    with zipfile.ZipFile(bio, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(cfg["readme_file"], "\n".join(readme_lines).encode("utf-8"))
        for item in files:
            arcpath = f"{item['folder']}/{item['filename']}"
            zf.writestr(arcpath, item["pdf_bytes"])

    zip_bytes = bio.getvalue()
    comp_clean = _clean_path_segment(comp_name, max_len=30)
    date_clean = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{cfg['zip_prefix']}{comp_clean}_{date_clean}.zip"

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
