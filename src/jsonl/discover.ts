import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SessionMeta {
  path: string;
  sessionId: string;
  projectSlug: string;
  mtimeMs: number;
  sizeBytes: number;
}

export function projectsRoot(): string {
  return process.env.TRACEBOUNTY_PROJECTS_ROOT ?? join(homedir(), ".claude", "projects");
}

export function discoverSessions(projectFilter?: string): SessionMeta[] {
  const root = projectsRoot();
  const sessions: SessionMeta[] = [];
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(root);
  } catch {
    return [];
  }

  for (const slug of projectDirs) {
    if (projectFilter && !slug.includes(projectFilter)) continue;
    const dir = join(root, slug);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const p = join(dir, f);
      try {
        const st = statSync(p);
        sessions.push({
          path: p,
          sessionId: f.replace(/\.jsonl$/, ""),
          projectSlug: slug,
          mtimeMs: st.mtimeMs,
          sizeBytes: st.size,
        });
      } catch {
        // file disappeared mid-scan; skip
      }
    }
  }
  return sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
}
