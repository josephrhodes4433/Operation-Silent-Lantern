import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LanternWrittenHistoryEntry } from '@workspace/api-client-react';
import { groupWrittenVersions, resolveComparison } from './written-versions.ts';

function entry(id: number, version: number, event: LanternWrittenHistoryEntry['event'], extra: Partial<LanternWrittenHistoryEntry> = {}): LanternWrittenHistoryEntry {
  return {
    id, version, event, questionId: 1, value: `Response ${version}`, decision: 'pending', feedback: null, points: null,
    responseUpdatedAt: `2026-10-01T00:00:0${version}.000Z`,
    recordedAt: `2026-10-01T00:00:0${id}.000Z`, ...extra,
  };
}

test('multiple instructor decisions do not create revisions or alter response snapshots', () => {
  const versions = groupWrittenVersions([
    entry(3, 1, 'reviewed', { decision: 'approved', points: 5 }),
    entry(1, 1, 'submitted'),
    entry(2, 1, 'reviewed', { decision: 'denied', feedback: 'Revise' }),
  ]);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].snapshot.event, 'submitted');
  assert.deepEqual(versions[0].decisions.map(event => event.decision), ['denied', 'approved']);
  assert.equal(versions[0].latest.decision, 'approved');
  assert.equal(resolveComparison(versions, null), null);
});

test('default selects the latest two distinct versions; selected versions remain pinned during polling', () => {
  const versions = groupWrittenVersions([entry(1, 1, 'submitted'), entry(2, 2, 'submitted'), entry(3, 3, 'submitted')]);
  const pair = resolveComparison(versions, null)!;
  assert.deepEqual([pair.left.version, pair.right.version], [2, 3]);
  const refreshed = groupWrittenVersions([entry(1, 1, 'submitted'), entry(2, 2, 'submitted'), entry(3, 3, 'submitted'), entry(4, 4, 'submitted'), entry(5, 2, 'reviewed')]);
  const pinned = resolveComparison(refreshed, { left: 1, right: 2 })!;
  assert.deepEqual([pinned.left.version, pinned.right.version], [1, 2]);
  assert.equal(pinned.right.decisions.length, 1);
});

test('missing or same-version selections recover to a valid distinct pair; empty history is safe', () => {
  assert.equal(resolveComparison([], null), null);
  const versions = groupWrittenVersions([entry(1, 1, 'submitted'), entry(2, 3, 'submitted')]);
  for (const selection of [{ left: 1, right: 1 }, { left: 20, right: 3 }]) {
    const pair = resolveComparison(versions, selection)!;
    assert.deepEqual([pair.left.version, pair.right.version], [1, 3]);
  }
});

test('imported snapshots remain distinguishable and preserve exact text including blank and multiline responses', () => {
  const versions = groupWrittenVersions([
    entry(1, 1, 'imported', { value: '', decision: 'denied', feedback: 'Legacy feedback' }),
    entry(2, 2, 'submitted', { value: ' First line\n\nSecond line ' }),
    entry(3, 2, 'reviewed', { decision: 'approved', points: 0 }),
  ]);
  assert.equal(versions[0].imported, true);
  assert.equal(versions[0].decisions.length, 0);
  assert.equal(versions[0].snapshot.value, '');
  assert.equal(versions[1].snapshot.value, ' First line\n\nSecond line ');
  assert.equal(versions[1].latest.points, 0);
});
