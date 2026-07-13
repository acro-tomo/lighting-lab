---
name: git-workflow
description: Git commit, branch, and push conventions for this project. Load when committing, branching, merging, or pushing. Defines semantic commits and irreversible-operation safeguards.
user-invocable: false
---

# Git workflow

## Commit messages (semantic, imperative)

Format: `<type>(<scope>): <subject>` — scope is optional.

| Type | When |
|------|------|
| `feat` | New user-visible behavior |
| `fix` | Bug fix |
| `refactor` | Behavior-preserving code change |
| `perf` | Performance improvement (e.g. render/path-trace speed) |
| `docs` | Documentation only |
| `build` | Build system, dependencies |
| `chore` | Tooling, housekeeping |
| `revert` | Reverts a previous commit |

Rules:
- Subject ≤ 72 characters, imperative mood: "add", not "added".
- No period at end of subject.
- Body explains **why** (the what is in the diff). Wrap at 72.
- One logical change per commit. If the subject needs "and", split it.
- Refactor + feature in the same commit: split into two, refactor first.

## Branching

- Default branch: `main`.
- Feature: `feat/<short-slug>` · Fix: `fix/<short-slug>` · Spike: `spike/<short-slug>`.
- 作業を検証して完了したら、ユーザーから保留・ローカル限定の指示がない限り `main` に統合して `origin/main` まで通常 push する。非自明な作業を `main` で始める場合は、先にブランチを切る。

## Pushing — always ask first when

- Force-pushing anywhere (`--force`, `--force-with-lease`)
- Pushing tags or pushing to a new remote for the first time

Never use `--no-verify`. If a check fails, fix the cause.

## Hard refusals (ask the user)

- `git push --force` to a shared branch
- `git reset --hard origin/<branch>` when uncommitted changes exist
- `git filter-branch` / `git filter-repo` on shared history
- Deleting a remote branch
- Amending or rebasing already-pushed commits on shared branches

## .gitignore hygiene

- Don't commit build output (`dist/`), render output (`output/`), or `.playwright-cli/` scratch.
- Don't commit local config or secrets.

## When in doubt

Ask before destructive or visible-to-others operations. A confirmation costs a second; an overwriting force-push costs hours.
