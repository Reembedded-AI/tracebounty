import type { NormalizedEvent } from "../schema/submission.js";

export interface ExtractedPrompts {
  initialPrompt: string;
  followupPrompts: string[];
  /** Event indices of the human messages, aligned [initial, ...followups]. */
  humanEventIndices: number[];
}

/**
 * Human prompts in thread order. Slash-command invocations are unwrapped to
 * the command args (the actual user intent) rather than the harness markup.
 */
export function extractPrompts(events: NormalizedEvent[]): ExtractedPrompts {
  const humans: { i: number; text: string }[] = [];
  for (const e of events) {
    if (e.role !== "user" || e.origin !== "human") continue;
    const text = e.blocks
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
    if (text) humans.push({ i: e.i, text: unwrapCommand(text) });
  }

  return {
    initialPrompt: humans[0]?.text ?? "",
    followupPrompts: humans.slice(1).map((h) => h.text),
    humanEventIndices: humans.map((h) => h.i),
  };
}

function unwrapCommand(text: string): string {
  const name = text.match(/<command-name>([\s\S]*?)<\/command-name>/)?.[1]?.trim();
  const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim();
  if (name && args) return `${name} ${args}`;
  if (name) return name;
  return text;
}

const CORRECTION_PATTERNS: RegExp[] = [
  /\b(no|nope|not)\b[\s\S]{0,40}\b(that|this|right|correct|work)/i,
  /\b(doesn'?t|didn'?t|does not|did not|won'?t|isn'?t|still not)\b[\s\S]{0,30}\b(work|working|right|correct|compile|pass)/i,
  /\bstill (fail|failing|broken|wrong|error)/i,
  /\b(that'?s|this is) (wrong|not right|incorrect|not what)/i,
  /\bactually\b/i,
  /\bundo\b|\brevert\b|\bgo back\b/i,
  /\btry again\b|\binstead\b/i,
  /\bwrong (file|place|approach|direction)\b/i,
];

export function isCorrection(text: string): boolean {
  return CORRECTION_PATTERNS.some((p) => p.test(text));
}
