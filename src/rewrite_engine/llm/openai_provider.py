from __future__ import annotations

from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from rewrite_engine.llm.provider import LLMProvider, Message
from rewrite_engine.models.config import ModelConfig


class OpenAIProvider:
    """LLM provider for OpenAI-compatible APIs (OpenAI, Anthropic via OpenAI SDK, etc.)."""

    def __init__(self, config: ModelConfig) -> None:
        self._client = AsyncOpenAI(
            base_url=config.api_base, api_key=config.resolve_api_key()
        )
        self._model = config.model

    async def chat(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        **kwargs: Any,
    ) -> str:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=messages,  # type: ignore[arg-type]
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )
        return response.choices[0].message.content or ""

    async def chat_stream(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=self._model,
            messages=messages,  # type: ignore[arg-type]
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
            **kwargs,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content
