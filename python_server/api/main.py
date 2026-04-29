from __future__ import annotations

import json
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError


from .anthropic import SYSTEM_PROMPT, create_assistant, create_thread, stream_message
from .council import run_council
from .simulation import router as simulation_router


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    print("Starting lifespan")

    try:
        print("Database connection check succeeded")
    except Exception as exc:
        print(f"WARNING: Database unavailable ({exc.__class__.__name__}). "
              "Transit data queries will be skipped during council deliberation.")

    yield
    print("Ending lifespan")


app = FastAPI(title="Transit Planner – Python Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter()


@api_router.get("/health")
def health() -> dict:
    return {"status": "ok", "database": "true"}


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    assistant_id: str | None = None
    thread_id: str | None = None
    # Optional map context sent from the frontend
    context: dict | None = None


class SessionResponse(BaseModel):
    assistant_id: str
    thread_id: str


@api_router.post("/chat/session")
async def chat_session() -> SessionResponse:
    """Create a new assistant + thread. Call once per browser session."""
    assistant_id = await create_assistant("Transit Planner", SYSTEM_PROMPT)
    thread_id = await create_thread(assistant_id)
    return SessionResponse(assistant_id=assistant_id, thread_id=thread_id)


@api_router.post("/chat")
async def chat(body: ChatRequest):
    """Stream an AI response as Server-Sent Events."""
    assistant_id = body.assistant_id
    thread_id = body.thread_id

    # Auto-create session if not provided (first message)
    if not assistant_id:
        assistant_id = await create_assistant("Transit Planner", SYSTEM_PROMPT)
    if not thread_id:
        thread_id = await create_thread(assistant_id)

    # Inject map context into the user message if present
    message = body.message
    if body.context:
        ctx_lines = []
        if body.context.get("neighbourhoods"):
            ctx_lines.append("Selected neighbourhoods: " + ", ".join(body.context["neighbourhoods"]))
        if body.context.get("existingLines"):
            ctx_lines.append("Existing lines: " + ", ".join(body.context["existingLines"]))
        if ctx_lines:
            message = "[Context]\n" + "\n".join(ctx_lines) + "\n\n" + message

    async def generate():
        # First chunk: session IDs so the client can persist them
        yield "data: " + json.dumps({
            "type": "session",
            "assistant_id": assistant_id,
            "thread_id": thread_id,
        }) + "\n\n"

        async for chunk in stream_message(thread_id, message):
            yield "data: " + json.dumps({"type": "text", "text": chunk}) + "\n\n"

        yield "data: " + json.dumps({"type": "done"}) + "\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Council ───────────────────────────────────────────────────────────────────

class ExistingStop(BaseModel):
    name: str
    coords: list[float]   # [lon, lat]
    route: str

class CouncilRequest(BaseModel):
    neighbourhoods: list[str] = []
    stations: list[str] = []
    line_type: str | None = None      # "subway" | "streetcar" | "bus"
    context: str | None = None        # free-text extra requirements
    existing_lines: list[ExistingStop] = []


@api_router.post("/council")
async def council(body: CouncilRequest):
    """Run the AI transit council. Streams SSE events for each agent turn."""

    async def generate():
        async for chunk in run_council(
            neighbourhoods=body.neighbourhoods,
            stations=body.stations,
            line_type=body.line_type,
            extra_context=body.context,
            existing_lines=[s.model_dump() for s in body.existing_lines],
        ):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


app.include_router(api_router, prefix="/api")
app.include_router(simulation_router)


@app.get("/")
def root() -> dict:
    return {"message": "Transit Planner Python Server"}
