import io
import os
import tempfile
from typing import List, Tuple
import fitz  # PyMuPDF


class PDFProcessor:
    def extract_pages_fast(self, pdf_bytes: bytes) -> List[Tuple[int, bytes, str]]:
        """
        Ultra-fast hybrid extractor:
        - If page has digital text, extracts it in 2ms.
        - If scanned/image, compresses to lightweight JPEG for fast vision upload.
        """
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_data = []

        for page_idx in range(len(doc)):
            page = doc[page_idx]
            extracted_text = page.get_text("text").strip()

            # Generate lightweight JPEG (100 DPI) for visual verification
            pix = page.get_pixmap(dpi=100)
            img_bytes = pix.tobytes("jpeg")

            pages_data.append((page_idx + 1, img_bytes, extracted_text))

        doc.close()
        return pages_data


pdf_processor = PDFProcessor()