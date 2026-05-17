from __future__ import annotations

from typing import Any, AsyncIterator, Protocol, runtime_checkable

from rewrite_engine.models.config import ModelConfig

Message = dict[str, str]


@runtime_checkable
class LLMProvider(Protocol):
    """Protocol for LLM providers. All providers must implement these methods."""

    async def chat(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        **kwargs: Any,
    ) -> str:
        """Send a chat completion request and return the response text."""
        ...

    async def chat_stream(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        **kwargs: Any,
    ) -> AsyncIterator[str]:
        """Send a streaming chat completion request, yielding text chunks."""
        ...


async def create_provider(model_config: ModelConfig) -> LLMProvider:
    """Factory: create an LLM provider from configuration."""
    if model_config.provider == "openai":
        from rewrite_engine.llm.openai_provider import OpenAIProvider

        return OpenAIProvider(model_config)

    if model_config.provider == "ollama":
        from rewrite_engine.llm.ollama_provider import OllamaProvider

        return OllamaProvider(model_config)

    raise ValueError(f"Unknown provider type: {model_config.provider}")
