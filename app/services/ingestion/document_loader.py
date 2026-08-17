from pathlib import Path
from fastapi import UploadFile


ALLOWED_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".tiff",
    ".docx",
}


async def save_document(
    file: UploadFile,
    upload_directory: str = "data/uploads",
) -> str:

    extension = Path(file.filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type: {extension}"
        )

    Path(upload_directory).mkdir(
        parents=True,
        exist_ok=True,
    )

    file_path = Path(upload_directory) / file.filename

    content = await file.read()

    with open(file_path, "wb") as buffer:
        buffer.write(content)

    return str(file_path)