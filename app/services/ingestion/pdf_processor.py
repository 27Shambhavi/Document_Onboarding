from pathlib import Path
from PIL import Image
import pymupdf


class PDFProcessor:
    def pdf_to_images(self, pdf_path: str, output_directory: str = "data/processed") -> list[str]:
        output_dir = Path(output_directory)
        output_dir.mkdir(parents=True, exist_ok=True)

        pdf = pymupdf.open(pdf_path)
        image_paths = []
        matrix = pymupdf.Matrix(1.25, 1.25)

        for page_number, page in enumerate(pdf, start=1):
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
            image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)

            output_path = output_dir / f"page_{page_number}.jpg"
            image.save(output_path, "JPEG", quality=75, optimize=True)
            image_paths.append(str(output_path))

        pdf.close()
        return image_paths

    def image_to_bytes(self, image_path: str) -> bytes:
        with open(image_path, "rb") as f:
            return f.read()


pdf_processor = PDFProcessor()