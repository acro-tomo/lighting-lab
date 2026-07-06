---
name: token-efficiency
description: Cost-saving rules for delegating to subagents and choosing models under pay-per-token billing. Load when deciding how to delegate, what model to use, or whether to spawn a new subagent. Applies everywhere.
user-invocable: false
---

# Token efficiency

Every subagent call has overhead: its system prompt + skills + project CLAUDE.md are reloaded into a fresh context. Output tokens cost 3–5× input tokens. Optimize for **fewer, fatter calls** and **right-sized models**.

## When to skip a subagent (edit directly)

Direct edit by the main session is allowed when ALL of these hold:
- 1–2 files
- ≤ 10 lines of change
- No investigation needed
- Change is unambiguous (constant, comment fix, single-line addition)

For anything else, delegate to the matching specialist.

## Batching rule

In one delegation, bundle:
- **5–8 related change points** (further apart = consider splitting)
- ≤ **2000 lines** in the prompt body
- A single coherent intent

Strongly dependent changes go in one call. Truly independent changes can split or parallelize. **Avoid A→B→A ping-pong** between agents — each hop is a cold start; delegate a whole unit of work at once.

## Parallel vs serial

- **Parallel OK**: multiple `code-explore` investigations on different subsystems; `builder` + `reviewer` on the same diff; `web-researcher` calls on different libraries.
- **Serial only**: anything where one subagent's output is the next one's input.
- **Never parallel-edit the same file**. Edits race.

## Model selection

| Tier | Models | Use for |
|------|--------|---------|
| Low | `haiku` | `session-summarizer`, simple read/list/summarize |
| Mid | `sonnet` | `code-explore`, `visual-verify`, `implementer`, `builder`, `reviewer`, `debugger`, `web-researcher` |
| High | main-session model (inherited) | The deep domain agents (`render-3d`, `plan-2d`, `state-data`, `lighting-domain`), ambiguous architecture decisions |

These tiers match the `model:` frontmatter in `.claude/agents/*.md` — change both together or they drift. Default light/mechanical work to the cheaper tier; escalate only when you can articulate why the cheaper tier won't do it. Domain agents inherit the main `/model` so they follow your session.

## Output discipline

- Don't omit information needed for decisions, but cut:
  - Restating the user's question
  - Quoting the same code in two places
  - Boilerplate preambles ("Here's what I found:")
- Diff-style change reports are shorter than full file dumps.
- Tables beat prose for N-item comparisons.

## Skill / context loading

- Load only the skills relevant to the current task. "Just in case" loading wastes tokens.
- Subagents return only their conclusion to the main thread — that is the whole point. Use them to keep noisy output (big files, screenshots, render logs) out of the main context.

## When `agent-teams` is worth it

Agent teams run multiple Claude instances in parallel, each with its own context; tokens scale linearly with teammate count.

Worth the cost: parallel review with independent lenses, 3–5 competing bug hypotheses, independent modules with no file overlap. Not worth it: routine changes, same-file edits, sequential pipelines (those are subagent territory).

See [docs/agent-teams.md](../../../docs/agent-teams.md).

## Caching note

Prompt caching applies automatically when the prompt prefix is stable. Keep agent definitions stable across sessions, and reuse the same agent set rather than ad-hoc spawning, to keep the cache warm.
