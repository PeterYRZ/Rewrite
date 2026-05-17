"""CLI entry point for the rewrite engine.

Phase 1: single-paragraph rewrite.
Usage:
    rewrite data/sample-article.txt --paragraph 2
    rewrite data/sample-article.txt --paragraph 0 --model gpt-4o
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from rewrite_engine.agents.generator import rewrite_single_paragraph
from rewrite_engine.llm.provider import create_provider
from rewrite_engine.models.article import Article
from rewrite_engine.models.config import AppConfig, load_config


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="全文部分段落改写引擎",
    )
    parser.add_argument(
        "article",
        type=str,
        help="文章文件路径，或直接输入文章文本（用引号包裹）",
    )
    parser.add_argument(
        "--paragraph", "-p",
        type=int,
        required=True,
        help="要改写的段落序号（0-based）",
    )
    parser.add_argument(
        "--model", "-m",
        type=str,
        default=None,
        help="使用的模型名称（对应 config.yaml 中的模型名称）",
    )
    parser.add_argument(
        "--config", "-c",
        type=str,
        default="config.yaml",
        help="配置文件路径",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.7,
        help="生成温度",
    )
    return parser.parse_args()


def load_article(path_or_text: str) -> tuple[str, Article]:
    """Load article from file or treat as raw text."""
    p = Path(path_or_text)
    if p.exists():
        text = p.read_text(encoding="utf-8")
    else:
        text = path_or_text
    article = Article.from_text(text)
    return text, article


async def main_async() -> None:
    args = parse_args()

    # Load config
    config_path = Path(args.config)
    if not config_path.exists():
        print(f"Error: Config file not found: {args.config}")
        sys.exit(1)
    config: AppConfig = load_config(config_path)

    # Select model
    model_name = args.model or config.default_model.name
    try:
        model_config = config.get_model(model_name)
    except KeyError as e:
        print(f"Error: {e}")
        print(f"Available models: {[m.name for m in config.models]}")
        sys.exit(1)

    # Load article
    raw_text, article = load_article(args.article)
    paragraph_index = args.paragraph

    if paragraph_index < 0 or paragraph_index >= len(article):
        print(f"Error: Paragraph index {paragraph_index} out of range (0-{len(article) - 1})")
        sys.exit(1)

    print(f"使用模型: {model_name} ({model_config.model})")
    print(f"文章共 {len(article)} 个段落")
    print(f"目标段落: {paragraph_index + 1}")
    print("-" * 50)

    # Create provider
    provider = await create_provider(model_config)

    # Rewrite single paragraph
    print("正在改写...")
    rewritten = await rewrite_single_paragraph(
        provider,
        raw_text,
        paragraph_index,
        temperature=args.temperature,
        max_tokens=config.rewrite.max_tokens,
    )

    # Output results
    print("-" * 50)
    print(f"原文段落 {paragraph_index + 1}:")
    print(article.paragraphs[paragraph_index].content)
    print()
    print(f"改写后段落 {paragraph_index + 1}:")
    print(rewritten)
    print()

    # Build and show modified full article
    article.set_paragraph(paragraph_index, rewritten)
    print("=" * 50)
    print("修改后的全文:")
    print("=" * 50)
    print(article.to_text())


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
