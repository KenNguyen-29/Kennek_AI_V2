import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.endpoints.chat import router as chat_router
from app.api.endpoints.documents import router as documents_router
from app.api.endpoints.users import router as users_router
from app.core.config import get_settings
from app.core.database import engine
from app.services.chat_purge_scheduler import run_chat_purge_loop

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    stop_event = asyncio.Event()
    purge_task = asyncio.create_task(run_chat_purge_loop(stop_event))
    logger.info("Chat retention purge loop started")
    try:
        yield
    finally:
        stop_event.set()
        purge_task.cancel()
        try:
            await purge_task
        except asyncio.CancelledError:
            pass
        await engine.dispose()


app = FastAPI(title="Kennek AI API", lifespan=lifespan)

_cors_origins = [
    origin.strip()
    for origin in get_settings().cors_origins.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(chat_router)
app.include_router(documents_router)
app.include_router(users_router)
