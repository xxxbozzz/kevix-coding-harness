# Kevix Experiment Metrics

This document defines the metrics used in Kevix engine experiments. Keep this file stable so later experiments, public reports, and potential papers use the same terminology.

## Task Outcome Metrics

| Metric | Definition |
|---|---|
| `passed` | `true` only when the task finishes without engine error and its verification command passes. |
| `build_passed` | Whether the task-specific verification command passed. This is usually `npx tsc --noEmit`, `npx vitest`, or a narrower test command. |
| `error` | Runtime error captured from the harness. `null` means no engine-level error was recorded. |
| `phases_completed` | Ordered phase list completed by `runAgentLoop`, such as `controller`, `worker`, `probe_plan`, `probe_verify`, `assess`. |

## Timing Metrics

| Metric | Definition |
|---|---|
| `controller_time_ms` | Duration of the Controller phase in milliseconds. |
| `worker_time_ms` | Duration of the Worker phase in milliseconds. |

Current limitation: timings are phase durations, not full wall-clock task time. Future runs should also store `task_started_at`, `task_finished_at`, and `wall_time_ms`.

## API Metrics

| Metric | Definition |
|---|---|
| `api_calls` | Number of LLM API calls observed through `api_call` events. |
| `cache_hit_values` | Per-call cache hit ratios reported by the provider. |
| `cache_hit_final` | Cache hit ratio reported by the final API call in the task. |

## Cache Hit Interpretation

`cache_hit_final` is not a full-task average. It only describes the last API request.

Different tasks can have different final cache hit values because:

- the number of API calls differs
- each task reads different files and produces different tool outputs
- new tool results are appended as uncached context
- gate events may add new context
- short tasks may finish before the cache fully warms up

For later analysis, prefer these additional metrics:

| Metric | Formula |
|---|---|
| warmup-excluded average | Average of `cache_hit_values` after removing the first `0` cold call. |
| final cache hit | Last value in `cache_hit_values`. |
| weighted cache hit | `sum(cached_prompt_tokens) / sum(prompt_tokens)` if token-level usage is available. |

## Gate Metrics

| Metric | Definition |
|---|---|
| `gate_events` | Log events containing `Gate blocked`, usually from scope or safety gates. |
| gate recovery | A task recovered if it passed after one or more gate-blocked actions. |

Current limitation: `gate_events` is recorded as text. Future runs should store structured gate events:

```json
{
  "gate": "scope",
  "tool": "bash",
  "reason": "path outside project",
  "phase": "worker",
  "recovered": true
}
```

## Experimental Validity Notes

- L2 smoke and repeatability results are engineering evidence, not benchmark-scale proof.
- A pass means the task succeeded under the tested conditions; it does not prove general superiority.
- For paper-grade claims, compare against matched baselines with the same model, same task, same tool access, and controlled prompt budget.

