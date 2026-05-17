from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel


class ModelConfig(BaseModel):
    name: str
    provider: str  # "openai" | "ollama"
    model: str
    api_base: str = "https://api.openai.com/v1"
    api_key: str = "OPENAI_API_KEY"

    def resolve_api_key(self) -> str:
        """Resolve the API key. If starts with '$', treat as env var name; else use directly."""
        if self.api_key.startswith("$"):
            env_var = self.api_key[1:]
            return os.environ.get(env_var, "")
        return self.api_key


class RewriteConfig(BaseModel):
    candidates_count: int = 3
    temperature: float = 0.7
    max_tokens: int = 2000


class ValidationConfig(BaseModel):
    enabled: bool = True
    strictness: str = "medium"  # low | medium | high


class AppConfig(BaseModel):
    models: list[ModelConfig]
    rewrite: RewriteConfig = RewriteConfig()
    validation: ValidationConfig = ValidationConfig()

    def get_model(self, name: str) -> ModelConfig:
        for m in self.models:
            if m.name == name:
                return m
        raise KeyError(f"Model '{name}' not found in config")

    @property
    def default_model(self) -> ModelConfig:
        return self.models[0]


def load_config(path: str | Path = "config.yaml") -> AppConfig:
    raw: dict[str, Any] = yaml.safe_load(Path(path).read_text())
    return AppConfig(**raw)
