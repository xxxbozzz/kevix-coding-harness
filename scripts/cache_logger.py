"""
Cache Logger — wraps OpenAI-compatible API client to log cache metrics.

Intercepts every API call and records:
  - prompt_tokens, completion_tokens
  - cache_hit_tokens, cache_miss_tokens (DeepSeek-specific)
  - request timestamp, model, endpoint

Output: JSONL file with one line per API request.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

log = logging.getLogger("CacheLogger")


class CacheLogger:
    """Middleware that logs API call metrics without modifying the client."""

    def __init__(self, output_path: str | Path = "cache_log.jsonl"):
        self.output_path = Path(output_path)
        self.request_count = 0
        self.total_prompt = 0
        self.total_cache_hit = 0
        self.total_cache_miss = 0
        self.total_completion = 0

    def log_response(self, response: Any, *, model: str = "", duration_ms: float = 0) -> dict:
        """Extract cache metrics from an API response and write to log.

        Works with OpenAI-compatible responses (DeepSeek, OpenAI, etc.).
        The response object has a .usage attribute with token counts.

        DeepSeek returns:
          - usage.prompt_tokens
          - usage.completion_tokens
          - usage.prompt_cache_hit_tokens   (cached prefix tokens)
          - usage.prompt_cache_miss_tokens  (new prefix tokens)
        """
        usage = getattr(response, "usage", None)
        if usage is None:
            return {}

        prompt = getattr(usage, "prompt_tokens", 0) or 0
        completion = getattr(usage, "completion_tokens", 0) or 0

        # DeepSeek-specific cache fields
        cache_hit = getattr(usage, "prompt_cache_hit_tokens", None)
        cache_miss = getattr(usage, "prompt_cache_miss_tokens", None)

        # Fallback: estimate from prompt_tokens if provider doesn't report
        if cache_hit is None or cache_miss is None:
            cache_hit = getattr(usage, "cache_read_input_tokens", 0) or 0
            cache_miss = prompt - cache_hit if cache_hit else prompt

        self.request_count += 1
        self.total_prompt += prompt
        self.total_cache_hit += cache_hit
        self.total_cache_miss += cache_miss
        self.total_completion += completion

        record = {
            "request_id": self.request_count,
            "timestamp": time.time(),
            "model": model,
            "prompt_tokens": prompt,
            "cache_hit_tokens": cache_hit,
            "cache_miss_tokens": cache_miss,
            "cache_hit_ratio": round(cache_hit / prompt * 100, 2) if prompt > 0 else 0,
            "completion_tokens": completion,
            "duration_ms": round(duration_ms, 1),
        }

        self._write(record)
        return record

    def _write(self, record: dict) -> None:
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.output_path, "a") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def summary(self) -> dict:
        """Return aggregate cache statistics."""
        total_prompt = self.total_prompt
        if total_prompt == 0:
            return {"error": "no data"}

        return {
            "requests": self.request_count,
            "total_prompt_tokens": total_prompt,
            "total_cache_hit": self.total_cache_hit,
            "total_cache_miss": self.total_cache_miss,
            "overall_cache_hit_ratio": round(
                self.total_cache_hit / (self.total_cache_hit + self.total_cache_miss) * 100, 4
            ) if (self.total_cache_hit + self.total_cache_miss) > 0 else 0,
            "total_completion_tokens": self.total_completion,
            "tokens_per_request": round(total_prompt / self.request_count) if self.request_count > 0 else 0,
        }

    def print_summary(self) -> None:
        s = self.summary()
        print(f"\n{'='*60}")
        print(f"Cache Logger Summary")
        print(f"{'='*60}")
        print(f"  Requests:           {s.get('requests', 0)}")
        print(f"  Prompt tokens:      {s.get('total_prompt_tokens', 0):,}")
        print(f"  Cache HIT tokens:   {s.get('total_cache_hit', 0):,}")
        print(f"  Cache MISS tokens:  {s.get('total_cache_miss', 0):,}")
        print(f"  Cache hit ratio:    {s.get('overall_cache_hit_ratio', 0):.4f}%")
        print(f"  Completion tokens:  {s.get('total_completion_tokens', 0):,}")
        print(f"  Avg tokens/request: {s.get('tokens_per_request', 0):,}")
        print(f"{'='*60}")


# Global singleton for use in monkey-patched API clients
_global_logger: CacheLogger | None = None


def get_global_logger(output_path: str = "cache_log.jsonl") -> CacheLogger:
    global _global_logger
    if _global_logger is None:
        _global_logger = CacheLogger(output_path)
    return _global_logger
