import type { Attestation } from "../interfaces/attestation.js";
import type { AttestationRecord } from "../schema/submission.js";

export class SelfAttestation implements Attestation {
  constructor(private clientVersion: string) {}

  async attest(payloadSha256: string): Promise<AttestationRecord> {
    return {
      scheme: "self-v1",
      payloadSha256,
      clientVersion: this.clientVersion,
      signedAt: new Date().toISOString(),
    };
  }
}
