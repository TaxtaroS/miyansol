import unittest
import asyncio
import base64
from io import BytesIO
from unittest.mock import patch

import app as worker
from fastapi import HTTPException, UploadFile
from PIL import Image
from pypdf import PdfWriter

from app import app, health


class DocumentWorkerSmokeTest(unittest.TestCase):
    def test_health_endpoint_works(self):
        payload = health()
        self.assertTrue(payload["ok"])
        self.assertIn("engine", payload)
        self.assertIsNotNone(app)

    def test_image_retains_pixels_for_node_ocr(self):
        if worker.fitz is None:
            self.skipTest("PyMuPDF native module unavailable")
        source = BytesIO()
        Image.new("RGB", (120, 80), "white").save(source, format="PNG")
        result = asyncio.run(worker.extract_pdf(UploadFile(filename="order.png", file=BytesIO(source.getvalue()))))
        rendered = Image.open(BytesIO(base64.b64decode(result["pages"][0]["image_base64"])))
        self.assertEqual(rendered.size, (120, 80))

    def test_pdf_fallback_without_native_module(self):
        source = BytesIO()
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        writer.write(source)
        with patch.object(worker, "fitz", None):
            result = asyncio.run(worker.extract_pdf(UploadFile(filename="order.pdf", file=BytesIO(source.getvalue()))))
            self.assertEqual(len(result["pages"]), 1)
            self.assertEqual(result["engine"], "papemate-pypdf-fallback")
            self.assertEqual(health()["engine"], "pypdf-fallback")
            with self.assertRaises(HTTPException) as error:
                worker.order_preview(worker.OrderPreviewRequest(vendor="test", filename="test.pdf", items=[]))
            self.assertEqual(error.exception.status_code, 503)

    def test_empty_upload_is_rejected(self):
        with self.assertRaises(HTTPException) as error:
            asyncio.run(worker.extract_pdf(UploadFile(filename="empty.pdf", file=BytesIO())))
        self.assertEqual(error.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
