"""Command-line utility for rewriting text to be harder or easier to read using OpenAI."""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

MODEL = "gpt-4o-mini"


@dataclass
class RewriteResult:
    """Represents a completed rewrite."""

    adjusted_text: str
    complexity: str


class TextRewriteService:
    """Client wrapper around the OpenAI API for text rewriting."""

    def __init__(self, model: str = MODEL) -> None:
        self.client = OpenAI()
        self.model = model

    def rewrite(self, text: str, complexity: str) -> RewriteResult:
        """Rewrite text to the desired complexity using chat completions."""

        messages: Iterable[ChatCompletionMessageParam] = [
            {
                "role": "system",
                "content": (
                    "You rewrite provided text. When asked for 'harder', increase "
                    "complexity and vocabulary while preserving meaning. When asked "
                    "for 'easier', simplify the language and structure. Return only "
                    "the rewritten text without commentary."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Rewrite the following text to be {complexity} to read:\n\n{text}"
                ),
            },
        ]

        response = self.client.chat.completions.create(
            model=self.model,
            messages=list(messages),
        )
        adjusted_text = response.choices[0].message.content
        return RewriteResult(adjusted_text=adjusted_text.strip(), complexity=complexity)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Interactive CLI that rewrites text to be harder or easier using the OpenAI API."
        )
    )
    parser.add_argument(
        "--model",
        default=MODEL,
        help="OpenAI model name to use for rewriting (default: %(default)s)",
    )
    return parser.parse_args(argv)


def prompt_choice() -> str:
    """Prompt the user to choose an action."""
    print("\nSelect an option:")
    print("  1) Make text harder")
    print("  2) Make text easier")
    print("  3) Exit")
    choice = input("Enter choice (1-3): ").strip()
    return choice


def prompt_text() -> str:
    print("\nPaste your text below. Press Enter then Ctrl+D (Linux/macOS) or Ctrl+Z then Enter (Windows) to submit.\n")
    try:
        return sys.stdin.read()
    except KeyboardInterrupt:
        print("\nInput cancelled.")
        return ""


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or [])
    service = TextRewriteService(model=args.model)

    while True:
        choice = prompt_choice()

        if choice == "1":
            complexity = "harder"
        elif choice == "2":
            complexity = "easier"
        elif choice == "3":
            print("Goodbye!")
            return 0
        else:
            print("Invalid choice. Please select 1, 2, or 3.")
            continue

        print("\nPaste text to rewrite.")
        text = prompt_text().strip()
        if not text:
            print("No text provided; returning to menu.")
            continue

        try:
            result = service.rewrite(text=text, complexity=complexity)
        except Exception as exc:  # broad to surface API errors to the user
            print(f"\nFailed to rewrite text: {exc}\n")
            continue

        print("\n==== Rewritten Text ====")
        print(result.adjusted_text)
        print("=======================\n")


if __name__ == "__main__":
    raise SystemExit(main())