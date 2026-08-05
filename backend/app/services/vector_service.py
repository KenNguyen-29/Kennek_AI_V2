import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Any

import chromadb
from llama_index.core import SimpleDirectoryReader

CHROMA_PATH = Path("./chroma_db")
COLLECTION_NAME = "user_knowledge"


@lru_cache(maxsize=1)
def _get_collection() -> Any:
    client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    return client.get_or_create_collection(name=COLLECTION_NAME)


def ingest_documents(folder_path: str) -> int:
    source_folder = Path(folder_path)
    if not source_folder.is_dir():
        raise ValueError(f"Document folder does not exist: {folder_path}")

    documents = SimpleDirectoryReader(
        input_dir=str(source_folder),
        recursive=True,
        required_exts=[".pdf", ".txt"],
    ).load_data()

    ids: list[str] = []
    texts: list[str] = []

    for document in documents:
        text = document.get_content().strip()
        if not text:
            continue

        source = str(document.metadata.get("file_path", ""))
        document_id = hashlib.sha256(
            f"{source}\0{text}".encode("utf-8"),
        ).hexdigest()
        ids.append(document_id)
        texts.append(text)

    if texts:
        _get_collection().upsert(ids=ids, documents=texts)

    return len(texts)


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
        include=["documents"],
    )
    document_groups = results.get("documents") or []
    return [document for document in document_groups[0] if document]
