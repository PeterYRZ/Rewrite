"""CLI entry point for the rewrite engine.

Usage:
    # Mode 1 (auto): rewrite multiple paragraphs
    rewrite data/sample-article.txt --paragraphs 2 4 --mode auto

    # Mode 1 with specific model
    rewrite data/sample-article.txt -p 1 3 -m deepseek-v4-pro

    # Phase 1 single-paragraph (backward compatible)
    rewrite data/sample-article.txt --paragraph 2
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

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
    target_group = parser.add_mutually_exclusive_group(required=True)
    target_group.add_argument(
        "--paragraph", "-p",
        type=int,
        help="Phase 1: 改写单个段落（0-based）",
    )
    target_group.add_argument(
        "--paragraphs",
        type=int,
        nargs="+",
        help="Mode 1/2: 改写多个段落序号（0-based），如 --paragraphs 2 4",
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["auto", "interactive"],
        default="auto",
        help="工作模式: auto=全自动, interactive=交互式（Phase 4）",
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
    parser.add_argument(
        "--output", "-o",
        type=str,
        default=None,
        help="将改写结果写入文件",
    )
    return parser.parse_args()


def load_article(path_or_text: str) -> tuple[str, Article]:
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

    # Determine target paragraphs
    if args.paragraphs:
        target_indices = sorted(args.paragraphs)
        # Remove duplicates
        target_indices = list(dict.fromkeys(target_indices))
    else:
        target_indices = [args.paragraph]

    # Validate indices
    for idx in target_indices:
        if idx < 0 or idx >= len(article):
            print(f"Error: Paragraph index {idx} out of range (0-{len(article) - 1})")
            sys.exit(1)

    print(f"模型: {model_name} ({model_config.model})")
    print(f"文章: {len(article)} 个段落")
    print(f"目标段落: {[i + 1 for i in target_indices]}")
    print(f"模式: {args.mode}")
    print("-" * 60)

    # Create provider
    provider = await create_provider(model_config)

    if args.mode == "auto":
        await run_auto_mode(provider, config, raw_text, article, target_indices, args)

    await provider._client.close()  # type: ignore[union-attr]


async def run_auto_mode(
    provider,
    config: AppConfig,
    raw_text: str,
    article: Article,
    target_indices: list[int],
    args,
) -> None:
    from rewrite_engine.pipelines.auto import run_auto_pipeline

    result = await run_auto_pipeline(provider, config, article, target_indices)

    result.print_summary()

    print()
    print("=" * 60)
    print("  修改后的全文")
    print("=" * 60)
    final_text = result.rewritten.to_text()
    print(final_text)

    if args.output:
        Path(args.output).write_text(final_text, encoding="utf-8")
        print(f"\n结果已写入: {args.output}")


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
