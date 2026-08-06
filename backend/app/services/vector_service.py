import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Any

import chromadb
import pandas as pd
from llama_index.core import Document, SimpleDirectoryReader

CHROMA_PATH = Path("./chroma_db")
COLLECTION_NAME = "user_knowledge"

SUPPORTED_EXTENSIONS = {
    ".txt",
    ".md",
    ".log",
    ".pdf",
    ".docx",
    ".doc",
    ".csv",
    ".xlsx",
    ".xls",
    ".json",
    ".xml",
    ".yaml",
    ".yml",
    ".py",
    ".js",
    ".html",
}

LLAMA_INDEX_EXTENSIONS = sorted(
    extension
    for extension in SUPPORTED_EXTENSIONS
    if extension not in {".xlsx", ".xls"}
)


@lru_cache(maxsize=1)
def _get_collection() -> Any:
    client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    return client.get_or_create_collection(name=COLLECTION_NAME)


def _chunk_text(text: str, *, chunk_size: int = 1800, overlap: int = 200) -> list[str]:
    cleaned = text.strip()
    if not cleaned:
        return []
    if len(cleaned) <= chunk_size:
        return [cleaned]

    chunks: list[str] = []
    start = 0
    while start < len(cleaned):
        end = min(start + chunk_size, len(cleaned))
        chunks.append(cleaned[start:end])
        if end == len(cleaned):
            break
        start = max(end - overlap, start + 1)
    return chunks


def _dataframe_to_text(df: pd.DataFrame, *, source: str, sheet_name: str) -> str:
    preview = df.fillna("").astype(str)
    markdown_table = preview.to_markdown(index=False)
    return (
        f"Spreadsheet: {Path(source).name}\n"
        f"Sheet: {sheet_name}\n"
        f"Rows: {len(preview)} | Columns: {list(preview.columns)}\n\n"
        f"{markdown_table}"
    )


def _load_spreadsheet_documents(file_path: Path) -> list[Document]:
    workbook = pd.read_excel(file_path, sheet_name=None, dtype=str)
    documents: list[Document] = []

    for sheet_name, frame in workbook.items():
        text = _dataframe_to_text(
            frame,
            source=str(file_path),
            sheet_name=str(sheet_name),
        )
        if not text.strip():
            continue
        documents.append(
            Document(
                text=text,
                metadata={
                    "file_path": str(file_path),
                    "file_name": file_path.name,
                    "sheet_name": str(sheet_name),
                    "file_type": file_path.suffix.lower(),
                },
            ),
        )
    return documents


def _load_documents_from_paths(file_paths: list[Path]) -> list[Document]:
    documents: list[Document] = []
    llama_paths: list[str] = []

    for file_path in file_paths:
        suffix = file_path.suffix.lower()
        if suffix not in SUPPORTED_EXTENSIONS:
            raise ValueError(f"Unsupported file type: {file_path.name}")
        if not file_path.is_file():
            raise ValueError(f"File does not exist: {file_path}")

        if suffix in {".xlsx", ".xls"}:
            documents.extend(_load_spreadsheet_documents(file_path))
        else:
            llama_paths.append(str(file_path))

    if llama_paths:
        documents.extend(
            SimpleDirectoryReader(
                input_files=llama_paths,
                required_exts=LLAMA_INDEX_EXTENSIONS,
            ).load_data(),
        )

    return documents


def _upsert_documents(documents: list[Document]) -> int:
    ids: list[str] = []
    texts: list[str] = []
    metadatas: list[dict[str, str]] = []

    for document in documents:
        source = str(document.metadata.get("file_path", ""))
        file_name = str(
            document.metadata.get("file_name")
            or Path(source).name
            or "unknown",
        )
        for chunk_index, chunk in enumerate(_chunk_text(document.get_content())):
            document_id = hashlib.sha256(
                f"{source}\0{chunk_index}\0{chunk}".encode("utf-8"),
            ).hexdigest()
            ids.append(document_id)
            texts.append(chunk)
            metadatas.append(
                {
                    "file_path": source,
                    "file_name": file_name,
                    "chunk_index": str(chunk_index),
                },
            )

    if texts:
        _get_collection().upsert(ids=ids, documents=texts, metadatas=metadatas)

    return len(texts)


def ingest_documents(folder_path: str) -> int:
    source_folder = Path(folder_path)
    if not source_folder.is_dir():
        raise ValueError(f"Document folder does not exist: {folder_path}")

    file_paths = [
        path
        for path in source_folder.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    return ingest_files([str(path) for path in file_paths])


def ingest_files(file_paths: list[str]) -> dict[str, Any]:
    paths = [Path(path) for path in file_paths]
    if not paths:
        return {"chunk_count": 0, "file_names": []}

    documents = _load_documents_from_paths(paths)
    chunk_count = _upsert_documents(documents)
    return {
        "chunk_count": chunk_count,
        "file_names": [path.name for path in paths],
    }


def query_vector_store(query_str: str) -> list[str]:
    query = query_str.strip()
    if not query:
        return []

    collection = _get_collection()
    result_count = min(3, collection.count())
    if result_count == 0:
        return []

    results = collection.query(
        query_texts=[query],
        n_results=result_count,
        include=["documents", "metadatas"],
    )
    document_groups = results.get("documents") or []
    metadata_groups = results.get("metadatas") or []
    documents = document_groups[0] if document_groups else []
    metadatas = metadata_groups[0] if metadata_groups else []

    contexts: list[str] = []
    for index, document in enumerate(documents):
        if not document:
            continue
        metadata = metadatas[index] if index < len(metadatas) else {}
        file_name = metadata.get("file_name", "unknown")
        contexts.append(f"[Source: {file_name}]\n{document}")
    return contexts
