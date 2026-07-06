import { loadConfig } from "./config.js";
import type { SubmissionV1 } from "./schema/submission.js";

export interface SubmitReceipt {
  submission_id: string;
  qc_status: string;
  bounty_quote_cents: number | null;
}

export async function submitPayload(
  payload: SubmissionV1,
  accessToken: string,
): Promise<SubmitReceipt> {
  const cfg = loadConfig();
  if (!cfg.supabaseUrl) throw new Error("Backend not configured (supabaseUrl missing).");

  const res = await fetch(`${cfg.supabaseUrl}/functions/v1/submit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      apikey: cfg.supabaseAnonKey,
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`submit failed (${res.status}): ${body.error ?? JSON.stringify(body)}`);
  }
  return body as unknown as SubmitReceipt;
}

export interface SubmissionStatusRow {
  id: string;
  qc_status: string;
  payout_status: string;
  bounty_quote_cents: number | null;
  created_at: string;
}

export async function fetchStatus(accessToken: string): Promise<SubmissionStatusRow[]> {
  const cfg = loadConfig();
  const res = await fetch(
    `${cfg.supabaseUrl}/rest/v1/submissions?select=id,qc_status,payout_status,bounty_quote_cents,created_at&order=created_at.desc`,
    {
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: cfg.supabaseAnonKey,
      },
    },
  );
  if (!res.ok) throw new Error(`status failed (${res.status})`);
  return (await res.json()) as SubmissionStatusRow[];
}
