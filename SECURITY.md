# Security model

## What this tool reads

Only Claude Code session transcripts: `~/.claude/projects/<project-slug>/<session-id>.jsonl`. It never reads your repository, your environment variables, or any other file.

## What leaves your machine

Exactly one network call uploads data: `submit`, which POSTs the payload you approved during `review`. The payload is:

- your prompts (initial + follow-ups)
- a normalized version of the session's message/tool-call trace
- the final code delta reconstructed from Edit/Write tool calls inside the transcript
- metadata (session id, model name, a SHA-256 fingerprint of your working directory path, never the path itself)

Everything above passes through the redactor (`src/redact/`) before you see it, and the exact bytes you approve are hashed into the consent record; the server rejects any payload whose hash differs from what was approved.

## What is redacted

Secret-shaped strings (API key prefixes, JWTs, bearer tokens, private key blocks), `.env`-style KEY=VALUE pairs with secret-ish names, email addresses, non-loopback IPs, and absolute home paths (rewritten to `~` / project-relative). See `src/redact/rules.ts` for the full ruleset; the server runs a second-pass scan and rejects on residual hits.

Known limitation: redaction is pattern-based. Transcripts can contain proprietary code that the agent read during your session. The `review` step exists so you see everything before it is sent; do not approve payloads containing code you do not have the right to share.

## Reporting

Security issues: security@reembedded.dev (or open a GitHub issue for non-sensitive reports).
