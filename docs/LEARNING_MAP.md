# Kennek AI V2 — Bản đồ học (LLM / Agent / RAG / …)

Mở lại file này khi quên “khái niệm nào nằm ở chỗ code nào”.

> **Cập nhật:** Auto Tavily luôn bật. LangGraph ReAct **không còn** trong code chạy; thay bằng pipeline cố định trong `_stream_research_answer`.

---

## Luồng tổng

```
Chat.tsx (SSE)
  → POST /api/chat/stream (chat.py)
    → stream_agent_response (agent_service.py)
         ├─ model_router.select_groq_model   (chọn model / modality)
         ├─ Tavily (_run_tavily_search)      (web)
         ├─ query_vector_store               (RAG retrieve)
         ├─ ChatGroq.astream                 (LLM generate)
         ├─ _stream_vision_answer            (ảnh)
         └─ transcribe_audio (Whisper)       (audio → text)
```

Upload tài liệu (RAG ingest):

```
Chat.tsx → POST /api/documents/upload (documents.py)
  → ingest_files / _upsert_documents (vector_service.py)
    → Chroma ./chroma_db
```

---

## 1. LLM (Large Language Model)

Gọi model chat qua Groq để sinh câu trả lời.

| File | Hàm / chỗ | Vai trò |
|------|-----------|---------|
| `backend/app/core/groq_models.py` | `GROQ_MODEL_IDS` | Catalog model IDs |
| `backend/app/services/agent_service.py` | `_build_chat_model` | Wrapper `ChatGroq` |
| `backend/app/services/agent_service.py` | `_stream_research_answer` → `.astream(...)` | Prompt + stream token |
| `backend/app/agent/system_prompt.py` | `DOCUMENT_PROCESSOR_SYSTEM_PROMPT` | Hướng dẫn hành vi LLM |
| `frontend` → `ChatRequest.temperature` | `chat.py` | Độ sáng tạo |

**Models đang dùng**

- Text: `llama-3.3-70b-versatile`
- Reasoning: `deepseek-r1-distill-llama-70b`
- Vision: `qwen/qwen3.6-27b`
- Speech: `whisper-large-v3-turbo`
- Moderation: `openai/gpt-oss-safeguard-20b`
- Fast mode: `llama-3.1-8b-instant`

---

## 2. LangChain

Thư viện glue: message types, tool Tavily, ChatGroq streaming.

| File | Chỗ | Vai trò |
|------|-----|---------|
| `agent_service.py` | imports `HumanMessage`, `AIMessage`, `SystemMessage` | Message schema LangChain |
| `agent_service.py` | `_history_to_lc_messages` | Chat history → LC messages |
| `agent_service.py` | `_build_chat_model` + `ChatGroq` | LLM adapter |
| `agent_service.py` | `_run_tavily_search` + `TavilySearchResults` | Tool web (LangChain community) |

---

## 3. LangGraph

**Hiện tại: không có trong code chạy.**

Trước đây dùng `create_react_agent` (ReAct: nghĩ → gọi tool → trả lời).  
Giờ thay bằng pipeline: Tavily → RAG → synthesize.

**Muốn học lại:** viết graph mới trong `agent_service.py`, thay `_stream_research_answer` bằng các node kiểu `search` → `retrieve` → `generate`.

---

## 4. AI Agent

Orchestrator + routing + tools + synthesis (không chỉ 1 lời gọi LLM).

| Bước | File / hàm |
|------|------------|
| HTTP vào agent | `backend/app/api/endpoints/chat.py` → `stream_agent_response` |
| Chọn model / modality | `model_router.select_groq_model` |
| Tool web | `_run_tavily_search` |
| Tool KB (RAG) | `query_vector_store` |
| Ghép context → trả lời | `_stream_research_answer` |
| System prompt theo mode | `stream_agent_response` + `command_system_prompts` |

---

## 5. RAG + Vector (Chroma)

**RAG = Retrieval-Augmented Generation:** lấy chunk liên quan → nhét prompt → LLM trả lời.

### Ingest (Indexing)

| File | Hàm | Vai trò |
|------|-----|---------|
| `api/endpoints/documents.py` | `upload_documents` | API upload |
| `vector_service.py` | `_load_pdf` / `_load_docx` / … | Extract text |
| `vector_service.py` | `_chunk_text` | Chunk + overlap (1800 / 200) |
| `vector_service.py` | `_upsert_documents` | Ghi vào Chroma |
| `vector_service.py` | `_get_collection` | `PersistentClient(./chroma_db)` |

### Retrieve

| File | Hàm | Vai trò |
|------|-----|---------|
| `vector_service.py` | `query_vector_store` | `collection.query(query_texts=...)` |

### Augment + Generate

| File | Hàm | Vai trò |
|------|-----|---------|
| `agent_service.py` | `_stream_research_answer` | Ghép KB (+ web) vào `HumanMessage` rồi `astream` |

**Lưu ý:** Embedding do Chroma xử lý mặc định khi `upsert`/`query` bằng text — app chưa tự viết embedding model.

Frontend: `frontend/app/components/Chat.tsx` → `UPLOAD_ENDPOINT`.

---

## 6. Vision (multimodal)

| File | Hàm | Vai trò |
|------|-----|---------|
| `model_router.py` | `build_vision_messages` | Payload text + `image_url` |
| `agent_service.py` | `_stream_vision_answer` | Stream phân tích ảnh |
| `groq_models.py` | `GroqTask.VISION` | Model Qwen |

---

## 7. NLP (xử lý ngôn ngữ)

Không dùng spaCy/NLTK. NLP “thực tế” trong app:

| Kỹ thuật | Chỗ code |
|----------|----------|
| Extract text PDF/DOCX/Excel | `vector_service.py` loaders |
| Chunking + overlap | `_chunk_text` |
| Lọc text có nghĩa | `_is_meaningful_text` |
| Speech → text (ASR) | `groq_client.transcribe_audio` (Whisper) |
| Content moderation | `groq_client.moderate_content` |
| Prompt engineering | `system_prompt.py` |

---

## 8. Machine / Deep Learning

**Dùng model DL qua API Groq — không train trong repo.**

| Task | Model | File |
|------|-------|------|
| Text LLM | Llama 3.3 70B | `groq_models.py` |
| Reasoning | DeepSeek R1 distill | `groq_models.py` |
| Vision | Qwen | `groq_models.py` + `build_vision_messages` |
| Speech | Whisper | `groq_client.transcribe_audio` |
| Safety | safeguard | `moderate_content` |
| Embeddings (ẩn) | Chroma default | `vector_service` upsert/query |

Không có PyTorch training loop. Học trong project = hiểu **inference pipeline** + **embedding + similarity search**.

---

## 9. Frontend ↔ Agent

| File | Chỗ | Vai trò |
|------|-----|---------|
| `frontend/app/components/Chat.tsx` | `CHAT_ENDPOINT`, `fetchEventSource` | SSE stream token |
| `frontend/app/components/Chat.tsx` | `UPLOAD_ENDPOINT` | Upload → RAG ingest |
| `backend/app/api/endpoints/chat.py` | `ChatRequest` | Contract: message, attachments, mode |

---

## Thứ tự đọc khi học

1. **LLM basics** → `groq_models.py` → `_build_chat_model` → `astream`
2. **LangChain messages** → `_history_to_lc_messages` + `system_prompt.py`
3. **Vector + RAG** → `documents.py` → `vector_service` (chunk/upsert/query) → `_stream_research_answer`
4. **Agent** → `stream_agent_response` + `model_router`
5. **Vision / Speech** → `build_vision_messages`, `transcribe_audio`
6. **LangGraph (nâng cao)** → viết lại ReAct graph thay pipeline hiện tại

---

## File quan trọng (bookmark)

```
backend/app/services/agent_service.py     # Agent + LLM stream + Tavily + RAG synthesize
backend/app/services/vector_service.py    # Chunk / Chroma / RAG retrieve
backend/app/services/model_router.py      # Chọn model + vision messages
backend/app/services/groq_client.py       # Whisper + moderation (API thô)
backend/app/core/groq_models.py           # Model IDs
backend/app/agent/system_prompt.py        # System prompt
backend/app/api/endpoints/chat.py         # SSE API
backend/app/api/endpoints/documents.py    # Upload API
frontend/app/components/Chat.tsx          # UI chat + upload + SSE
```
