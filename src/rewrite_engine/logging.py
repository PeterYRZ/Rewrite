"""Centralized logging for the rewrite engine."""

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_DIR = Path("logs")
LOG_FILE = LOG_DIR / "rewrite-engine.log"

_fmt = logging.Formatter(
    "%(asctime)s | %(levelname)-5s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def setup_logging(*, debug: bool = False) -> None:
    LOG_DIR.mkdir(exist_ok=True)

    root = logging.getLogger("rewrite_engine")
    root.setLevel(logging.DEBUG)

    # File handler
    fh = RotatingFileHandler(
        str(LOG_FILE), maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    fh.setFormatter(_fmt)
    fh.setLevel(logging.DEBUG if debug else logging.INFO)
    root.addHandler(fh)

    # Console handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(_fmt)
    ch.setLevel(logging.WARNING)
    root.addHandler(ch)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"rewrite_engine.{name}")
