"""CLI entry point for the rewrite engine.

Usage:
    # Mode 1 (auto): rewrite multiple paragraphs
    rewrite data/sample-article.txt --paragraphs 2 4 --mode auto

    # Mode 2 (interactive): step-by-step with candidate selection
    rewrite data/sample-article.txt --paragraphs 2 4 --mode interactive

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
from rewrite_engine.pipelines.interactive import InteractiveSession, run_interactive_session


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
        help="工作模式: auto=全自动, interactive=交互式",
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
    parser.add_argument(
        "--no-validation",
        action="store_true",
        help="跳过改写后的质量评估",
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

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"Error: Config file not found: {args.config}")
        sys.exit(1)
    config: AppConfig = load_config(config_path)

    model_name = args.model or config.default_model.name
    try:
        model_config = config.get_model(model_name)
    except KeyError as e:
        print(f"Error: {e}")
        print(f"Available models: {[m.name for m in config.models]}")
        sys.exit(1)

    raw_text, article = load_article(args.article)

    if args.paragraphs:
        target_indices = sorted(dict.fromkeys(args.paragraphs))
    else:
        target_indices = [args.paragraph]

    for idx in target_indices:
        if idx < 0 or idx >= len(article):
            print(f"Error: Paragraph index {idx} out of range (0-{len(article) - 1})")
            sys.exit(1)

    print(f"模型: {model_name} ({model_config.model})")
    print(f"文章: {len(article)} 个段落")
    print(f"目标段落: {[i + 1 for i in target_indices]}")
    print(f"模式: {args.mode}")
    print("-" * 60)

    provider = await create_provider(model_config)

    if args.mode == "interactive":
        await run_interactive_mode(provider, config, raw_text, article, target_indices, args)
    else:
        await run_auto_mode(provider, config, raw_text, article, target_indices, args)

    await provider._client.close()  # type: ignore[union-attr]


# ---- Auto mode ----

async def run_auto_mode(
    provider,
    config: AppConfig,
    raw_text: str,
    article: Article,
    target_indices: list[int],
    args,
) -> None:
    from rewrite_engine.pipelines.auto import run_auto_pipeline

    result = await run_auto_pipeline(
        provider, config, article, target_indices,
        with_validation=not args.no_validation,
    )

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


# ---- Interactive mode ----

async def run_interactive_mode(
    provider,
    config: AppConfig,
    raw_text: str,
    article: Article,
    target_indices: list[int],
    args,
) -> None:
    from rich.console import Console
    from rich.panel import Panel
    from rich.text import Text

    console = Console()
    session = await run_interactive_session(provider, config, article, target_indices)

    for step_num, para_idx in enumerate(target_indices, 1):
        _print_article_status(console, session, step_num, para_idx, len(target_indices))

        chosen = await _pick_candidate(console, session, para_idx)
        console.print(f"\n  [green]✓ 已选择段落 {para_idx + 1} 的改写[/green]")

    # Final output
    console.print()
    console.print(Panel("所有段落已确认，改写完成", style="bold green"))

    final_text = session.scheduler.state.current.to_text()

    if not args.no_validation:
        await _run_post_validation(provider, console, article, final_text, target_indices)

    console.print()
    console.rule("修改后的全文")
    console.print(final_text)

    if args.output:
        Path(args.output).write_text(final_text, encoding="utf-8")
        console.print(f"\n结果已写入: {args.output}")


def _print_article_status(
    console, session: InteractiveSession, step_num: int, current_idx: int, total: int
) -> None:
    from rich.panel import Panel
    from rich.text import Text

    console.print(f"\n[bold]--- 步骤 {step_num}/{total}: 段落 {current_idx + 1} ---[/bold]")

    lines: list[str] = []
    for p in session.state.current.paragraphs:
        idx = p.index
        preview = p.content[:100] + "..." if len(p.content) > 100 else p.content

        if idx in session.scheduler.state.confirmed:
            lines.append(f"[green]  [{idx + 1}] ✓ {preview}[/green]")
        elif idx == current_idx:
            lines.append(f"[bold yellow]  [{idx + 1}] ✎ {preview}[/bold yellow]")
        else:
            lines.append(f"[dim]  [{idx + 1}]   {preview}[/dim]")

    body = Text.from_markup("\n".join(lines))
    console.print(Panel(body, title="当前文章状态", border_style="blue"))


async def _pick_candidate(
    console, session: InteractiveSession, para_idx: int
) -> str:
    from rich.panel import Panel
    from rich.prompt import Prompt

    while True:
        console.print(f"\n  [dim]正在生成 {session.scheduler.config.rewrite.candidates_count} 个改写候选...[/dim]")
        candidates = await session.get_candidates(para_idx, regenerate=True)

        console.print()
        for i, c in enumerate(candidates):
            label = f"候选 {i + 1}"
            console.print(Panel(c[:500], title=label, border_style="cyan"))

        console.print()
        choice = Prompt.ask(
            f"  选择候选 [1-{len(candidates)}] / 重新生成(r) / 跳过保留原文(s)",
            default="1",
        )

        if choice.lower() == "r":
            continue
        if choice.lower() == "s":
            return session.state.current.paragraphs[para_idx].content

        try:
            idx = int(choice) - 1
            if 0 <= idx < len(candidates):
                return session.select(idx)
        except ValueError:
            pass

        console.print(f"  [red]无效选择，请输入 1-{len(candidates)}[/red]")


async def _run_post_validation(
    provider, console, original: Article, final_text: str, target_indices: list[int],
) -> None:
    from rewrite_engine.agents.validator import validate
    from rewrite_engine.agents.analyzer import analyze_all
    from rewrite_engine.pipelines.auto import AutoRewriteResult

    console.print("\n[dim]正在评估改写质量...[/dim]")
    try:
        v = await validate(provider, original.to_text(), final_text, target_indices)
        console.print(f"  综合均分: {v.average_score:.1f}/5  "
                       f"(连贯性:{v.coherence} 衔接:{v.transition} 一致性:{v.consistency} 风格:{v.style})")
        if v.issues:
            for issue in v.issues:
                console.print(f"  [yellow]• {issue}[/yellow]")
    except Exception:
        pass


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
