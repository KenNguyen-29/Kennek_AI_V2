import asyncio
import logging

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.services.chat_history_service import purge_all_expired_sessions

logger = logging.getLogger(__name__)


async def run_chat_purge_loop(stop_event: asyncio.Event) -> None:
    settings = get_settings()
    interval = max(60, settings.chat_purge_interval_seconds)

    while not stop_event.is_set():
        try:
            async with SessionLocal() as db:
                deleted = await purge_all_expired_sessions(db)
            if deleted:
                logger.info("Purged %s expired chat session(s)", deleted)
        except Exception:
            logger.exception("Scheduled chat purge failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except TimeoutError:
            continue
