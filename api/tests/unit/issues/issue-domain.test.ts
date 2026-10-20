import type { Issue as StoredIssue } from '@prisma/client';
import { IssueStatus } from '@poker/shared';
import { buildIssueTree, parseIssueStatus } from '../../../src/modules/issues/issue-tree';
import { computeStatusUpdates } from '../../../src/modules/issues/issue-status';
import { findRemovableClosedIssues } from '../../../src/modules/issues/closed-issues';

function issue(
  id: string,
  parentId: string | null = null,
  status: IssueStatus = IssueStatus.OPEN,
): StoredIssue {
  return {
    id,
    parentId,
    rootId: parentId ?? id,
    roomId: 'room',
    title: id,
    issueNumber: null,
    url: null,
    status,
    estimate: null,
    createdAt: new Date('2026-09-21T00:00:00Z'),
    lastModifiedAt: new Date('2026-09-21T00:00:00Z'),
    firstVoteMin: null,
    firstVoteMax: null,
    latestVoteMin: null,
    latestVoteMax: null,
    firstVoteSpread: 0,
    spreadReduction: 0,
  };
}

describe('issue domain rules', () => {
  it('validates persisted status instead of casting arbitrary text to the enum', () => {
    for (const status of Object.values(IssueStatus)) expect(parseIssueStatus(status)).toBe(status);
    expect(() => parseIssueStatus('corrupt')).toThrow('Invalid persisted issue status');
  });
  it('builds a tree even when children precede parents', () => {
    const tree = buildIssueTree([issue('child', 'root'), issue('root')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.subIssues?.[0]?.id).toBe('child');
    expect(tree[0]?.createdAt).toBe('2026-09-21T00:00:00.000Z');
  });
  it('activates one branch and reopens unrelated active issues', () => {
    const updates = computeStatusUpdates(
      [issue('root'), issue('child', 'root'), issue('other', null, IssueStatus.IN_PROGRESS)],
      'child',
      IssueStatus.IN_PROGRESS,
    );
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 'child', status: IssueStatus.IN_PROGRESS },
        { id: 'root', status: IssueStatus.IN_PROGRESS },
        { id: 'other', status: IssueStatus.OPEN },
      ]),
    );
  });

  it('removes whole closed branches and keeps closed parents of open work', () => {
    const { CLOSED, OPEN, IN_PROGRESS } = IssueStatus;
    const { roots, count } = findRemovableClosedIssues([
      issue('done', null, CLOSED),
      issue('done-child', 'done', CLOSED),
      issue('done-grandchild', 'done-child', CLOSED),
      issue('mixed', null, CLOSED),
      issue('mixed-open', 'mixed', OPEN),
      issue('mixed-done', 'mixed', CLOSED),
      issue('mixed-done-child', 'mixed-done', CLOSED),
      issue('active', null, IN_PROGRESS),
      issue('active-done', 'active', CLOSED),
      issue('open', null, OPEN),
    ]);
    expect(roots.map(({ id }) => id).sort()).toEqual(['active-done', 'done', 'mixed-done'].sort());
    expect(count).toBe(6);
  });
});
