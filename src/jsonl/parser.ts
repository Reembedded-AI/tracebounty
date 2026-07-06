import { readFileSync } from "node:fs";

/**
 * Raw Claude Code session entry. Only the fields we rely on are typed; the
 * on-disk format is versioned by the Claude Code client and contains many
 * entry types we deliberately skip.
 */
export interface RawEntry {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  timestamp?: string;
  sessionId?: string;
  version?: string;
  cwd?: string;
  gitBranch?: string;
  userType?: string;
  message?: {
    role?: string;
    model?: string;
    content?: string | RawContentBlock[];
  };
  toolUseResult?: unknown;
}

export interface RawContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
}

export interface ParsedSession {
  entries: RawEntry[];
  /** Entry types we saw but do not handle (skipped loudly, not silently). */
  skippedTypes: Record<string, number>;
  compacted: boolean;
}

const HANDLED_TYPES = new Set(["user", "assistant"]);

export function parseSessionFile(path: string): ParsedSession {
  const raw = readFileSync(path, "utf8");
  const entries: RawEntry[] = [];
  const skippedTypes: Record<string, number> = {};
  let compacted = false;

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let obj: RawEntry;
    try {
      obj = JSON.parse(line) as RawEntry;
    } catch {
      skippedTypes["<unparseable>"] = (skippedTypes["<unparseable>"] ?? 0) + 1;
      continue;
    }
    if (obj.isCompactSummary || obj.type === "summary") compacted = true;
    if (!HANDLED_TYPES.has(obj.type)) {
      skippedTypes[obj.type] = (skippedTypes[obj.type] ?? 0) + 1;
      continue;
    }
    entries.push(obj);
  }

  return { entries, skippedTypes, compacted };
}
