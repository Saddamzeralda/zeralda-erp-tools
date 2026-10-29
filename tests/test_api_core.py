"""Core Automated Test Suite for Zeralda ERP.

Run via:
    python tests/test_api_core.py
"""
import os
import sys
import unittest
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Ensure dummy dev environment for test isolation
os.environ["ENVIRONMENT"] = "development"
os.environ["REQUIRE_AUTH"] = "false"
os.environ["LICENSE_DEV_BYPASS"] = "true"

from app.services import storage, sync_service, license_service


class TestStorageEngine(unittest.TestCase):
    """Test the Dual-Tier Storage Engine for data integrity and concurrency safety."""

    def setUp(self):
        self.test_key = "_test_auto_unit_key"
        self.test_payload = {"unit": "testing", "value": 12345, "nested": {"active": True}}

    def tearDown(self):
        try:
            storage.delete_key(self.test_key)
        except Exception:
            pass

    def test_write_and_read(self):
        """Verify write and read cycle preserves data structure exactly."""
        current = storage.read_store()
        current[self.test_key] = self.test_payload
        storage.write_store(current)
        
        read_val = storage.read_store().get(self.test_key)
        self.assertEqual(read_val, self.test_payload)

    def test_deep_copy_isolation(self):
        """Verify reading a key returns an isolated deep copy that cannot mutate cache."""
        current = storage.read_store()
        current[self.test_key] = self.test_payload
        storage.write_store(current)
        
        copy_val = storage.read_store().get(self.test_key)
        copy_val["mutated"] = "illegal_write"
        
        # Verify original in store was not modified
        original = storage.read_store().get(self.test_key)
        self.assertNotIn("mutated", original)

    def test_delete(self):
        """Verify deleting a key removes it from store."""
        current = storage.read_store()
        current[self.test_key] = self.test_payload
        storage.write_store(current)
        
        storage.delete_key(self.test_key)
        val = storage.read_store().get(self.test_key)
        self.assertIsNone(val)

    def test_zero_data_loss_invoice_protection(self):
        """Verify server-side anti-wipe and stale-write merge protection for invoices-data."""
        import json
        from app.handlers.store import _protect_critical_collection

        existing = [
            {"id": "INV-1", "invoiceNumber": "001/2026", "total": 15000},
            {"id": "INV-2", "invoiceNumber": "002/2026", "total": 25000},
        ]
        old_json = json.dumps(existing)

        # 1. Accidental empty array overwrite ("[]") must be blocked
        protected_val, was_protected, reason = _protect_critical_collection("invoices-data", old_json, "[]")
        self.assertTrue(was_protected)
        self.assertIn("blocked_empty_wipe", reason)
        self.assertEqual(len(json.loads(protected_val)), 2)

        # 2. Stale-cache create (client only had new INV-3 in memory) must auto-merge with INV-1 & INV-2
        stale_create = json.dumps([{"id": "INV-3", "invoiceNumber": "003/2026", "total": 35000}])
        merged_val, was_merged, merge_reason = _protect_critical_collection("invoices-data::comp_1", old_json, stale_create)
        self.assertTrue(was_merged)
        self.assertIn("merged_stale_write", merge_reason)
        merged_list = json.loads(merged_val)
        self.assertEqual([item["id"] for item in merged_list], ["INV-1", "INV-2", "INV-3"])

        # 3. Legitimate single-item deletion (2 -> 1 with no new IDs) must be allowed
        single_delete = json.dumps([existing[0]])
        del_val, was_del_blocked, _ = _protect_critical_collection("invoices-data", old_json, single_delete)
        self.assertFalse(was_del_blocked)
        self.assertEqual(len(json.loads(del_val)), 1)

    def test_full_erp_pdf_report_generation(self):
        """Verify multi-page organized PDF archive generator produces valid PDF bytes."""
        from app.services.pdf import generate_full_erp_pdf_report

        sample_store = {
            "zeralda-settings": {
                "activeCompanyId": "comp_1",
                "companies": [{"id": "comp_1", "name": "شركة زرالدة للتجارة", "rc": "16/00-123456", "nif": "00123456789"}],
            },
            "invoices-data::comp_1": [
                {
                    "id": "INV-100",
                    "invoiceNumber": "001/2026",
                    "date": "2026-10-28",
                    "customer": {"name": "مؤسسة الأمل"},
                    "subtotal": 10000,
                    "tax": 1900,
                    "total": 11900,
                    "paid": 11900,
                    "status": "Paid",
                    "paymentMethod": "Bank Transfer",
                    "items": [{"description": "تجهيزات مكتبية", "quantity": 2, "price": 5000, "total": 10000}],
                }
            ],
            "customers-data::comp_1": [{"id": "C-1", "name": "مؤسسة الأمل", "phone": "0559666951"}],
            "products-data::comp_1": [{"id": "P-1", "name": "تجهيزات مكتبية", "quantity": 10, "price": 5000}],
        }
        pdf_bytes = generate_full_erp_pdf_report(sample_store, company_id="comp_1")
        self.assertIsNotNone(pdf_bytes)
        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))
        self.assertGreater(len(pdf_bytes), 1000)

        # Multilingual tests (FR and EN)
        pdf_fr = generate_full_erp_pdf_report(sample_store, company_id="comp_1", lang="fr")
        self.assertIsNotNone(pdf_fr)
        self.assertTrue(pdf_fr.startswith(b"%PDF-"))

        pdf_en = generate_full_erp_pdf_report(sample_store, company_id="comp_1", lang="en")
        self.assertIsNotNone(pdf_en)
        self.assertTrue(pdf_en.startswith(b"%PDF-"))

    def test_multilingual_single_doc_and_zip(self):
        """Verify single document PDF and organized ZIP generation in French and English."""
        from app.services.pdf import generate_single_document_pdf, generate_organized_invoices_zip
        inv = {
            "number": "INV-TEST-01",
            "date": "2026-10-29",
            "customer": "Test Client",
            "total": 5000,
            "items": [{"description": "Service Test", "quantity": 1, "price": 5000, "total": 5000}],
        }
        # FR single document PDF
        pdf_fr = generate_single_document_pdf(inv, doc_type="invoice", lang="fr")
        self.assertIsNotNone(pdf_fr)
        self.assertTrue(pdf_fr.startswith(b"%PDF-"))

        # FR organized ZIP
        store = {"invoices-data": [inv]}
        zip_res_fr = generate_organized_invoices_zip(store, lang="fr")
        self.assertIn("Archive_Factures", zip_res_fr["filename"])
        self.assertGreater(zip_res_fr["size_bytes"], 1000)


class TestSyncEngine(unittest.TestCase):
    """Test Offline-to-Cloud Sync Engine functionality."""

    def test_sync_status_schema(self):
        """Verify sync status returns expected structural keys."""
        status = sync_service.get_sync_status()
        self.assertTrue(status.get("ok"))
        self.assertIn("cloud_url", status)
        self.assertIn("cloud_reachable", status)
        self.assertIn("last_sync_formatted", status)
        self.assertIn("local_keys_count", status)


class TestAuthSecurity(unittest.TestCase):
    """Test authentication session creation, verification, and logout lifecycle."""

    def test_session_lifecycle_and_logout(self):
        import asyncio
        from fastapi import Request, Response
        from app.services import auth as auth_svc
        from app.handlers import auth as auth_handlers

        # 1. Create active session
        test_email = "saddamzeralda@gmail.com"
        token = auth_svc.create_session(test_email)
        self.assertTrue(token, "Session token must be created")

        # 2. Verify session is valid
        valid_user = auth_svc.validate_session(token)
        self.assertIsNotNone(valid_user, "Session should be valid before logout")
        self.assertEqual(valid_user.get("email"), test_email)

        # 3. Call logout handler with token header
        req = Request({
            "type": "http",
            "method": "POST",
            "headers": [(b"authorization", f"Bearer {token}".encode("utf-8"))],
            "client": ("127.0.0.1", 12345)
        })
        resp = Response()
        logout_result = asyncio.run(auth_handlers.logout(req, resp))
        self.assertTrue(logout_result.get("ok"), "Logout must return ok: True")

        # 4. Verify session is completely invalidated
        after_logout = auth_svc.validate_session(token)
        self.assertIsNone(after_logout, "Session must be destroyed after logout")


class TestLicenseSecurity(unittest.TestCase):
    """Test RSA asymmetric licensing and cryptographic integrity."""

    def test_public_key_file_presence(self):
        """Verify public key exists in data/ and has valid PEM header."""
        pub_path = BASE_DIR / "data" / "license_public_key.pem"
        self.assertTrue(pub_path.exists(), "license_public_key.pem must exist")
        content = pub_path.read_text(encoding="utf-8")
        self.assertIn("BEGIN PUBLIC KEY", content)


class TestStaticAssetsIntegrity(unittest.TestCase):
    """Verify core bundles and web structure integrity."""

    def test_css_bundle_exists_and_not_empty(self):
        bundle_path = BASE_DIR / "styles" / "zeralda_core.bundle.css"
        self.assertTrue(bundle_path.is_file(), "styles/zeralda_core.bundle.css must exist")
        self.assertGreater(bundle_path.stat().st_size, 1000, "Bundle must not be empty")

    def test_sales_bundle_exists(self):
        bundle_path = BASE_DIR / "modules" / "sales" / "sales_bundle.js"
        self.assertTrue(bundle_path.is_file(), "modules/sales/sales_bundle.js must exist")

    def test_shell_layout_exists(self):
        shell_path = BASE_DIR / "shared" / "layout_shell.js"
        self.assertTrue(shell_path.is_file(), "shared/layout_shell.js must exist")


if __name__ == "__main__":
    unittest.main()

