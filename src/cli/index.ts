#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { fetchStatus, submitPayload } from "../api.js";
import { loadConfig, pendingDir } from "../config.js";
import { discoverSessions } from "../jsonl/discover.js";
import { findCandidate, scanForCandidates } from "../extract/candidateFinder.js";
import { buildPayload } from "../extract/payloadBuilder.js";
import { findForbidden } from "../redact/redactor.js";
import { SelfAttestation } from "../impl/selfAttestation.js";
import { SupabaseIdentity } from "../impl/supabaseIdentity.js";
import {
  attestablePayloadHash,
  stableStringify,
  SubmissionV1,
} from "../schema/submission.js";
import { runConsentFlow } from "../ui/consent.js";

const CLIENT_VERSION = "0.1.0";
const TERMS_VERSION = "1.0";

const program = new Command();
program
  .name("tracebounty")
  .description("Package your own Claude Code sessions into eval task candidates. Trace-only, consent-first.")
  .version(CLIENT_VERSION);

program
  .command("scan")
  .description("List sessions containing sellable failure arcs, ranked")
  .option("--project <substring>", "filter by project slug substring")
  .option("--limit <n>", "max candidates to show", "10")
  .action((opts: { project?: string; limit: string }) => {
    const sessions = discoverSessions(opts.project);
    if (sessions.length === 0) {
      console.log("No Claude Code sessions found under ~/.claude/projects.");
      return;
    }
    const candidates = scanForCandidates(sessions, Number.parseInt(opts.limit, 10));
    if (candidates.length === 0) {
      console.log("No candidates found (need at least one edit plus a failure arc).");
      return;
    }
    for (const c of candidates) {
      console.log(
        `${c.meta.sessionId}  score=${c.score.toFixed(1)}  arc=${c.arc.arc_type}  edits=${c.numEdits} errors=${c.numErrors}${c.compacted ? "  [compacted]" : ""}`,
      );
      console.log(`    ${c.meta.projectSlug}`);
      console.log(`    "${c.initialPromptPreview}"`);
    }
    console.log(`\nNext: tracebounty package <sessionId>`);
  });

program
  .command("package")
  .description("Extract, redact, and write a pending payload for review")
  .argument("<session>", "session id or path to a session .jsonl")
  .action(async (session: string) => {
    const meta = resolveSession(session);
    if (!meta) {
      console.error(`Session not found: ${session}`);
      process.exitCode = 1;
      return;
    }
    const candidate = findCandidate(meta);
    if (!candidate) {
      console.error("Session has no sellable candidate (needs edits plus a failure arc).");
      process.exitCode = 1;
      return;
    }
    const identity = tryIdentity();
    const contributor = (await identity?.currentContributor()) ?? { id: "anonymous", email: "" };
    const payload = buildPayload(candidate, contributor.id, CLIENT_VERSION);

    const residual = findForbidden(stableStringify(payload));
    if (residual.length > 0) {
      console.error("Redaction left forbidden shapes in the payload; refusing to write it:");
      for (const r of residual) console.error(`  ${r}`);
      process.exitCode = 1;
      return;
    }

    const out = join(pendingDir(), `${payload.submission_id}.json`);
    writeFileSync(out, JSON.stringify(payload, null, 2), { mode: 0o600 });
    console.log(`Pending payload written: ${out}`);
    console.log(`Redaction hits: ${JSON.stringify(payload.redaction.hits)}`);
    console.log(`Next: tracebounty review ${out}`);
  });

program
  .command("review")
  .description("Show the full payload and record consent (interactive)")
  .argument("<file>", "pending payload file")
  .action(async (file: string) => {
    const payload = readPayload(file);
    const result = await runConsentFlow(payload);
    if (!result.approved) {
      console.log("Not approved. Nothing recorded; file left as-is.");
      return;
    }
    if (result.excludedEventIndices.length > 0) {
      payload.trace.events = payload.trace.events
        .filter((e) => !result.excludedEventIndices.includes(e.i))
        .map((e, idx) => ({ ...e, i: idx }));
      payload.failure_arc.correction_event_indices = [];
    }
    if (result.confirmedSolved) {
      payload.final_delta.accepted = true;
      payload.final_delta.acceptance_evidence = "contributor-confirmed";
    }
    payload.redaction.residual_risk_ack = true;
    payload.consent = {
      reviewed_full_payload: true,
      confirmed_final_state_solved_task: result.confirmedSolved,
      consented_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
    };
    writeFileSync(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
    console.log(`Consent recorded. Next: tracebounty submit ${file}`);
  });

program
  .command("submit")
  .description("Upload a reviewed payload")
  .argument("<file>", "pending payload file")
  .action(async (file: string) => {
    const payload = readPayload(file);
    if (!payload.consent?.reviewed_full_payload) {
      console.error("Payload has no consent record. Run: tracebounty review " + file);
      process.exitCode = 1;
      return;
    }
    const identity = new SupabaseIdentity();
    const token = await identity.accessToken();
    if (!token) {
      console.error("Not logged in. Run: tracebounty login <email>");
      process.exitCode = 1;
      return;
    }
    const contributor = await identity.currentContributor();
    if (contributor && payload.contributor.id === "anonymous") {
      payload.contributor.id = contributor.id;
    }
    const attestation = await new SelfAttestation(CLIENT_VERSION).attest(
      attestablePayloadHash(payload),
    );
    payload.attestation = attestation;
    writeFileSync(file, JSON.stringify(payload, null, 2), { mode: 0o600 });

    const receipt = await submitPayload(payload, token);
    console.log(
      `Submitted ${receipt.submission_id}: qc=${receipt.qc_status}` +
        (receipt.bounty_quote_cents != null
          ? ` bounty quote=$${(receipt.bounty_quote_cents / 100).toFixed(2)} (paid only if accepted)`
          : ""),
    );
  });

program
  .command("login")
  .description("Email magic-code login")
  .argument("<email>")
  .action(async (email: string) => {
    const identity = new SupabaseIdentity();
    await identity.login(email);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const code = await rl.question(`Code sent to ${email}. Enter it: `);
    rl.close();
    const contributor = await identity.verify(email, code.trim());
    console.log(`Logged in as ${contributor.email} (${contributor.id}).`);
  });

program
  .command("status")
  .description("List your submissions and bounty state")
  .action(async () => {
    const identity = new SupabaseIdentity();
    const token = await identity.accessToken();
    if (!token) {
      console.error("Not logged in. Run: tracebounty login <email>");
      process.exitCode = 1;
      return;
    }
    const rows = await fetchStatus(token);
    if (rows.length === 0) {
      console.log("No submissions yet.");
      return;
    }
    for (const r of rows) {
      const bounty = r.bounty_quote_cents != null ? `$${(r.bounty_quote_cents / 100).toFixed(2)}` : "-";
      console.log(`${r.id}  qc=${r.qc_status}  payout=${r.payout_status}  bounty=${bounty}  ${r.created_at}`);
    }
  });

function resolveSession(idOrPath: string) {
  if (existsSync(idOrPath) && idOrPath.endsWith(".jsonl")) {
    const sessions = discoverSessions();
    return (
      sessions.find((s) => s.path === idOrPath) ?? {
        path: idOrPath,
        sessionId: basename(idOrPath, ".jsonl"),
        projectSlug: "external",
        mtimeMs: 0,
        sizeBytes: 0,
      }
    );
  }
  return discoverSessions().find((s) => s.sessionId === idOrPath) ?? null;
}

function readPayload(file: string): SubmissionV1 {
  const parsed = SubmissionV1.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new Error(`Invalid payload file: ${parsed.error.issues[0]?.message}`);
  }
  return parsed.data;
}

function tryIdentity(): SupabaseIdentity | null {
  try {
    const cfg = loadConfig();
    return cfg.supabaseUrl && cfg.supabaseAnonKey ? new SupabaseIdentity() : null;
  } catch {
    return null;
  }
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
