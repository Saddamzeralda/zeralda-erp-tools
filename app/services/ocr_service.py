"""OCR service utilities.

Provides:
- Direct parsers for Office/text files (Excel, Word, TXT, CSV).
- Tesseract-based OCR for images and image-based PDFs (via PyMuPDF + pytesseract).
- Image enhancement (grayscale, contrast, thresholding, upscaling) for faint text.
"""

import base64
import csv
import html
import io
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
import zipfile
import unicodedata
from typing import Dict, List, Optional
from pathlib import Path

_logger = logging.getLogger('zeralda.ocr_service')
if not _logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter('[OCR] %(levelname)s %(message)s'))
    _logger.addHandler(_h)
    _logger.setLevel(logging.INFO)

# Maximum accepted base64 payload size (65 MB base64 ≈ ~48-50 MB raw).
_MAX_BASE64_BYTES = 65 * 1024 * 1024
# Maximum decoded bytes (85 MB decoded buffer).
_MAX_DECODED_BYTES = 85 * 1024 * 1024

# Local bundled Tesseract paths (lazy-configured on first use, not at import).
_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_TESS_DIR = str(_BASE_DIR / 'tools' / 'tesseract')
_TESS_BIN = os.path.join(_TESS_DIR, 'tesseract.exe')
_TESS_DATA = os.path.join(_TESS_DIR, 'tessdata')
_tess_env_configured = False


def _ensure_tess_env():
    """Lazily configure Tesseract env vars from bundled binary (called on first OCR use)."""
    global _tess_env_configured
    if _tess_env_configured:
        return
    if os.path.isfile(_TESS_BIN):
        if not os.environ.get('TESSERACT_CMD'):
            os.environ['TESSERACT_CMD'] = _TESS_BIN
        if not os.environ.get('TESSDATA_PREFIX'):
            os.environ['TESSDATA_PREFIX'] = _TESS_DATA
    _tess_env_configured = True


# Lock to serialize LibreOffice soffice calls (it doesn't handle concurrent headless instances well).
_soffice_lock = threading.Lock()

try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover - optional dependency
    fitz = None

try:
    import openpyxl
except Exception:  # pragma: no cover - optional dependency
    openpyxl = None

try:
    import xlrd
except Exception:  # pragma: no cover - optional dependency
    xlrd = None


EXCEL_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.ms-excel.sheet.macroenabled.12",
    "text/csv",
    "application/csv",
}

WORD_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.ms-word",
}

TEXT_MIME_TYPES = {
    "text/plain",
}


def _looks_like_spreadsheet(mime_type: str, file_name: str) -> bool:
    mime = str(mime_type or "").lower().strip()
    name = str(file_name or "").lower().strip()
    if mime in EXCEL_MIME_TYPES:
        return True
    return name.endswith(".xlsx") or name.endswith(".xls") or name.endswith(".csv")


def _looks_like_word_or_text(mime_type: str, file_name: str) -> bool:
    mime = str(mime_type or "").lower().strip()
    name = str(file_name or "").lower().strip()

    if mime in WORD_MIME_TYPES or mime in TEXT_MIME_TYPES:
        return True

    # Some browsers can send application/octet-stream for unknown/legacy uploads.
    if name.endswith(".docx") or name.endswith(".doc") or name.endswith(".txt"):
        return True

    return False


def _extract_from_txt_bytes(payload: bytes) -> str:
    # 1) Detect UTF-16 BOM first (common from Windows Notepad)
    if payload.startswith((b'\xff\xfe', b'\xfe\xff')):
        try:
            return payload.decode('utf-16').strip()
        except Exception:
            pass
    # 2) Try UTF-8 BOM, then UTF-8, then cp1256 (Arabic), then cp1252, then latin-1 as last resort
    decoded = None
    for encoding in ("utf-8-sig", "utf-8", "cp1256", "cp1252", "latin-1"):
        try:
            decoded = payload.decode(encoding)
            break
        except Exception:
            continue
    if decoded is None:
        raise RuntimeError("TXT decoding failed")
    return decoded.strip()


def _extract_from_docx_bytes(payload: bytes) -> str:
    # DOCX is a ZIP package; read XML and strip tags to plain text.
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            text_parts = []

            xml_candidates = []
            for name in zf.namelist():
                if (name == "word/document.xml" or name.startswith("word/header")
                        or name.startswith("word/footer")
                        or name in ("word/footnotes.xml", "word/endnotes.xml", "word/comments.xml")):
                    xml_candidates.append(name)

            if not xml_candidates:
                raise RuntimeError("DOCX does not contain Word XML parts")

            for xml_name in xml_candidates:
                xml_bytes = zf.read(xml_name)
                xml_text = xml_bytes.decode("utf-8", errors="replace")

                # Convert table cell boundaries to tabs before other processing
                xml_text = re.sub(r"</w:tc>", "\t", xml_text, flags=re.IGNORECASE)
                xml_text = re.sub(r"</w:tr>", "\n", xml_text, flags=re.IGNORECASE)
                # Convert paragraph and break tags into new lines
                xml_text = re.sub(r"</w:p>", "\n", xml_text, flags=re.IGNORECASE)
                xml_text = re.sub(r"<w:br\s*/?>", "\n", xml_text, flags=re.IGNORECASE)
                # Convert list items to bullet lines
                xml_text = re.sub(r'<w:numPr>.*?</w:numPr>', '', xml_text, flags=re.IGNORECASE | re.DOTALL)
                # Strip remaining tags
                xml_text = re.sub(r"<[^>]+>", "", xml_text)
                xml_text = html.unescape(xml_text)

                cleaned = "\n".join([line.strip() for line in xml_text.splitlines() if line.strip()])
                if cleaned:
                    text_parts.append(cleaned)

            return "\n\n".join(text_parts).strip()
    except zipfile.BadZipFile as exc:
        raise RuntimeError("Invalid DOCX file") from exc
    except Exception as exc:
        raise RuntimeError(f"DOCX parsing failed: {exc}") from exc


def _find_soffice_exe() -> Optional[str]:
    # 1) Explicit override
    configured = str(os.getenv("SOFFICE_CMD") or "").strip()
    if configured and os.path.isfile(configured):
        return configured

    # 2) Common Windows paths
    candidates = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path

    # 3) PATH lookup
    found = shutil.which("soffice") or shutil.which("soffice.exe")
    return found


def _extract_from_doc_via_soffice(payload: bytes) -> str:
    soffice = _find_soffice_exe()
    if not soffice:
        raise RuntimeError("LibreOffice soffice not found")

    # Serialize soffice calls — it doesn't handle concurrent headless instances well.
    with _soffice_lock:
        with tempfile.TemporaryDirectory(prefix="ocr_doc_") as tmp_dir:
            src_path = os.path.join(tmp_dir, "input.doc")
            out_path = os.path.join(tmp_dir, "input.txt")

            with open(src_path, "wb") as f:
                f.write(payload)

            cmd = [
                soffice,
                "--headless",
                "--nologo",
                "--nolockcheck",
                "--convert-to",
                "txt:Text",
                "--outdir",
                tmp_dir,
                src_path,
            ]

            try:
                proc = subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=90,
                    check=False,
                    text=True,
                )
            except subprocess.TimeoutExpired as exc:
                raise RuntimeError("DOC conversion timed out (90s)") from exc
            except Exception as exc:
                raise RuntimeError(f"DOC conversion failed: {exc}") from exc

            if proc.returncode != 0 or not os.path.isfile(out_path):
                err = (proc.stderr or proc.stdout or "").strip()
                raise RuntimeError(f"DOC conversion failed{(': ' + err) if err else ''}")

            with open(out_path, "rb") as f:
                txt_bytes = f.read()
            return _extract_from_txt_bytes(txt_bytes)


def _extract_from_doc_bytes(payload: bytes) -> str:
    # Prefer LibreOffice conversion for robust legacy .doc extraction.
    try:
        return _extract_from_doc_via_soffice(payload)
    except Exception as exc:
        _logger.warning("LibreOffice DOC conversion failed: %s", exc)
        # Do NOT fall back to raw text decode — .doc is a binary OLE format
        # and decoding it as text produces garbage. Surface the error instead.
        raise RuntimeError(
            "DOC parsing failed: LibreOffice (soffice) is required to extract "
            f"text from legacy .doc files. Original error: {exc}"
        ) from exc


def _extract_from_word_or_text_bytes(payload: bytes, mime_type: str, file_name: str) -> str:
    mime = str(mime_type or "").lower().strip()
    name = str(file_name or "").lower().strip()

    if mime in TEXT_MIME_TYPES or name.endswith(".txt"):
        return _extract_from_txt_bytes(payload)

    if mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or name.endswith(".docx"):
        return _extract_from_docx_bytes(payload)

    if mime in {"application/msword", "application/vnd.ms-word"} or name.endswith(".doc"):
        return _extract_from_doc_bytes(payload)

    raise RuntimeError("Unsupported Word/TXT format")


def _extract_from_csv_bytes(csv_bytes: bytes, max_rows: int = 200, max_cols: int = 25) -> str:
    decoded = None
    # Detect UTF-16 BOM first
    if csv_bytes.startswith((b'\xff\xfe', b'\xfe\xff')):
        try:
            decoded = csv_bytes.decode('utf-16')
        except Exception:
            pass
    if decoded is None:
        for encoding in ("utf-8-sig", "utf-8", "cp1256", "cp1252", "latin-1"):
            try:
                decoded = csv_bytes.decode(encoding)
                break
            except Exception:
                continue
    if decoded is None:
        raise RuntimeError("CSV decoding failed")

    rows = []
    # Auto-detect delimiter (comma, semicolon, tab, pipe) — common in EU/Algeria CSVs
    sample = decoded[:8192]
    delimiter = ','
    try:
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(sample, delimiters=',;\t|')
        delimiter = dialect.delimiter
    except Exception:
        # Fallback: pick delimiter with most occurrences in first line
        first_line = sample.split('\n', 1)[0] if '\n' in sample else sample
        counts = {d: first_line.count(d) for d in (',', ';', '\t', '|')}
        best = max(counts, key=counts.get)
        if counts[best] > 0:
            delimiter = best

    reader = csv.reader(io.StringIO(decoded), delimiter=delimiter)
    truncated = False
    for idx, row in enumerate(reader):
        if idx >= max_rows:
            truncated = True
            break
        clipped = [str(cell or "").strip() for cell in row[:max_cols]]
        line = "\t".join(clipped).strip()
        if line:
            rows.append(line)
    result = "\n".join(rows).strip()
    if truncated:
        _logger.info("CSV truncated to %d rows (file had more)", max_rows)
    return result


def _extract_from_xlsx_bytes(xlsx_bytes: bytes, max_sheets: int = 4, max_rows: int = 200, max_cols: int = 25) -> str:
    if not openpyxl:
        raise RuntimeError("openpyxl is required for XLSX parsing")

    parts = []
    try:
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
        for ws in wb.worksheets[:max_sheets]:
            lines = []
            row_count = 0
            for row in ws.iter_rows(min_row=1, max_col=max_cols, values_only=True):
                if row_count >= max_rows:
                    break
                row_count += 1
                values = []
                for cell in row:
                    if cell is None:
                        values.append("")
                    elif hasattr(cell, 'strftime'):
                        # Format datetime/date objects as ISO date string
                        try:
                            values.append(cell.strftime('%Y-%m-%d'))
                        except Exception:
                            values.append(str(cell).strip())
                    elif isinstance(cell, float):
                        # Avoid trailing .0 for integer-valued floats
                        if cell == int(cell):
                            values.append(str(int(cell)))
                        else:
                            values.append(str(cell))
                    else:
                        values.append(str(cell).strip())
                line = "\t".join(values).strip()
                if line:
                    lines.append(line)
            if lines:
                # Use a clear separator that parsers can split on
                parts.append(f"[Sheet: {ws.title}]\n" + "\n".join(lines))
    except Exception as exc:
        raise RuntimeError(f"XLSX parsing failed: {exc}") from exc

    return "\n\n".join(parts).strip()


def _extract_from_xls_bytes(xls_bytes: bytes, max_sheets: int = 4, max_rows: int = 200, max_cols: int = 25) -> str:
    if not xlrd:
        raise RuntimeError("xlrd is required for XLS parsing")

    parts = []
    try:
        wb = xlrd.open_workbook(file_contents=xls_bytes)
        for sheet in wb.sheets()[:max_sheets]:
            lines = []
            rows_limit = min(sheet.nrows, max_rows)
            cols_limit = min(sheet.ncols, max_cols)
            for r in range(rows_limit):
                values = []
                for c in range(cols_limit):
                    cell = sheet.cell_value(r, c)
                    values.append(str(cell).strip() if cell is not None else "")
                line = "\t".join(values).strip()
                if line:
                    lines.append(line)
            if lines:
                parts.append(f"[Sheet: {sheet.name}]\n" + "\n".join(lines))
    except Exception as exc:
        raise RuntimeError(f"XLS parsing failed: {exc}") from exc

    return "\n\n".join(parts).strip()


def _extract_from_spreadsheet_bytes(payload: bytes, mime_type: str, file_name: str) -> str:
    mime = str(mime_type or "").lower().strip()
    name = str(file_name or "").lower().strip()

    if mime in {"text/csv", "application/csv"} or name.endswith(".csv"):
        return _extract_from_csv_bytes(payload)
    if mime == "application/vnd.ms-excel" or name.endswith(".xls"):
        return _extract_from_xls_bytes(payload)
    return _extract_from_xlsx_bytes(payload)




def _configure_tesseract_cmd():
    """Configure pytesseract tesseract_cmd from env, PATH, or local bundled binary."""
    _ensure_tess_env()
    try:
        import pytesseract as _pt
        cmd = os.environ.get('TESSERACT_CMD', '').strip()
        if not cmd:
            found = shutil.which('tesseract') or shutil.which('tesseract.exe')
            cmd = found or ''
        # Standard Linux paths (Docker / Railway / Debian / Ubuntu)
        if not cmd and not sys.platform.startswith('win'):
            for linux_path in ['/usr/bin/tesseract', '/usr/local/bin/tesseract']:
                if os.path.isfile(linux_path):
                    cmd = linux_path
                    break
        # Local bundled tools directory
        if not cmd:
            _local = str(_BASE_DIR / 'tools' / 'tesseract' / 'tesseract.exe')
            if os.path.isfile(_local):
                cmd = _local
        # Standard Windows installation paths
        if not cmd and sys.platform.startswith('win'):
            for win_path in [
                r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
                os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe")
            ]:
                if os.path.isfile(win_path):
                    cmd = win_path
                    break
        if cmd:
            _pt.pytesseract.tesseract_cmd = cmd
    except Exception:
        pass


def get_ocr_status() -> Dict[str, object]:
    """Return OCR capability status for diagnostics/UI checks."""
    pytesseract_installed = False
    tesseract_found = False
    tesseract_cmd = ''
    try:
        import pytesseract as _pt
        pytesseract_installed = True
        _configure_tesseract_cmd()
        tesseract_cmd = str(getattr(_pt.pytesseract, 'tesseract_cmd', '') or '')
        tesseract_found = bool(tesseract_cmd)
    except Exception:
        pytesseract_installed = False

    return {
        "ok": True,
        "engine": "local-parsers",
        "image_pdf_ocr_available": pytesseract_installed and bool(tesseract_found) and bool(fitz),
        "pymupdf_installed": bool(fitz),
        "pytesseract_installed": pytesseract_installed,
        "tesseract_cmd": tesseract_cmd or '(not configured)'
    }


def _decode_base64_payload(file_b64: str) -> bytes:
    raw = str(file_b64 or "").strip()
    if not raw:
        raise ValueError("Empty fileBase64 payload")

    # Support data URLs: data:<mime>;base64,<payload>
    if "," in raw and raw.lower().startswith("data:"):
        raw = raw.split(",", 1)[1]

    # Size validation before decode to prevent memory exhaustion
    if len(raw) > _MAX_BASE64_BYTES:
        raise ValueError(
            f"Base64 payload too large: {len(raw) // (1024 * 1024)}MB exceeds "
            f"{_MAX_BASE64_BYTES // (1024 * 1024)}MB limit"
        )

    try:
        decoded = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise ValueError(f"Invalid base64 payload: {exc}") from exc

    if len(decoded) > _MAX_DECODED_BYTES:
        raise ValueError(
            f"Decoded payload too large: {len(decoded) // (1024 * 1024)}MB exceeds "
            f"{_MAX_DECODED_BYTES // (1024 * 1024)}MB limit"
        )
    return decoded



# ── Arabic OCR Text Normalization & Post-Processing ─────────────────────────
def normalize_arabic_ocr_text(text: str) -> str:
    """Post-process and normalize Arabic text extracted by OCR or PDF layers.

    Fixes:
    1. Unicode NFKC normalization (converts presentation forms U+FB50-U+FEFC to standard Arabic).
    2. Converts Arabic-Indic digits (٠-٩, ۰-۹) to standard digits.
    3. Removes Arabic Tatweel (Kashida U+0640) and spurious diacritics.
    4. Merges disconnected Arabic letters (e.g., 'ف ا ت و ر ة' -> 'فاتورة').
    5. Detects and corrects reversed Arabic words from LTR visual order (e.g. 'ةروتالفلا' -> 'الفاتورة').
    6. Corrects full visual LTR lines where words were rendered in reverse order.
    """
    if not text:
        return ""

    # 1. Unicode NFKC normalization (critical for Arabic ligatures like Lam-Alef)
    text = unicodedata.normalize('NFKC', text)

    # 2. Normalize Arabic-Indic and Eastern Arabic-Indic digits
    for i in range(10):
        text = text.replace(chr(0x0660 + i), str(i))
        text = text.replace(chr(0x06F0 + i), str(i))
    text = text.replace('\u066B', '.')  # Arabic decimal separator
    text = text.replace('\u066C', '')   # Arabic thousands separator

    # 3. Strip Tatweel (Kashida: U+0640)
    text = re.sub(r'[\u0640]', '', text)

    # 4. Strip Tashkeel / diacritical noise (Fatha, Damma, Kasra, Sukun, Tanween, Shadda)
    text = re.sub(r'[\u064B-\u065F\u0670]', '', text)

    # 5. Fix spaced cursive letters (e.g. "ف ا ت و ر ة" -> "فاتورة")
    def _merge_spaced(m):
        return re.sub(r'\s+', '', m.group(0))

    text = re.sub(r'(?<![^\s])(?:[\u0621-\u064A] ){2,}[\u0621-\u064A](?![^\s])', _merge_spaced, text)

    # 6. Fix reversed Arabic words caused by LTR rendering (Extended commercial dictionary)
    known_reversed = {
        'ةروتالفلا': 'الفاتورة', 'ةروتالف': 'فاتورة', 'عومجملا': 'المجموع',
        'خيراتلا': 'التاريخ', 'ةكرشلا': 'الشركة', 'ليمعلا': 'العميل',
        'دروملا': 'المورد', 'نوبزلا': 'الزبون', 'غلبملا': 'المبلغ',
        'مقرلا': 'الرقم', 'يمكلا': 'الكمية', 'رعسلا': 'السعر',
        'ةبيرضلا': 'الضريبة', 'يملا': 'الإجمالي', 'يفاصلا': 'الصافي',
        'لمعل': 'العمل', 'ناونعلا': 'العنوان', 'فتاهلا': 'الهاتف',
        'لسلسلا': 'السلسلة', 'عقوملا': 'الموقع', 'كحبلا': 'البحث',
        'عئاضبلا': 'البضائع', 'جتنملا': 'المنتج', 'تاجتنملا': 'المنتجات',
        'لسرملا': 'المرسل', 'ملتسملا': 'المستلم', 'عيقوتلا': 'التوقيع',
        'متخلا': 'الختم', 'لصولا': 'الوصل', 'سابحلا': 'الحساب',
        'فرصملا': 'المصرف', 'كنبلا': 'البنك', 'نمثلا': 'الثمن',
        'ةعاطبلا': 'البضاعة', 'لسوتلا': 'التسليم', 'ةقداصملا': 'المصادقة',
        'ةيرئازجلا': 'الجزائرية', 'ةيروهمجلا': 'الجمهورية', 'ةيدلبلا': 'البلدية',
        'ةيلاولا': 'الولاية', 'ةرازو': 'وزارة', 'ةيريدم': 'مديرية',
        'ةقفصلا': 'الصفقة', 'ةصقانملا': 'المناقصة', 'ةراشتسلا': 'الاستشارة',
        'ضرعلا': 'العرض', 'ليصافتلا': 'التفاصيل', 'ةينقتلا': 'التقنية',
        'ةيلاملا': 'المالية', 'ةداهشلا': 'الشهادة', 'ليجستلا': 'التسجيل',
        'خيراتب': 'بتاريخ', 'ملاسلا': 'الاستلام', 'ةداملا': 'المادة',
        'عجارلا': 'الراجع', 'فارصنا': 'انصراف', 'روضحلا': 'الحضور'
    }

    lines = text.splitlines()
    fixed_lines = []
    for line in lines:
        if not re.search(r'[\u0621-\u064A]', line):
            fixed_lines.append(line)
            continue

        words = line.split(' ')
        fixed_words = []
        reversed_count = 0
        arabic_word_count = 0

        for word in words:
            w_stem = re.sub(r'[^\u0621-\u064A]', '', word)
            if not w_stem or len(w_stem) < 2:
                fixed_words.append(word)
                continue

            arabic_word_count += 1

            if w_stem in known_reversed:
                fixed_words.append(word.replace(w_stem, known_reversed[w_stem]))
                reversed_count += 1
                continue

            # Attached conjunctions / prepositions at start (e.g. وعومجملا -> والمجموع)
            if w_stem[0] in ('و', 'ف', 'ب', 'ل', 'ك') and w_stem[1:] in known_reversed:
                fixed_words.append(word.replace(w_stem, w_stem[0] + known_reversed[w_stem[1:]]))
                reversed_count += 1
                continue

            # Attached conjunctions at end from full LTR reversal (e.g. عومجملاو -> والمجموع)
            if w_stem[-1] in ('و', 'ف') and w_stem[:-1] in known_reversed:
                fixed_words.append(word.replace(w_stem, w_stem[-1] + known_reversed[w_stem[:-1]]))
                reversed_count += 1
                continue

            # Heuristic detection for reversed Arabic:
            prefix = ""
            sub_stem = w_stem
            if w_stem[0] in ('و', 'ف') and len(w_stem) >= 4:
                prefix = w_stem[0]
                sub_stem = w_stem[1:]

            # - Starts with Taa Marbuta 'ة' (impossible in correct Arabic)
            # - Ends with 'لا' (reversed 'ال') while not starting with 'ال'
            if sub_stem.startswith('ة') and not sub_stem.endswith('ة'):
                rev = prefix + sub_stem[::-1]
                fixed_words.append(word.replace(w_stem, rev))
                reversed_count += 1
            elif sub_stem.endswith('لا') and not sub_stem.startswith('ال') and len(sub_stem) >= 4:
                rev = prefix + sub_stem[::-1]
                fixed_words.append(word.replace(w_stem, rev))
                reversed_count += 1
            elif w_stem.endswith(('لاو', 'لاف', 'لاب', 'لل')) and len(w_stem) >= 5:
                # Fully reversed with trailing conjunction: e.g. عومجملاو -> والمجموع
                rev = w_stem[-1] + w_stem[:-1][::-1]
                fixed_words.append(word.replace(w_stem, rev))
                reversed_count += 1
            else:
                fixed_words.append(word)

        # Detect if entire line was laid out in visual LTR (reorder words RTL)
        if reversed_count >= 2 and arabic_word_count >= 2 and (reversed_count / arabic_word_count) >= 0.5:
            fixed_words = fixed_words[::-1]

        fixed_lines.append(' '.join(fixed_words))

    return '\n'.join(fixed_lines)

def _otsu_threshold(hist: List[int]) -> int:
    """Compute optimal binarization threshold via Otsu's method from a 256-bin histogram."""
    total = sum(hist)
    if total == 0:
        return 128
    current_max = 0.0
    threshold = 128
    weight_background = 0
    sum_b = 0
    sum_total = sum(i * hist[i] for i in range(256))
    for t in range(256):
        weight_background += hist[t]
        if weight_background == 0:
            continue
        weight_foreground = total - weight_background
        if weight_foreground == 0:
            break
        sum_b += t * hist[t]
        mean_background = sum_b / weight_background
        mean_foreground = (sum_total - sum_b) / weight_foreground
        between_class_variance = weight_background * weight_foreground * ((mean_background - mean_foreground) ** 2)
        if between_class_variance > current_max:
            current_max = between_class_variance
            threshold = t
    return threshold


def _deskew_image(img):
    """Detect and correct document skew (tilt) within +/- 10 degrees using projection profile variance."""
    try:
        from PIL import Image
        w, h = img.size
        scale = min(1.0, 360.0 / max(w, h))
        if scale < 1.0:
            resample = getattr(Image, 'Resampling', getattr(Image, 'BILINEAR', None))
            if resample is not None and hasattr(resample, 'BILINEAR'):
                resample = resample.BILINEAR
            thumb = img.resize((int(w * scale), int(h * scale)), resample)
        else:
            thumb = img

        if thumb.mode != 'L':
            thumb = thumb.convert('L')

        tw, th = thumb.size
        best_angle = 0
        best_var = -1.0

        for angle in range(-8, 9, 2):
            rot = thumb.rotate(angle, expand=False, fillcolor=255)
            hist = [0] * th
            pix = rot.load()
            for y in range(th):
                hist[y] = sum(1 for x in range(0, tw, 2) if pix[x, y] < 128)
            mean = sum(hist) / max(1, th)
            var = sum((v - mean) ** 2 for v in hist) / max(1, th)
            if var > best_var:
                best_var = var
                best_angle = angle

        if abs(best_angle) >= 2:
            return img.rotate(best_angle, expand=True, fillcolor=255)
    except Exception:
        pass
    return img


def _flatten_illumination(gray_img):
    """Eliminate shadows, phone silhouettes, and uneven lighting gradients across documents.

    Uses a low-pass background estimation filter and high-pass subtraction
    to normalize the background surface to uniform pure white.
    """
    try:
        from PIL import ImageFilter, ImageOps, ImageChops
        w, h = gray_img.size
        # Blur radius proportional to image dimensions (smooth background surface)
        radius = max(15, min(w, h) // 35)
        bg = gray_img.filter(ImageFilter.BoxBlur(radius))
        diff = ImageChops.difference(gray_img, bg)
        inv = ImageOps.invert(diff)
        return ImageOps.autocontrast(inv, cutoff=1)
    except Exception:
        return gray_img


def _preprocess_image_multistage(img):
    """Create three specialized enhanced versions of the image:
    1. Version A: Autocontrast + Sharpness (best for clean scans & PDF text layers).
    2. Version B: Adaptive Otsu binarization with median denoising (best for thermal receipts/tables).
    3. Version C: Illumination-flattened + contrast stretch (best for mobile photos with shadows).
    """
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps, ImageChops

    # Grayscale
    if img.mode != 'L':
        gray = img.convert('L')
    else:
        gray = img.copy()

    # Optimal scaling for OCR (Tesseract performs best around 300 DPI / 1800-2400px side)
    w, h = gray.size
    max_side = max(w, h)
    if max_side < 1600:
        scale = 1800.0 / max_side
        resample = getattr(Image, 'Resampling', getattr(Image, 'LANCZOS', None))
        if resample is not None and hasattr(resample, 'LANCZOS'):
            resample = resample.LANCZOS
        gray = gray.resize((int(w * scale), int(h * scale)), resample)

    # 1. Version A: Autocontrast + Sharpness
    ver_a = ImageOps.autocontrast(gray, cutoff=1)
    sharpener = ImageEnhance.Sharpness(ver_a)
    ver_a = sharpener.enhance(1.4)

    # 2. Version B: Otsu binarization with noise reduction
    try:
        denoised = ver_a.filter(ImageFilter.MedianFilter(size=3))
        hist = denoised.histogram()
        otsu_t = _otsu_threshold(hist)
        ver_b = denoised.point(lambda p: 0 if p < otsu_t else 255, 'L')
    except Exception:
        ver_b = ver_a

    # 3. Version C: Shadow removal / Illumination flattened
    ver_c = _flatten_illumination(gray)

    return ver_a, ver_b, ver_c

def _resolve_safe_lang(requested_lang: str, tess_mod) -> str:
    """Filter requested languages against available Tesseract traineddata."""
    try:
        avail = tess_mod.get_languages()
        if avail:
            parts = [p.strip() for p in (requested_lang or "").split("+") if p.strip()]
            valid_parts = [p for p in parts if p in avail]
            if valid_parts:
                return "+".join(valid_parts)
            for fallback in ["ara", "fra", "eng"]:
                if fallback in avail:
                    return fallback
            return avail[0]
    except Exception:
        pass
    return requested_lang or "ara+fra+eng"


def _text_quality(text: str) -> int:
    """Quality scoring for OCR output with high priority on Arabic text and keywords."""
    if not text:
        return 0
    t = text.strip()
    score = 0
    score += sum(1 for c in t if c.isalnum())
    # Arabic characters get double weight
    score += sum(2 for c in t if '\u0621' <= c <= '\u064A')
    lower = t.lower()
    for kw in ('facture', 'فاتورة', 'total', 'مجموع', 'tva', 'ضريبة', 'nif', 'rc', 'da', 'dzd', 'زبون', 'مورد'):
        if kw in lower:
            score += 15
    return score


def _correct_image_orientation(img, tess_mod):
    """Detect and auto-correct inverted (180°) or sideways (90°/270°) document scans."""
    try:
        osd = tess_mod.image_to_osd(img)
        m = re.search(r'Rotate:\s*(\d+)', osd)
        if m:
            angle = int(m.group(1))
            if angle in (90, 180, 270):
                return img.rotate(angle, expand=True)
    except Exception:
        pass
    return img


def _extract_from_image_bytes(image_bytes: bytes, lang: str = "ara+fra+eng", mime_type: str = "image/jpeg") -> str:
    """Perform high-precision multi-pass OCR on image bytes using pytesseract + Pillow.

    Improvements:
    - Auto-corrects 90/180/270 degree scan rotations and subtle skew (+/-10 deg).
    - Multi-stage preprocessing: generates contrast-normalized, Otsu-binarized, and shadow-flattened versions.
    - Multi-pass execution: runs PSM 3 (auto layout) and PSM 6 (single block/table).
    - Arabic post-processor: corrects reversed Arabic words, Unicode presentation forms, and spaced letters.
    """
    try:
        import pytesseract as _tess
    except Exception:
        raise RuntimeError("pytesseract is not installed")

    _configure_tesseract_cmd()
    safe_lang = _resolve_safe_lang(lang, _tess)

    try:
        from PIL import Image
    except Exception:
        raise RuntimeError('Pillow is required for image OCR')

    try:
        img = Image.open(io.BytesIO(image_bytes))
        w, h = img.size
        max_dim = max(w, h)
        if max_dim > 2400:
            scale = 2200.0 / max_dim
            resample = getattr(Image, 'Resampling', getattr(Image, 'LANCZOS', None))
            if resample is not None and hasattr(resample, 'LANCZOS'):
                resample = resample.LANCZOS
            img = img.resize((int(w * scale), int(h * scale)), resample)

        # 1. Orientation & Deskewing
        gray = img.convert('L')
        gray = _correct_image_orientation(gray, _tess)
        gray = _deskew_image(gray)

        # 2. Multi-stage preprocessing: 3 targets
        ver_a, ver_b, ver_c = _preprocess_image_multistage(gray)

        candidates = []

        # Pass 1: Version A with PSM 3 (automatic layout)
        try:
            p1 = _tess.image_to_string(ver_a, lang=safe_lang, config='--psm 3').strip()
            p1 = normalize_arabic_ocr_text(p1)
            candidates.append(p1)
        except Exception:
            pass

        # Pass 2: Version B with PSM 6 (single block / tables - excellent for receipts/invoices)
        try:
            p2 = _tess.image_to_string(ver_b, lang=safe_lang, config='--psm 6').strip()
            p2 = normalize_arabic_ocr_text(p2)
            candidates.append(p2)
        except Exception:
            pass

        # Pass 3: Version C (illumination-flattened) if previous candidates are sparse
        best_candidate = max(candidates, key=_text_quality) if candidates else ""
        if _text_quality(best_candidate) < 40:
            try:
                p3 = _tess.image_to_string(ver_c, lang=safe_lang, config='--psm 6').strip()
                p3 = normalize_arabic_ocr_text(p3)
                if _text_quality(p3) > _text_quality(best_candidate):
                    best_candidate = p3
                    candidates.append(p3)
            except Exception:
                pass

        # Pass 4: Inversion check (180 deg) if still sparse
        if _text_quality(best_candidate) < 25:
            try:
                rot180 = ver_a.rotate(180, expand=True)
                p4 = _tess.image_to_string(rot180, lang=safe_lang, config='--psm 3').strip()
                p4 = normalize_arabic_ocr_text(p4)
                if _text_quality(p4) > _text_quality(best_candidate) + 15:
                    best_candidate = p4
            except Exception:
                pass

        return best_candidate
    except Exception as exc:
        raise RuntimeError(f"Image OCR failed: {exc}") from exc

def _extract_from_pdf_bytes(pdf_bytes: bytes, lang: str, max_pages: int = 35) -> str:
    """Extract text from PDF with guaranteed timeout protection and fast 1-pass OCR.

    Behavior:
    - Extracts text layer from pages (up to 35 pages) instantaneously.
    - For scanned PDFs without text layers: renders the first key pages (max 4 pages)
      using fast 130 DPI pixmaps and 1-pass Tesseract.
    - Auto-detects inverted document orientation (e.g. 180° upside-down scan) and corrects it.
    - Hard time limit of 35s prevents Railway 504 Gateway Timeouts (which occur at 60s).
    """
    if not fitz:
        raise RuntimeError('PyMuPDF (fitz) is required for PDF OCR')

    import time
    t_start = time.time()
    max_ocr_duration = 35.0  # Safe cap to guarantee return before Railway proxy 60s timeout

    _tess = None
    try:
        import pytesseract as _tess_mod
        _tess = _tess_mod
        _configure_tesseract_cmd()
    except Exception as tess_init_err:
        _logger.warning("pytesseract could not be imported or configured: %s", tess_init_err)

    out_parts = []
    try:
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        total_pages = len(doc)
        page_count = min(total_pages, max_pages)

        # Pass 1: Check if any digital text layer exists in the PDF
        has_text_layer = False
        text_layer_parts = []
        for i in range(page_count):
            page = doc.load_page(i)
            page_text = (page.get_text("text") or '').strip()
            if page_text and len(page_text) > 20 and not _is_text_garbled(page_text):
                has_text_layer = True
                text_layer_parts.append(f"--- [Page {i+1}] ---\n" + page_text)

        if has_text_layer and text_layer_parts:
            doc.close()
            return normalize_arabic_ocr_text("\n\n".join(text_layer_parts).strip())

        # Pass 2: Scanned document OCR fallback (only if pytesseract is available)
        if not _tess:
            doc.close()
            _logger.warning("Scanned PDF OCR skipped: pytesseract is not installed in the environment")
            return ""

        from PIL import Image, ImageEnhance
        image_ocr_count = 0
        max_image_pages = 4  # First 4 pages contain >90% of tender specs & submission terms
        detected_rotation = 0

        for i in range(min(total_pages, max_image_pages)):
            # Hard deadline check to prevent cloud proxy timeout
            if time.time() - t_start > max_ocr_duration:
                _logger.warning("PDF OCR reached %ds timeout safety limit, returning partial text", int(max_ocr_duration))
                break

            image_ocr_count += 1
            try:
                page = doc.load_page(i)
                # 130 DPI is crisp (~1080p), ideal balance between fast rasterization and OCR clarity
                pix = page.get_pixmap(dpi=130)
                # Directly construct grayscale PIL Image without slow PNG encode/decode in memory
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples).convert('L')

                # On Page 1, detect if document was scanned upside-down or sideways
                if i == 0:
                    try:
                        osd = _tess.image_to_osd(img)
                        m = re.search(r'Rotate:\s*(\d+)', osd)
                        if m:
                            detected_rotation = int(m.group(1))
                            if detected_rotation in (90, 180, 270):
                                _logger.info("Auto-detected scanned document rotation: %d degrees", detected_rotation)
                    except Exception:
                        detected_rotation = 0

                if detected_rotation in (90, 180, 270):
                    img = img.rotate(detected_rotation, expand=True)

                # Primary Pass: Fast PSM 3 (auto layout)
                page_ocr = ''
                try:
                    page_ocr = _tess.image_to_string(img, lang=lang, config='--psm 3').strip()
                except Exception as tess_err:
                    _logger.debug("Tesseract PSM 3 page %d failed: %s", i + 1, tess_err)

                # Secondary fallback: if sparse (< 25 chars), try 1 quick contrast-boosted pass with PSM 6
                if _text_quality(page_ocr) < 25 and (time.time() - t_start < max_ocr_duration - 5):
                    try:
                        enhancer = ImageEnhance.Contrast(img)
                        enhanced = enhancer.enhance(1.4)
                        alt_ocr = _tess.image_to_string(enhanced, lang=lang, config='--psm 6').strip()
                        if _text_quality(alt_ocr) > _text_quality(page_ocr):
                            page_ocr = alt_ocr
                    except Exception:
                        pass

                # Tertiary fallback on Page 1: if still sparse (< 30 chars), test 180° rotation directly!
                # Guarantees upside-down scans work even when tesseract-ocr-osd is missing or inconclusive.
                if i == 0 and _text_quality(page_ocr) < 30 and (time.time() - t_start < max_ocr_duration - 5):
                    try:
                        rot180 = img.rotate(180, expand=True)
                        rot_ocr = _tess.image_to_string(rot180, lang=lang, config='--psm 3').strip()
                        if _text_quality(rot_ocr) > _text_quality(page_ocr) + 15:
                            _logger.info("Auto-detected 180° inverted document scan via content fallback!")
                            detected_rotation = 180
                            page_ocr = rot_ocr
                            img = rot180
                    except Exception:
                        pass

                if page_ocr:
                    page_ocr = normalize_arabic_ocr_text(page_ocr)
                    out_parts.append(f"--- [Page {i+1}] ---\n" + page_ocr)
            except Exception as page_exc:
                _logger.warning("PDF page %d OCR render failed: %s", i + 1, page_exc)
                continue

        doc.close()
        return "\n\n".join(out_parts).strip()
    except Exception as exc:
        raise RuntimeError(f"PDF OCR failed: {exc}") from exc


def _is_text_garbled(text: str, threshold: float = 0.15) -> bool:
    """Check if extracted text looks garbled (common with embedded Arabic fonts).
    Returns True if the ratio of replacement/control chars exceeds threshold."""
    stripped = (text or '').strip()
    if not stripped:
        return True
    total = len(stripped)
    bad = sum(1 for c in stripped if ord(c) == 0xFFFD or (ord(c) < 32 and c not in '\n\r\t'))
    return total > 0 and (bad / total) >= threshold


def _looks_like_image(mime_type: str, file_name: str) -> bool:
    """Check if file is an image by MIME type or extension."""
    mime = str(mime_type or "").lower().strip()
    name = str(file_name or "").lower().strip()
    if mime.startswith("image/"):
        return True
    # Fallback: check extension (browser may send octet-stream)
    # Keep in sync with shared/ocr.js IMAGE_EXT
    image_exts = ('.png', '.jpg', '.jpeg', '.bmp', '.webp', '.gif', '.tiff', '.tif',
                  '.heic', '.heif', '.jfif', '.avif', '.ico')
    return any(name.endswith(ext) for ext in image_exts)


def _looks_like_svg(file_name: str) -> bool:
    """Check if file is an SVG vector image (cannot be OCR'd, read as XML text)."""
    return str(file_name or "").lower().strip().endswith(".svg")


def _looks_like_pdf(mime_type: str, file_name: str) -> bool:
    """Check if file is a PDF by MIME type or extension."""
    mime = str(mime_type or "").lower().strip()
    name = str(file_name or "").lower().strip()
    if mime == "application/pdf":
        return True
    # Fallback: check extension (browser may send octet-stream)
    return name.endswith(".pdf")


def extract_text_from_payload(file_base64: str, mime_type: Optional[str], lang: str = "ara+fra+eng", file_name: Optional[str] = "") -> Dict[str, object]:
    """Extract OCR text from a base64 payload.

    Accepted mime types include image/*, application/pdf, Excel/CSV, Word, and TXT.
    """
    payload = _decode_base64_payload(file_base64)
    normalized_mime = str(mime_type or "").lower().strip()
    fname = str(file_name or "")

    # Infer MIME from extension when missing or generic (octet-stream)
    if not normalized_mime or normalized_mime in ("application/octet-stream", "application/unknown"):
        fname_lower = fname.lower()
        if fname_lower.endswith(".pdf"):
            normalized_mime = "application/pdf"
        elif fname_lower.endswith((".png", ".jpg", ".jpeg", ".bmp", ".webp", ".gif", ".tiff", ".tif")):
            normalized_mime = "image/jpeg"
        elif fname_lower.endswith((".xlsx", ".xls", ".csv")):
            normalized_mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif fname_lower.endswith((".docx", ".doc", ".txt")):
            normalized_mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif fname_lower.endswith(".svg"):
            normalized_mime = "image/svg+xml"
        else:
            normalized_mime = "application/octet-stream"

    # SVG is a vector format — read as XML text, not OCR
    if _looks_like_svg(fname) or normalized_mime == "image/svg+xml":
        try:
            text = _extract_from_txt_bytes(payload)
        except Exception:
            text = ""
        return {
            "ok": bool(text and text.strip()),
            "mimeType": normalized_mime,
            "text": text,
            "textLength": len(text),
            "engine": "svg-text-parser",
            "error": "" if text and text.strip() else "SVG contained no readable text",
        }

    # Use extension-based fallback for octet-stream or unknown MIME types
    if _looks_like_image(normalized_mime, fname):
        text = _extract_from_image_bytes(payload, lang=lang)
        return {
            "ok": bool(text and text.strip()),
            "mimeType": normalized_mime,
            "text": text,
            "textLength": len(text),
            "engine": "tesseract",
            "error": "" if text and text.strip() else "Image OCR returned no text",
        }

    if _looks_like_pdf(normalized_mime, fname):
        text = _extract_from_pdf_bytes(payload, lang=lang)
        err_msg = ""
        if not (text and text.strip()):
            try:
                import pytesseract
            except Exception:
                err_msg = "Tesseract OCR engine (pytesseract) is not installed on the server"
            if not err_msg:
                err_msg = "PDF text extraction returned no text"
        return {
            "ok": bool(text and text.strip()),
            "mimeType": normalized_mime,
            "text": text,
            "textLength": len(text),
            "engine": "tesseract",
            "error": err_msg,
        }

    if _looks_like_spreadsheet(normalized_mime, str(file_name or "")):
        text = _extract_from_spreadsheet_bytes(payload, normalized_mime, str(file_name or ""))
        return {
            "ok": bool(text and text.strip()),
            "mimeType": normalized_mime or "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text": text,
            "textLength": len(text),
            "engine": "spreadsheet-parser",
            "error": "" if text and text.strip() else "Spreadsheet parsing returned no text",
        }

    if _looks_like_word_or_text(normalized_mime, str(file_name or "")):
        text = _extract_from_word_or_text_bytes(payload, normalized_mime, str(file_name or ""))
        return {
            "ok": bool(text and text.strip()),
            "mimeType": normalized_mime or "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text": text,
            "textLength": len(text),
            "engine": "word-text-parser",
            "error": "" if text and text.strip() else "Word/TXT parsing returned no text",
        }

    raise ValueError(f"Unsupported mime type for OCR: {normalized_mime}")
