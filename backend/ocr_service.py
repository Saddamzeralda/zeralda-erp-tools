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
from typing import Dict, List, Optional

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
_TESS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tools', 'tesseract')
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
            _local = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tools', 'tesseract', 'tesseract.exe')
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



def _enhance_image_for_ocr(img, threshold: int = 140):
    """Enhance image for better OCR results, especially for faint/light-colored text.
    Applies: grayscale, contrast enhancement, adaptive thresholding, and upscaling for small images.
    threshold: pixel value below which text becomes black (0-255, lower = only darker text captured)."""
    from PIL import Image, ImageEnhance, ImageFilter

    # Convert to grayscale
    if img.mode != 'L':
        img = img.convert('L')

    # Upscale small images for better OCR (min 1500px on longest side)
    w, h = img.size
    max_side = max(w, h)
    if max_side < 1500:
        scale = 1500 / max_side
        # Support both old and new Pillow Resampling enum locations
        resample = getattr(Image, 'Resampling', getattr(Image, 'LANCZOS', None))
        if resample is not None and hasattr(resample, 'LANCZOS'):
            resample = resample.LANCZOS
        img = img.resize((int(w * scale), int(h * scale)), resample)

    # Enhance contrast (moderate — too high destroys faint text)
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.5)

    # Enhance sharpness
    sharpness = ImageEnhance.Sharpness(img)
    img = sharpness.enhance(1.3)

    # Apply thresholding: convert to pure black/white
    img = img.point(lambda x: 0 if x < threshold else 255, 'L')

    return img


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


def _extract_from_image_bytes(image_bytes: bytes, lang: str, mime_type: str = "image/jpeg") -> str:
    """Perform fast, accurate OCR on image bytes using pytesseract + Pillow.

    Optimized for responsiveness:
    - Auto-corrects scan orientation (inverted 180° or rotated scans).
    - Downscales oversized images (>2048px) to reduce CPU load.
    - Uses grayscale + PSM 3 as primary single-pass execution.
    - Only falls back to contrast enhancement if initial extraction is sparse.
    """
    try:
        import pytesseract as _tess
    except Exception:
        raise RuntimeError("pytesseract is not installed")

    _configure_tesseract_cmd()

    try:
        from PIL import Image, ImageEnhance
    except Exception:
        raise RuntimeError('Pillow is required for image OCR')

    try:
        img = Image.open(io.BytesIO(image_bytes))
        w, h = img.size
        max_dim = max(w, h)
        if max_dim > 2048:
            scale = 1800 / max_dim
            resample = getattr(Image, 'Resampling', getattr(Image, 'LANCZOS', None))
            if resample is not None and hasattr(resample, 'LANCZOS'):
                resample = resample.LANCZOS
            img = img.resize((int(w * scale), int(h * scale)), resample)

        gray = img.convert('L')
        # Auto-correct inverted or rotated document
        gray = _correct_image_orientation(gray, _tess)

        # Fast Primary Pass: PSM 3 (automatic layout)
        try:
            text = _tess.image_to_string(gray, lang=lang, config='--psm 3').strip()
        except Exception:
            text = ''

        # If primary pass got good content, return immediately
        if _text_quality(text) >= 25:
            return text

        # Secondary fallback: contrast enhancement with PSM 6 (single block)
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(1.4)
        try:
            alt_text = _tess.image_to_string(enhanced, lang=lang, config='--psm 6').strip()
            if _text_quality(alt_text) > _text_quality(text):
                text = alt_text
        except Exception:
            pass

        return text
    except Exception as exc:
        raise RuntimeError(f"Image OCR failed: {exc}") from exc


def _text_quality(text: str) -> int:
    """Heuristic: count alphanumeric characters (letters + digits) as a quality score.
    Better than raw length which counts whitespace and noise."""
    return sum(1 for c in (text or '') if c.isalnum())


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
    except Exception:
        pass

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
            return "\n\n".join(text_layer_parts).strip()

        # Pass 2: Scanned document OCR fallback (only if pytesseract is available)
        if not _tess:
            doc.close()
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

                if page_ocr:
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
        return {
            "ok": bool(text and text.strip()),
            "mimeType": normalized_mime,
            "text": text,
            "textLength": len(text),
            "engine": "tesseract",
            "error": "" if text and text.strip() else "PDF text extraction returned no text",
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
