import { randomUUID } from "node:crypto";
import type { Candidate } from "./candidateFinder.js";
import { buildFinalDelta, countEdits, erroredToolUseIds } from "./deltaBuilder.js";
import { extractPrompts } from "./promptExtractor.js";
import { buildReport, redactValue } from "../redact/redactor.js";
import {
  SCHEMA_VERSION,
  sha256Hex,
  type SubmissionV1,
} from "../schema/submission.js";

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ".ts": "ts",
  ".tsx": "ts",
  ".js": "js",
  ".jsx": "js",
  ".py": "py",
  ".rs": "rs",
  ".go": "go",
  ".rb": "rb",
  ".java": "java",
  ".md": "md",
  ".sql": "sql",
};

export function buildPayload(
  candidate: Candidate,
  contributorId: string,
  clientVersion: string,
): SubmissionV1 {
  const prompts = extractPrompts(candidate.events);
  const delta = buildFinalDelta(candidate.events);

  const unredacted: SubmissionV1 = {
    schema_version: SCHEMA_VERSION,
    submission_id: randomUUID(),
    kind: "trace_only",
    contributor: { id: contributorId, client_version: clientVersion },
    source: {
      tool: "claude-code",
      tool_version: candidate.toolVersion,
      session_id: candidate.meta.sessionId,
      model: candidate.model,
      started_at: candidate.startedAt,
      ended_at: candidate.endedAt,
      cwd_fingerprint: sha256Hex(candidate.cwd),
      git_branch: candidate.gitBranch,
      compacted: candidate.compacted,
    },
    task: {
      initial_prompt: prompts.initialPrompt,
      followup_prompts: prompts.followupPrompts,
      labels: { underspecified: prompts.initialPrompt.length < 400, failure_arc: true },
      language_hints: languageHints(delta.files.map((f) => f.path)),
    },
    trace: {
      format: "cc-jsonl-normalized-v1",
      events: candidate.events,
      stats: {
        num_turns: candidate.events.length,
        num_human_messages: prompts.humanEventIndices.length,
        num_edits: countEdits(candidate.events),
        num_tool_errors: erroredToolUseIds(candidate.events).size,
        duration_s: durationSeconds(candidate.startedAt, candidate.endedAt),
      },
    },
    final_delta: delta,
    failure_arc: candidate.arc,
    env: null,
    redaction: buildReport({}),
    attestation: null,
    consent: null,
  };

  // Whole-payload redaction: every string in the object graph except
  // allowlisted structural metadata. cwd passed so project paths rewrite to
  // project-relative before the generic home-path rule fires.
  const { value: redacted, hits } = redactValue(unredacted, candidate.cwd);
  redacted.redaction = buildReport(hits);
  return redacted;
}

function languageHints(paths: string[]): string[] {
  const hints = new Set<string>();
  for (const p of paths) {
    const ext = p.slice(p.lastIndexOf("."));
    const hint = LANGUAGE_EXTENSIONS[ext];
    if (hint) hints.add(hint);
  }
  return [...hints];
}

function durationSeconds(start: string, end: string): number {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 1000);
}
