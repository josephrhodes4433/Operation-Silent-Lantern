import type { LanternWrittenHistoryEntry } from '@workspace/api-client-react';

export interface WrittenVersion {
  version: number;
  snapshot: LanternWrittenHistoryEntry;
  latest: LanternWrittenHistoryEntry;
  decisions: LanternWrittenHistoryEntry[];
  imported: boolean;
}

// A review event is not a new learner revision. Keep selections tied to the
// server's version number, even when more decisions arrive during polling.
export function groupWrittenVersions(entries: LanternWrittenHistoryEntry[]): WrittenVersion[] {
  const groups = new Map<number, LanternWrittenHistoryEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.version) ?? [];
    group.push(entry);
    groups.set(entry.version, group);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([version, events]) => {
    const ordered = [...events].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt) || a.id - b.id);
    return {
      version,
      snapshot: ordered.find(event => event.event === 'submitted' || event.event === 'imported') ?? ordered[0],
      latest: ordered[ordered.length - 1],
      decisions: ordered.filter(event => event.event === 'reviewed'),
      imported: ordered.some(event => event.event === 'imported'),
    };
  });
}

export function resolveComparison(
  versions: WrittenVersion[],
  selection: { left: number; right: number } | null,
): { left: WrittenVersion; right: WrittenVersion } | null {
  if (versions.length < 2) return null;
  const left = versions.find(version => version.version === selection?.left);
  const right = versions.find(version => version.version === selection?.right);
  if (left && right && left.version !== right.version) return { left, right };
  return { left: versions[versions.length - 2], right: versions[versions.length - 1] };
}
