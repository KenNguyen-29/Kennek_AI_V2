import re
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.services.vector_service import SUPPORTED_EXTENSIONS, ingest_files

router = APIRouter()

UPLOAD_DIR = Path("./uploads")
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


class UploadDocumentsResponse(BaseModel):
    files: list[str]
    chunk_count: int
    message: str


def _safe_filename(filename: str) -> str:
    cleaned = Path(filename).name
    cleaned = re.sub(r"[^\w.\- ]+", "_", cleaned).strip()
    return cleaned or "upload.bin"


@router.post("/api/documents/upload", response_model=UploadDocumentsResponse)
async def upload_documents(
    files: list[UploadFile] = File(...),
) -> UploadDocumentsResponse:
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files were uploaded",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    saved_paths: list[str] = []
    saved_names: list[str] = []

    try:
        for upload in files:
            original_name = upload.filename or "upload.bin"
            extension = Path(original_name).suffix.lower()
            if extension not in SUPPORTED_EXTENSIONS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Unsupported file type: {original_name}. "
                        f"Allowed: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
                    ),
                )

            content = await upload.read()
            if not content:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Empty file: {original_name}",
                )
            if len(content) > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File too large (max 20MB): {original_name}",
                )

            destination = UPLOAD_DIR / f"{uuid.uuid4().hex}_{_safe_filename(original_name)}"
            destination.write_bytes(content)
            saved_paths.append(str(destination))
            saved_names.append(original_name)

        result = ingest_files(saved_paths)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest documents: {exc}",
        ) from exc

    return UploadDocumentsResponse(
        files=saved_names,
        chunk_count=int(result["chunk_count"]),
        message=(
            f"Đã nạp {len(saved_names)} file "
            f"({result['chunk_count']} đoạn) vào kho tri thức."
        ),
    )
