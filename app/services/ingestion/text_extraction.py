from pathlib import Path

from pypdf import PdfReader
from docx import Document


class TextExtractor:

    def extract(self, file_path: str) -> str:

        extension = Path(
            file_path
        ).suffix.lower()

        if extension == ".pdf":
            return self._extract_pdf(
                file_path
            )

        if extension == ".docx":
            return self._extract_docx(
                file_path
            )

        return ""


    def _extract_pdf(
        self,
        file_path: str
    ) -> str:

        reader = PdfReader(file_path)

        text = []

        for page in reader.pages:

            page_text = page.extract_text()

            if page_text:
                text.append(page_text)

        return "\n".join(text)


    def _extract_docx(
        self,
        file_path: str
    ) -> str:

        document = Document(file_path)

        paragraphs = []

        for paragraph in document.paragraphs:

            if paragraph.text.strip():
                paragraphs.append(
                    paragraph.text
                )

        return "\n".join(paragraphs)


text_extractor = TextExtractor()