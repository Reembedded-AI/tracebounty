import type { AttestationRecord } from "../schema/submission.js";

/**
 * Swap-later interface: v1 is self-attestation (unsigned hash + client
 * version). Later: hook-time signed capture so the server can verify the
 * payload was produced by an unmodified client at session time.
 */
export interface Attestation {
  attest(payloadSha256: string): Promise<AttestationRecord>;
}
