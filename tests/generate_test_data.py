"""
Generate test data files for OCR testing across all modules.
Creates: PDF (text layer + scanned), image (PNG), Excel, Word (DOCX), TXT, CSV.

Run: python tests/generate_test_data.py
"""
import os
import sys
import base64
import json
import struct
import zipfile
import csv
import io

# Ensure project root is on path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)


# ── 1. TXT file (UTF-8 with Arabic) ──────────────────────────────────────────
def create_txt_invoice():
    """Create a sample invoice TXT file (French + Arabic)."""
    content = """FACTURE PROFORMA
N°: TEST-001
Date: 2026-08-07

FOURNISSEUR: EURL TEST SUPPLIER
Adresse: 123 Rue de Test, Alger
Téléphone: 021 12 34 56
Email: contact@test-supplier.dz
RC: 16/00-1234567 B
NIF: 000916100123456
NIS: 000916180123456
AI: 16184614036

CLIENT: EURL TEST CLIENT
Adresse: 456 Avenue Client, Oran
Téléphone: 041 65 43 21

Code        Désignation                        Qte    P.U HT        Montant HT
ART-001     Ordinateur Portable Dell           5      85 000,00     425 000,00
ART-002     Écran LED 24 pouces                10     18 500,00     185 000,00
ART-003     Clavier USB                         20     1 200,00      24 000,00
ART-004     Souris Optique                      20     800,00        16 000,00
ART-005     Câble HDMI 2m                       15     350,00        5 250,00

Total HT:                                       655 250,00 DA
TVA (19%):                                      124 497,50 DA
Timbre:                                         0,00 DA
Total TTC:                                      779 747,50 DA

Arrêté la présente facture proforma à la somme de:
SEPT CENT SOIXANTE-DIX-NEUF MILLE SEPT CENT QUARANTE-SEPT DINARS
"""
    path = os.path.join(DATA_DIR, 'sample_invoice.txt')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  Created: {path} ({len(content)} chars)")
    return path


# ── 2. CSV file (semicolon delimiter, EU format) ─────────────────────────────
def create_csv_products():
    """Create a sample products CSV with semicolon delimiter (EU format)."""
    path = os.path.join(DATA_DIR, 'sample_products.csv')
    rows = [
        ['Code', 'Désignation', 'Catégorie', 'Quantité', 'Prix Unitaire', 'Unité'],
        ['ART-001', 'Ordinateur Portable Dell', 'Informatique', '5', '85000,00', 'pièce'],
        ['ART-002', 'Écran LED 24 pouces', 'Informatique', '10', '18500,00', 'pièce'],
        ['ART-003', 'Clavier USB', 'Accessoires', '20', '1200,00', 'pièce'],
        ['ART-004', 'Souris Optique', 'Accessoires', '20', '800,00', 'pièce'],
        ['ART-005', 'Câble HDMI 2m', 'Accessoires', '15', '350,00', 'pièce'],
        ['ART-006', 'Imprimante Laser HP', 'Informatique', '3', '45000,00', 'pièce'],
        ['ART-007', 'Scanner A4', 'Informatique', '2', '32000,00', 'pièce'],
        ['ART-008', 'Onduleur 1500VA', 'Électricité', '5', '22000,00', 'pièce'],
        ['ART-009', 'Routeur WiFi 6', 'Réseau', '8', '15000,00', 'pièce'],
        ['ART-010', 'Switch 24 ports', 'Réseau', '4', '28000,00', 'pièce'],
    ]
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerows(rows)
    print(f"  Created: {path} ({len(rows)-1} products)")
    return path


# ── 3. Excel (XLSX) file ─────────────────────────────────────────────────────
def create_xlsx_products():
    """Create a sample XLSX file with products."""
    try:
        from openpyxl import Workbook
    except ImportError:
        print("  Skipped XLSX (openpyxl not installed)")
        return None

    path = os.path.join(DATA_DIR, 'sample_products.xlsx')
    wb = Workbook()
    ws = wb.active
    ws.title = "Produits"
    headers = ['Code', 'Désignation', 'Catégorie', 'Quantité', 'Prix Unitaire', 'Unité']
    ws.append(headers)
    products = [
        ['ART-001', 'Ordinateur Portable Dell', 'Informatique', 5, 85000, 'pièce'],
        ['ART-002', 'Écran LED 24 pouces', 'Informatique', 10, 18500, 'pièce'],
        ['ART-003', 'Clavier USB', 'Accessoires', 20, 1200, 'pièce'],
        ['ART-004', 'Souris Optique', 'Accessoires', 20, 800, 'pièce'],
        ['ART-005', 'Câble HDMI 2m', 'Accessoires', 15, 350, 'pièce'],
    ]
    for p in products:
        ws.append(p)

    # Second sheet: Suppliers
    ws2 = wb.create_sheet("Fournisseurs")
    ws2.append(['Nom', 'Adresse', 'Téléphone', 'Email', 'RC', 'NIF', 'NIS'])
    ws2.append(['EURL TEST SUPPLIER', '123 Rue de Test, Alger', '021 12 34 56',
                'contact@test-supplier.dz', '16/00-1234567 B', '000916100123456', '000916180123456'])
    ws2.append(['EURL OVERLINK', 'Coop G6 N°14 Cité Jolie Vue Kouba', '0556 08 13 55',
                'contact@overlink-dz.com', '21B1001566-16/00', '002116100156662', '002116180192055'])

    wb.save(path)
    print(f"  Created: {path} (2 sheets, {len(products)} products)")
    return path


# ── 4. Word (DOCX) file ──────────────────────────────────────────────────────
def create_docx_invoice():
    """Create a sample DOCX invoice file."""
    path = os.path.join(DATA_DIR, 'sample_invoice.docx')
    # Minimal DOCX: ZIP with word/document.xml
    document_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>FACTURE PROFORMA</w:t></w:r></w:p>
<w:p><w:r><w:t>N°: TEST-DOCX-002</w:t></w:r></w:p>
<w:p><w:r><w:t>Date: 2026-08-07</w:t></w:r></w:p>
<w:p><w:r><w:t></w:t></w:r></w:p>
<w:p><w:r><w:t>FOURNISSEUR: SARL TEST WORD</w:t></w:r></w:p>
<w:p><w:r><w:t>Adresse: 789 Boulevard Word, Constantine</w:t></w:r></w:p>
<w:p><w:r><w:t>Téléphone: 031 98 76 54</w:t></w:r></w:p>
<w:p><w:r><w:t>RC: 25C000987-25/00</w:t></w:r></w:p>
<w:p><w:r><w:t>NIF: 002516100098765</w:t></w:r></w:p>
<w:p><w:r><w:t>NIS: 002516180098765</w:t></w:r></w:p>
<w:p><w:r><w:t></w:t></w:r></w:p>
<w:p><w:r><w:t>CLIENT: EURL CLIENT WORD</w:t></w:r></w:p>
<w:p><w:r><w:t>Adresse: 321 Rue Client, Sétif</w:t></w:r></w:p>
<w:p><w:r><w:t></w:t></w:r></w:p>
<w:tbl>
<w:tr>
<w:tc><w:p><w:r><w:t>Code</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>Désignation</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>Qté</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>P.U HT</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>Montant HT</w:t></w:r></w:p></w:tc>
</w:tr>
<w:tr>
<w:tc><w:p><w:r><w:t>ART-101</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>Tablette Graphique</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>3</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>35000,00</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>105000,00</w:t></w:r></w:p></w:tc>
</w:tr>
<w:tr>
<w:tc><w:p><w:r><w:t>ART-102</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>Stylet Digital</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>5</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>5500,00</w:t></w:r></w:p></w:tc>
<w:tc><w:p><w:r><w:t>27500,00</w:t></w:r></w:p></w:tc>
</w:tr>
</w:tbl>
<w:p><w:r><w:t></w:t></w:r></w:p>
<w:p><w:r><w:t>Total HT: 132500,00 DA</w:t></w:r></w:p>
<w:p><w:r><w:t>TVA (19%): 25175,00 DA</w:t></w:r></w:p>
<w:p><w:r><w:t>Total TTC: 157675,00 DA</w:t></w:r></w:p>
</w:body>
</w:document>'''

    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''

    rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

    word_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>'''

    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', content_types)
        zf.writestr('_rels/.rels', rels)
        zf.writestr('word/document.xml', document_xml)
        zf.writestr('word/_rels/document.xml.rels', word_rels)

    print(f"  Created: {path} (DOCX with table)")
    return path


# ── 5. PDF file (with text layer) ────────────────────────────────────────────
def create_pdf_invoice():
    """Create a sample PDF with a text layer using PyMuPDF."""
    try:
        import fitz
    except ImportError:
        print("  Skipped PDF (PyMuPDF not installed)")
        return None

    path = os.path.join(DATA_DIR, 'sample_invoice.pdf')
    doc = fitz.open()  # new empty PDF
    page = doc.new_page(width=595, height=842)  # A4

    # Header: supplier info
    y = 50
    page.insert_text((50, y), "EURL TEST PDF SUPPLIER", fontsize=14, fontname="helv")
    y += 20
    page.insert_text((50, y), "45 Rue PDF, Alger", fontsize=10, fontname="helv")
    y += 15
    page.insert_text((50, y), "Tel: 021 11 22 33 | Email: test@pdf-supplier.dz", fontsize=10, fontname="helv")
    y += 15
    page.insert_text((50, y), "RC: 16/00-9998888 B | NIF: 000916100999888 | NIS: 000916180999888", fontsize=9, fontname="helv")

    # Title
    y += 30
    page.insert_text((200, y), "FACTURE PROFORMA", fontsize=16, fontname="helv")
    y += 20
    page.insert_text((200, y), "N°: TEST-PDF-003", fontsize=12, fontname="helv")
    y += 15
    page.insert_text((200, y), "Date: 07/08/2026", fontsize=10, fontname="helv")

    # Client
    y += 25
    page.insert_text((50, y), "CLIENT: EURL PDF CLIENT", fontsize=11, fontname="helv")
    y += 15
    page.insert_text((50, y), "Adresse: 78 Avenue Client, Blida", fontsize=10, fontname="helv")

    # Table header
    y += 25
    page.insert_text((50, y), "Code", fontsize=9, fontname="helv")
    page.insert_text((120, y), "Designation", fontsize=9, fontname="helv")
    page.insert_text((350, y), "Qte", fontsize=9, fontname="helv")
    page.insert_text((400, y), "P.U HT", fontsize=9, fontname="helv")
    page.insert_text((480, y), "Montant HT", fontsize=9, fontname="helv")

    # Table rows
    items = [
        ("ART-201", "Disque SSD 512GB", 10, 12500, 125000),
        ("ART-202", "Routeur 4G LTE", 5, 8500, 42500),
        ("ART-203", "Webcam HD 1080p", 8, 3200, 25600),
        ("ART-204", "Casque Audio USB", 12, 1800, 21600),
        ("ART-205", "Hub USB-C 7 ports", 6, 4500, 27000),
    ]
    y += 15
    for code, desc, qty, pu, total in items:
        page.insert_text((50, y), code, fontsize=9, fontname="helv")
        page.insert_text((120, y), desc, fontsize=9, fontname="helv")
        page.insert_text((350, y), str(qty), fontsize=9, fontname="helv")
        page.insert_text((400, y), f"{pu:,.2f}", fontsize=9, fontname="helv")
        page.insert_text((480, y), f"{total:,.2f}", fontsize=9, fontname="helv")
        y += 14

    # Totals
    y += 10
    page.insert_text((350, y), "Total HT:", fontsize=10, fontname="helv")
    page.insert_text((480, y), "241,700.00", fontsize=10, fontname="helv")
    y += 15
    page.insert_text((350, y), "TVA (19%):", fontsize=10, fontname="helv")
    page.insert_text((480, y), "45,923.00", fontsize=10, fontname="helv")
    y += 15
    page.insert_text((350, y), "Total TTC:", fontsize=10, fontname="helv")
    page.insert_text((480, y), "287,623.00", fontsize=10, fontname="helv")

    doc.save(path)
    doc.close()
    print(f"  Created: {path} (PDF with text layer, {len(items)} items)")
    return path


# ── 6. PNG image (rendered from PDF) ─────────────────────────────────────────
def create_png_invoice():
    """Create a sample PNG image of an invoice (for Tesseract OCR testing)."""
    try:
        import fitz
    except ImportError:
        print("  Skipped PNG (PyMuPDF not installed)")
        return None

    pdf_path = os.path.join(DATA_DIR, 'sample_invoice.pdf')
    if not os.path.exists(pdf_path):
        create_pdf_invoice()

    path = os.path.join(DATA_DIR, 'sample_invoice.png')
    doc = fitz.open(pdf_path)
    page = doc.load_page(0)
    mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for decent resolution
    pix = page.get_pixmap(matrix=mat)
    pix.save(path)
    doc.close()
    print(f"  Created: {path} ({pix.width}x{pix.height})")
    return path


# ── 7. Scanned PDF (image-only, no text layer) ───────────────────────────────
def create_scanned_pdf():
    """Create a scanned PDF (image-only, no text layer) for Tesseract testing."""
    try:
        import fitz
    except ImportError:
        print("  Skipped scanned PDF (PyMuPDF not installed)")
        return None

    png_path = os.path.join(DATA_DIR, 'sample_invoice.png')
    if not os.path.exists(png_path):
        create_png_invoice()

    path = os.path.join(DATA_DIR, 'sample_scanned_invoice.pdf')
    # Insert the PNG as a full-page image in a PDF (no text layer)
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_image(fitz.Rect(0, 0, 595, 842), filename=png_path)
    doc.save(path)
    doc.close()
    print(f"  Created: {path} (scanned PDF, image-only)")
    return path


# ── 8. UTF-16 TXT file (Windows Notepad default) ─────────────────────────────
def create_utf16_txt():
    """Create a UTF-16 encoded TXT file (common from Windows Notepad)."""
    content = "FACTURE TEST UTF-16\nN°: TEST-UTF16-004\nDate: 2026-08-07\nFournisseur: Test UTF-16 Supplier\nTotal: 50 000,00 DA\n"
    path = os.path.join(DATA_DIR, 'sample_utf16.txt')
    with open(path, 'w', encoding='utf-16') as f:
        f.write(content)
    print(f"  Created: {path} (UTF-16 with BOM)")
    return path


# ── 9. Employee ID TXT (for HR module) ───────────────────────────────────────
def create_employee_id_txt():
    """Create a sample employee ID document text."""
    content = """CARTE NATIONALE D'IDENTITÉ
République Algérienne Démocratique et Populaire

Nom: ZITOUNI
Prénom: Ahmed
Date de naissance: 15/03/1985
Lieu de naissance: Alger
Sexe: Masculin
N° National: 185031500123
Adresse: 12 Rue des Frères, Alger
Profession: Technicien Informatique
Date de délivrance: 10/01/2020
Date d'expiration: 10/01/2030
"""
    path = os.path.join(DATA_DIR, 'sample_employee_id.txt')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  Created: {path} (employee ID)")
    return path


# ── 10. CV/Resume TXT (for HR module) ────────────────────────────────────────
def create_cv_txt():
    """Create a sample CV/Resume text."""
    content = """CURRICULUM VITAE

Nom: BOUDJEMAA Karim
Adresse: 45 Cité Jolie Vue, Kouba, Alger
Téléphone: 0551 23 45 67
Email: karim.boudjemaa@email.dz

EXPERIENCE PROFESSIONNELLE:
- 2020-2026: Technicien Réseau, EURL OVERLINK
  Installation et maintenance de systèmes de sécurité
  Gestion de projets de caméras de surveillance

- 2018-2020: Administrateur Système, SARL MULTIDEV
  Maintenance informatique et support technique

FORMATION:
- 2018: Licence en Informatique, Université d'Alger
- 2015: Baccalauréat Science, Lycée El Idrissi

COMPÉTENCES:
- Réseaux: Cisco, MikroTik, Ubiquiti
- Systèmes: Windows Server, Linux
- Sécurité: Hikvision, Dahua, Paradox
"""
    path = os.path.join(DATA_DIR, 'sample_cv.txt')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  Created: {path} (CV/Resume)")
    return path


# ── 11. Tender document TXT (for Consulting module) ──────────────────────────
def create_tender_txt():
    """Create a sample tender/consulting document."""
    content = """AVIS D'APPEL D'OFFRES NATIONAL OUVERT
N°: AON-2026-045

MINISTÈRE DES POSTES ET DES TÉLÉCOMMUNICATIONS

Objet: Acquisition et installation d'équipements de sécurité incendie
pour les locaux du Ministère

Date de publication: 07/08/2026
Date limite de dépôt: 15/09/2026

CAUTION PROVISOIRE: 300 000,00 DA
CAUTION DÉFINITIVE: 5% du montant du marché

DURÉE D'EXÉCUTION: 90 jours

CRITÈRES D'ÉVALUATION:
1. Prix (60%)
2. Délai d'exécution (15%)
3. Qualité technique (25%)

PIÈCES À FOURNIR:
- Copie de RC
- Copie de NIF
- Copie de NIS
- Attestation de paiement des cotisations CNAS
- Bilan financier des 3 dernières années
- Références similaires

ADRESSE DE DÉPÔT:
Direction des Marchés Publics
Ministère des Postes et Télécommunications
12 Rue des Frères Bouadou, Alger
"""
    path = os.path.join(DATA_DIR, 'sample_tender.txt')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  Created: {path} (tender document)")
    return path


# ── 12. Supplier info TXT (for Purchasing module) ────────────────────────────
def create_supplier_txt():
    """Create a sample supplier info document."""
    content = """FICHE FOURNISSEUR

Raison sociale: EURL OVERLINK
Forme juridique: EURL
Activité: Network & Security Solutions

Adresse: Coop G6 N°14 Cité Jolie Vue Kouba, Alger
Téléphone: 0556 08 13 55
Email: contact@overlink-dz.com
Site web: www.overlink-dz.com

RC: 21B1001566-16/00
NIF: 002116100156662
NIS: 002116180192055
AI: 16184614036
RIB: 005001110000005248/46
Banque: BDL Bir Mourad Rais

Représentant: Boudjemline Hichem
Téléphone représentant: 0559 66 69 51
"""
    path = os.path.join(DATA_DIR, 'sample_supplier.txt')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  Created: {path} (supplier info)")
    return path


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("Generating test data files for OCR testing")
    print(f"Output directory: {DATA_DIR}")
    print("=" * 60)

    created = []
    created.append(create_txt_invoice())
    created.append(create_csv_products())
    created.append(create_xlsx_products())
    created.append(create_docx_invoice())
    created.append(create_pdf_invoice())
    created.append(create_png_invoice())
    created.append(create_scanned_pdf())
    created.append(create_utf16_txt())
    created.append(create_employee_id_txt())
    created.append(create_cv_txt())
    created.append(create_tender_txt())
    created.append(create_supplier_txt())

    print(f"\n{'='*60}")
    print(f"Created {len([c for c in created if c])} test files")
    print(f"Directory: {DATA_DIR}")
    print("=" * 60)

    # List all files
    print("\nFiles:")
    for f in sorted(os.listdir(DATA_DIR)):
        fpath = os.path.join(DATA_DIR, f)
        size = os.path.getsize(fpath)
        print(f"  {f:40s} {size:>10,} bytes")


if __name__ == '__main__':
    main()
