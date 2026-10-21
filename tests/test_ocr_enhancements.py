"""Unit tests for OCR precision improvements and Arabic language normalization."""

import sys
import unittest
from pathlib import Path

# Add project root to sys.path
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from app.services.ocr_service import (
    normalize_arabic_ocr_text,
    _otsu_threshold,
    _text_quality,
    _resolve_safe_lang
)
from app.services.ai_file_processor import (
    _extract_arabic_textual_date,
    _regex_invoice_extract
)


class TestOcrEnhancements(unittest.TestCase):

    def test_normalize_arabic_ligatures(self):
        # Test presentation forms (e.g. Lam-Alef ligature \uFEFB)
        ligature_text = "ا\uFEFBسعار والمجموع"
        normalized = normalize_arabic_ocr_text(ligature_text)
        self.assertIn("الاسعار", normalized)
        self.assertIn("المجموع", normalized)

    def test_strip_tatweel_and_tashkeel(self):
        # Test tatweel (kashida) and harakat
        harakat_text = "فَاتُـورَةٌ ضَرِيبِـيَّةٌ"
        normalized = normalize_arabic_ocr_text(harakat_text)
        self.assertEqual(normalized, "فاتورة ضريبية")

    def test_fix_spaced_arabic_letters(self):
        spaced_text = "ف ا ت و ر ة   م ب ي ع ا ت"
        normalized = normalize_arabic_ocr_text(spaced_text)
        self.assertEqual(normalized, "فاتورة   مبيعات")

    def test_fix_reversed_arabic_words(self):
        reversed_text = "ةروتالفلا رقم 2026 وعومجملا ةكرشلا غلبملا عومجملاو وةكرشلا"
        normalized = normalize_arabic_ocr_text(reversed_text)
        self.assertIn("الفاتورة", normalized)
        self.assertIn("والمجموع", normalized)
        self.assertIn("الشركة", normalized)
        self.assertIn("المبلغ", normalized)
        self.assertIn("والشركة", normalized)

    def test_extended_commercial_vocabulary(self):
        rev_text = "ةقفصلا عيقوتلا عئاضبلا ةيرئازجلا ةيروهمجلا"
        normalized = normalize_arabic_ocr_text(rev_text)
        self.assertIn("الصفقة", normalized)
        self.assertIn("التوقيع", normalized)
        self.assertIn("البضائع", normalized)
        self.assertIn("الجزائرية", normalized)
        self.assertIn("الجمهورية", normalized)

    def test_arabic_indic_digits_normalization(self):
        indic_text = "المجموع: ١٥٠٠٠٫٥٠ دج بتاريخ ٢٠٢٦/٠٤/١٥"
        normalized = normalize_arabic_ocr_text(indic_text)
        self.assertIn("15000.50", normalized)
        self.assertIn("2026/04/15", normalized)

    def test_arabic_textual_date_extraction(self):
        sample_invoice = "فاتورة بيع رقم 102 بتاريخ 25 جانفي 2026 الصادرة بالجزائر"
        extracted_date = _extract_arabic_textual_date(sample_invoice)
        self.assertEqual(extracted_date, "2026-01-25")

        sample_nov = "تاريخ الاستحقاق: 01 نوفمبر 2026"
        extracted_nov = _extract_arabic_textual_date(sample_nov)
        self.assertEqual(extracted_nov, "2026-11-01")

    def test_regex_invoice_fiscal_breakdown(self):
        invoice_doc = """
        شركة التوزيع الحديثة
        المورد: شركة النور للتجهيزات
        العنوان: 15 شارع ديدوش مراد، الجزائر
        السجل التجاري: 16/00-1234567B22
        الرقم الجبائي: 001616012345678
        العميل: مؤسسة الأمل للتجارة
        فاتورة رقم: FACT-2026-88
        بتاريخ: 25 جانفي 2026

        المجموع الخام: 100 000,00 DA
        الرسم على القيمة المضافة: 19 000,00 DA
        حق الطابع: 1 000,00 DA
        المجموع الإجمالي: 120 000,00 DA
        """
        extracted = _regex_invoice_extract(invoice_doc)
        self.assertIsNotNone(extracted)
        fields = extracted.get("fields", {})
        self.assertEqual(fields.get("invoice_number"), "FACT-2026-88")
        self.assertEqual(fields.get("invoice_date"), "2026-01-25")
        self.assertEqual(fields.get("subtotal"), 100000.0)
        self.assertEqual(fields.get("vat"), 19000.0)
        self.assertEqual(fields.get("timbre"), 1000.0)
        self.assertEqual(fields.get("total"), 120000.0)

    def test_otsu_thresholding(self):
        # Bimodal histogram with dark text peak (30-60) and light background peak (180-220)
        hist = [0] * 256
        for i in range(30, 60):
            hist[i] = 100
        for i in range(180, 220):
            hist[i] = 400
        threshold = _otsu_threshold(hist)
        # Optimal threshold should cleanly separate foreground and background
        self.assertTrue(50 <= threshold <= 180)

    def test_text_quality_scoring(self):
        arabic_text = "فاتورة مبيعات رقم 1025 المجموع 5000 دج"
        noise_text = "... --- /// |||"
        self.assertGreater(_text_quality(arabic_text), _text_quality(noise_text) + 50)

    def test_safe_lang_resolution(self):
        class MockTess:
            @staticmethod
            def get_languages():
                return ["ara", "fra", "eng"]

        # When all requested languages exist
        resolved = _resolve_safe_lang("ara+fra+eng", MockTess)
        self.assertEqual(resolved, "ara+fra+eng")

        # When only subset exists
        class MockTessSubset:
            @staticmethod
            def get_languages():
                return ["fra", "eng"]

        resolved_subset = _resolve_safe_lang("ara+fra+eng", MockTessSubset)
        self.assertEqual(resolved_subset, "fra+eng")


if __name__ == "__main__":
    unittest.main()
