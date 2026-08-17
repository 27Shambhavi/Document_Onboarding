from pathlib import Path

import pymupdf
from PIL import Image
from io import BytesIO


class PDFProcessor:

    def pdf_to_images(
        self,
        pdf_path: str,
        output_directory: str = "data/processed",
    ) -> list[str]:

        Path(output_directory).mkdir(
            parents=True,
            exist_ok=True,
        )

        pdf = pymupdf.open(pdf_path)

        image_paths = []

        for page_number, page in enumerate(
            pdf,
            start=1,
        ):

            # Render PDF page
            matrix = pymupdf.Matrix(
                1.5,
                1.5,
            )

            pixmap = page.get_pixmap(
                matrix=matrix,
                alpha=False,
            )

            image = Image.frombytes(
                "RGB",
                [
                    pixmap.width,
                    pixmap.height,
                ],
                pixmap.samples,
            )

            output_path = (
                Path(output_directory)
                / f"page_{page_number}.jpg"
            )

            image.save(
                output_path,
                "JPEG",
                quality=85,
                optimize=True,
            )

            image_paths.append(
                str(output_path)
            )

        pdf.close()

        return image_paths


    def image_to_bytes(
        self,
        image_path: str,
    ) -> bytes:

        with open(
            image_path,
            "rb",
        ) as file:

            return file.read()


pdf_processor = PDFProcessor()