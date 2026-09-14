from pathlib import Path
from typing import List, Tuple
from fastapi import UploadFile
import shutil
import uuid
import zipfile


ALLOWED_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".tiff",
    ".docx",
}

ZIP_EXTENSION = ".zip"


def _safe_extract_zip(
    zip_path: Path,
    extract_directory: Path,
) -> List[Path]:
    """
    Securely extract supported files from a ZIP archive.

    Protects against Zip Slip/path traversal attacks and only
    extracts supported document/image formats.
    """

    extract_directory.mkdir(
        parents=True,
        exist_ok=True,
    )

    extracted_files: List[Path] = []

    with zipfile.ZipFile(zip_path, "r") as zip_ref:

        for member in zip_ref.infolist():

            # Ignore directories
            if member.is_dir():
                continue

            original_name = member.filename

            # Normalize ZIP path
            member_path = Path(original_name)

            # Ignore hidden/system files
            if any(part.startswith("__MACOSX") for part in member_path.parts):
                continue

            # Prevent absolute paths
            if member_path.is_absolute():
                continue

            # Prevent path traversal
            if ".." in member_path.parts:
                continue

            extension = member_path.suffix.lower()

            # Only extract supported files
            if extension not in ALLOWED_EXTENSIONS:
                continue

            # Use only the filename to avoid nested path traversal
            safe_filename = member_path.name

            if not safe_filename:
                continue

            # Give each extracted file a unique name
            unique_name = f"{uuid.uuid4().hex[:8]}_{safe_filename}"

            destination = extract_directory / unique_name

            with zip_ref.open(member) as source:
                with open(destination, "wb") as target:
                    shutil.copyfileobj(source, target)

            extracted_files.append(destination)

    return extracted_files


async def save_document(
    file: UploadFile,
    upload_directory: str = "data/uploads",
) -> str:

    filename = file.filename or ""

    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS and extension != ZIP_EXTENSION:
        raise ValueError(
            f"Unsupported file type: {extension}"
        )

    upload_path = Path(upload_directory)

    upload_path.mkdir(
        parents=True,
        exist_ok=True,
    )

    # Generate unique filename to prevent collisions
    safe_filename = Path(filename).name

    unique_prefix = uuid.uuid4().hex[:8]

    file_path = upload_path / f"{unique_prefix}_{safe_filename}"

    content = await file.read()

    with open(file_path, "wb") as buffer:
        buffer.write(content)

    return str(file_path)


async def save_and_extract_document(
    file: UploadFile,
    upload_directory: str = "data/uploads",
) -> Tuple[str, List[str], bool]:
    """
    Save uploaded file.

    Returns:
        (
            original_saved_path,
            files_to_process,
            is_zip
        )

    For PDF:
        files_to_process = [saved_pdf]

    For ZIP:
        files_to_process = [extracted_pdf1, extracted_pdf2, ...]

    Other supported formats are saved but are not automatically
    sent through the PDF processor.
    """

    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    saved_path = await save_document(
        file=file,
        upload_directory=upload_directory,
    )

    # Normal PDF upload
    if extension == ".pdf":
        return (
            saved_path,
            [saved_path],
            False,
        )

    # ZIP upload
    if extension == ".zip":

        zip_path = Path(saved_path)

        extraction_directory = (
            Path(upload_directory)
            / f"extracted_{uuid.uuid4().hex[:12]}"
        )

        extracted_files = _safe_extract_zip(
            zip_path=zip_path,
            extract_directory=extraction_directory,
        )

        # Only PDF files are currently sent through
        # the existing PDF → image → Qwen pipeline.
        pdf_files = [
            str(path)
            for path in extracted_files
            if path.suffix.lower() == ".pdf"
        ]

        return (
            saved_path,
            pdf_files,
            True,
        )

    # Existing non-PDF behavior
    return (
        saved_path,
        [saved_path],
        False,
    )