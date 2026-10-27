"""
One door to the AI providers, so features never care which one is configured.

  GROQ_API_KEY       → Groq (fast; default when set)
  ANTHROPIC_API_KEY  → Claude
  neither            → enabled() is False; features fall back to non-AI behaviour

AI_PROVIDER=groq|anthropic picks one explicitly when both keys are set.
Every call asks for JSON matching a schema and returns the parsed dict, or
raises LLMError with a message that is safe to show a Captain or traveler.
"""
import json
import logging
from dataclasses import dataclass

from django.conf import settings

logger = logging.getLogger("goloc.ai")

GROQ_MODEL = "openai/gpt-oss-120b"
CLAUDE_MODEL = "claude-opus-5-5"


class LLMError(Exception):
    pass


@dataclass
class Result:
    data: dict
    model: str


def provider() -> str | None:
    choice = (settings.AI_PROVIDER or "").lower()
    if choice == "groq" and settings.GROQ_API_KEY:
        return "groq"
    if choice == "anthropic" and settings.ANTHROPIC_API_KEY:
        return "anthropic"
    if settings.GROQ_API_KEY:
        return "groq"
    if settings.ANTHROPIC_API_KEY:
        return "anthropic"
    return None


def enabled() -> bool:
    return provider() is not None


def complete_json(system: str, user: str, schema: dict, *, name: str, effort: str = "medium", max_tokens: int = 16000) -> Result:
    which = provider()
    if which == "groq":
        return _groq(system, user, schema, name, effort, max_tokens)
    if which == "anthropic":
        return _claude(system, user, schema, effort, max_tokens)
    raise LLMError("AI isn't set up on this server yet.")


def _parse(text: str) -> dict:
    try:
        data = json.loads(text)
    except (TypeError, json.JSONDecodeError) as exc:
        raise LLMError("The AI's answer was incomplete. Try again.") from exc
    if not isinstance(data, dict):
        raise LLMError("The AI's answer was incomplete. Try again.")
    return data


def _error_code(exc) -> str:
    body = exc.body if isinstance(getattr(exc, "body", None), dict) else {}
    error = body.get("error", body)
    return error.get("code", "") if isinstance(error, dict) else ""


def _groq(system, user, schema, name, effort, max_tokens) -> Result:
    import groq

    client = groq.Groq(api_key=settings.GROQ_API_KEY, timeout=180, max_retries=2)
    # Groq validates the JSON after generating it (it doesn't constrain decoding), so the model
    # needs to see the exact shape, and a near-miss on a big schema is worth another attempt.
    system = f"{system}\n\nRespond with one JSON object matching this JSON Schema exactly, every listed field present:\n{json.dumps(schema)}"
    try:
        for attempt in range(3):
            try:
                response = client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                    response_format={"type": "json_schema", "json_schema": {"name": name, "strict": True, "schema": schema}},
                    reasoning_effort=effort,
                    max_completion_tokens=max_tokens,
                )
                break
            except groq.BadRequestError as exc:
                if _error_code(exc) != "json_validate_failed" or attempt == 2:
                    raise
                logger.info("Groq JSON didn't match the schema (attempt %s); retrying", attempt + 1)
    except groq.RateLimitError as exc:
        raise LLMError("The AI is busy right now. Try again in a minute.") from exc
    except groq.AuthenticationError as exc:
        logger.error("Groq rejected the API key")
        raise LLMError("AI isn't available right now. Contact GoLoc support.") from exc
    except groq.APIStatusError as exc:
        logger.warning("Groq call failed: %s %s", exc.status_code, exc.message)
        raise LLMError("The AI couldn't do that. Try again.") from exc
    except groq.APIConnectionError as exc:
        raise LLMError("Couldn't reach the AI service. Try again.") from exc
    choice = response.choices[0]
    if choice.finish_reason == "length":
        raise LLMError("That was too long for the AI to finish. Try something shorter.")
    return Result(_parse(choice.message.content), response.model)


def _claude(system, user, schema, effort, max_tokens) -> Result:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=600)
    try:
        # Streaming keeps long generations (multi-day itineraries) inside HTTP timeouts.
        with client.beta.messages.stream(
            model=CLAUDE_MODEL,
            max_tokens=max(max_tokens, 16000),
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            # If a safety classifier declines, the API retries on its recommended fallback model.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            message = stream.get_final_message()
    except anthropic.RateLimitError as exc:
        raise LLMError("The AI is busy right now. Try again in a minute.") from exc
    except anthropic.APIStatusError as exc:
        logger.warning("Claude call failed: %s %s", exc.status_code, exc.message)
        raise LLMError("The AI couldn't do that. Try again.") from exc
    except anthropic.APIConnectionError as exc:
        raise LLMError("Couldn't reach the AI service. Try again.") from exc
    if message.stop_reason == "refusal":
        raise LLMError("The AI declined this request. Rephrase it and try again.")
    if message.stop_reason == "max_tokens":
        raise LLMError("That was too long for the AI to finish. Try something shorter.")
    return Result(_parse(next((b.text for b in message.content if b.type == "text"), "")), message.model)
