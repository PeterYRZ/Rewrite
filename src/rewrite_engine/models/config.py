from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel


class ModelConfig(BaseModel):
    name: str
    provider: str  # "openai" | "ollama"
    model: str
    api_base: str = "https://api.openai.com/v1"
    api_key_env: str = "OPENAI_API_KEY"


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
