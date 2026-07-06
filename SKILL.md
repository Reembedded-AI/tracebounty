---
name: tracebounty
description: Package the user's own Claude Code session transcripts into eval task candidates and submit them for a paid bounty. Use when the user types /tracebounty, or asks to submit a session, sell a trace, turn a chat session into an eval, or check tracebounty bounty status.
---

# tracebounty

Turn your own Claude Code sessions into eval task candidates. Trace-only: nothing from your repository is captured, only the session transcript (which is redacted and shown to you in full before anything is uploaded). Accepted submissions earn a bounty.

Base directory for this skill: the directory containing this SKILL.md (referred to as `SKILL_DIR` below). All commands run from `SKILL_DIR`.

## Setup (first run only)

1. If `SKILL_DIR/node_modules` does not exist, run `npm install --silent` in `SKILL_DIR`.
2. If the user has never logged in (`~/.tracebounty/config.json` missing or has no session), run `npm run -s cli -- login <their-email>` and let them enter the emailed code interactively.

## Workflow

1. Scan for candidates: `npm run -s cli -- scan` (optionally `--project <substring>` to filter, `--limit <n>`). This lists sessions containing failure arcs (corrections, tool-error loops, repeated edits) ranked by likely eval value. Show the user the list and let them pick.
2. Package: `npm run -s cli -- package <sessionId-or-path>`. This extracts the arc, builds the payload, runs redaction, and writes a pending file under `~/.tracebounty/pending/`. Report the redaction summary to the user.
3. Review and consent: `npm run -s cli -- review <pending-file>`. Run this in the foreground and let the USER answer the prompts themselves. The command shows the exact payload that would be uploaded, lets them exclude events, and asks two confirmations (reviewed the payload; the final state actually solved their task).
4. Submit: `npm run -s cli -- submit <pending-file>`. Only works after consent.
5. Status: `npm run -s cli -- status` shows their submissions, QC state, and bounty state.

## Hard rules

- NEVER answer the consent prompts on the user's behalf, skip the review step, or edit a payload after consent (the consent hash would no longer match and the server rejects it).
- NEVER add repository files, environment data, or anything beyond what `package` produced to a payload.
- If redaction reports hits, mention them to the user during review so they know what was scrubbed.
- If the user asks what data leaves the machine, point them to SECURITY.md and PRIVACY.md in this directory.
