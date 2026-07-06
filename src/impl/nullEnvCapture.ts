import type { EnvCapture } from "../interfaces/envCapture.js";

export class NullEnvCapture implements EnvCapture {
  readonly tier = "none" as const;
  async capture(): Promise<null> {
    return null;
  }
}
