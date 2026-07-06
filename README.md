# tracebounty

Turn your own Claude Code sessions into eval task candidates and get paid for the ones that make frontier models fail.

Real agent usage is rambly, underspecified, and iterative; benchmarks mostly are not. Your session transcripts already contain the thing labs cannot author: real tasks, real failure arcs, and the ground-truth resolution you accepted. tracebounty extracts that, redacts it, shows you exactly what would be uploaded, and submits only what you approve. Accepted submissions earn a bounty.

## Trace-only, by design

tracebounty never reads your repository. It reads only Claude Code session transcripts (`~/.claude/projects/**.jsonl`), which already contain the prompts, tool calls, and diffs from your sessions. See [SECURITY.md](SECURITY.md) for the exact data flow and [PRIVACY.md](PRIVACY.md) for handling and deletion.

## Install

As a Claude Code skill (recommended):

```sh
git clone https://github.com/Reembedded-AI/tracebounty ~/.claude/skills/tracebounty
cd ~/.claude/skills/tracebounty && npm install
```

Then type `/tracebounty` in Claude Code.

As a CLI:

```sh
npm install -g tracebounty    # or: npx tracebounty
```

## Use

```sh
tracebounty login you@example.com   # email magic code
tracebounty scan                    # list sessions with sellable failure arcs
tracebounty package <sessionId>     # extract + redact -> ~/.tracebounty/pending/<id>.json
tracebounty review <pending-file>   # see EVERYTHING that would upload; consent
tracebounty submit <pending-file>   # upload; bounty quoted immediately, paid on acceptance
tracebounty status                  # QC + payout state of your submissions
```

`review` is mandatory and interactive: it renders the full payload, lets you exclude events, and asks whether the final state actually solved your task (confirmed ground truth earns a higher bounty).

## What gets uploaded

Your prompts, a normalized trace of the session, the final code delta reconstructed from the transcript's Edit/Write calls, and metadata. No repository files, no environment, no absolute paths (your cwd is uploaded only as a SHA-256 fingerprint). Everything passes a redaction ruleset (`src/redact/rules.ts`) client-side, and the server rejects payloads with residual secret shapes.

## Development

```sh
npm install
npm test          # parser/extractor/redaction tests incl. the no-secrets property test
npm run cli -- scan
```

The redaction tests in `test/redact.test.ts` are the ones to read if you are deciding whether to trust this tool.

## License

MIT
