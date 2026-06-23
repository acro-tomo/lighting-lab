---
name: secret-hygiene
description: Rules for handling secrets — API keys, tokens, passwords, credentials, PII. Load whenever reading config files, writing examples, accepting user input, committing, logging, or being asked to install / configure third-party services.
user-invocable: false
---

# Secret hygiene

This project runs fully locally with no backend or credentials today. These rules apply if that ever changes (telemetry, a cloud render service, an API key).

## Never put a secret in

- Source code (`const API_KEY = "..."`)
- Comments (including TODOs), commit messages
- CLAUDE.md, skills, agent definitions
- Documentation, examples, READMEs
- Log statements at any level
- Error messages or tool prompts shown to the user
- Auto memory (`/memory` should never contain a credential)

## Where secrets belong

- Local development: `.env` / `.env.local` (gitignored), or a secret-manager CLI.
- Never your shell history. Use a tool that doesn't echo (`read -s`, `op read`).

## When the user must provide one

- Ask them to type it **directly into the terminal**, not into a chat tool that may forward it to a model.
- Don't echo it back or summarize it ("I see your key starts with sk-").
- Don't put it in a follow-up question's options list.

## If you find one in code or logs

Treat it as already leaked.

1. **Stop** — this is now incident response, not the original task.
2. **Tell the user** where it is, what kind it looks like, when it was likely committed.
3. **Recommend rotation FIRST**, then cleanup: rotate at the issuer → remove from the tree → rewrite history with `git filter-repo` if it was pushed → force-push only after confirming with the user.
4. **Do not commit a redacted version** without rotation; history still holds the original.

## Recognizing common formats

`sk-ant-...` (Anthropic), `sk-...` (OpenAI), `ghp_/gho_/ghs_/ghu_...` (GitHub), `AKIA...` (AWS), `AIza...` (Google), `eyJhbGciOi...` (JWT), `-----BEGIN ... PRIVATE KEY-----`. Heuristics — the real test is "would this grant access to something". Err toward treating it as a secret.

## OWASP basics (for any code you write)

- Input validation at every boundary; output escaping for the target context.
- No deserializing untrusted input.
- HTTPS everywhere; verify certificates; don't disable validation to "make it work".

## When asked to do something risky

Push back once with a brief reason and a safer alternative. If the user confirms with awareness, do it but leave a comment explaining the risk. Never silently weaken security.
