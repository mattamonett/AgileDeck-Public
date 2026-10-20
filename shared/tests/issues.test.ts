import {
  CreateIssueSchema,
  ImportIssuesSchema,
  UpdateIssueSchema,
  IssueAccessSchema,
  IssueCursorSchema,
  ISSUE_PAGE_SIZE,
  IssueStatus,
  IssuePageSchema,
  ImportIssuesResultSchema,
  toTransferIssues,
} from '../src/issues';

describe('issue contracts', () => {
  it('accepts optional external numbers as text with a 100-character limit', () => {
    for (const issueNumber of ['001234', 'TASK-123', 'x'.repeat(100), '', null]) {
      expect(CreateIssueSchema.safeParse({ title: 'Issue', issueNumber }).success).toBe(true);
      expect(UpdateIssueSchema.safeParse({ issueNumber }).success).toBe(true);
    }
    expect(UpdateIssueSchema.parse({ issueNumber: ' TASK-123 ' })).toEqual({
      issueNumber: 'TASK-123',
    });
    for (const issueNumber of ['x'.repeat(101), 123]) {
      expect(CreateIssueSchema.safeParse({ title: 'Issue', issueNumber }).success).toBe(false);
      expect(UpdateIssueSchema.safeParse({ issueNumber }).success).toBe(false);
    }
  });
  it('defaults create fields, trims input and strips client-owned timestamps and ids', () => {
    expect(
      CreateIssueSchema.parse({
        title: ' Backlog ',
        id: 'client-id',
        createdAt: '1900-01-01',
        lastModifiedAt: '1900-01-01',
      }),
    ).toEqual({
      title: 'Backlog',
      url: '',
      status: IssueStatus.OPEN,
      estimate: null,
    });
    expect(ISSUE_PAGE_SIZE).toBe(50);
    expect(UpdateIssueSchema.parse({ estimate: 0, createdAt: '1900-01-01' })).toEqual({
      estimate: 0,
    });
    expect(UpdateIssueSchema.safeParse({ lastModifiedAt: '1900-01-01' }).success).toBe(false);
  });
  it('accepts safe links and rejects malicious or invalid fields', () => {
    for (const url of ['', 'https://example.com', 'http://example.com'])
      expect(CreateIssueSchema.safeParse({ title: 'Valid', url }).success).toBe(true);
    for (const fields of [
      { url: 'javascript:alert(1)' },
      { url: 'broken URL' },
      { title: ' ' },
      { title: 'a'.repeat(201) },
      { url: 'https://example.com/' + 'a'.repeat(2048) },
      { estimate: Infinity },
      { estimate: '3' },
      { status: 'unknown' },
      { parentId: 'bad-id' },
    ])
      expect(CreateIssueSchema.safeParse({ title: 'Valid', ...fields }).success).toBe(false);
    expect(UpdateIssueSchema.parse({ url: '', estimate: null })).toEqual({
      url: '',
      estimate: null,
    });
  });
  it('requires bounded room ids, UUID user ids and UTC page cursors', () => {
    const id = '10000000-0000-4000-8000-000000000001';
    expect(IssueAccessSchema.safeParse({ roomId: 'room-a', userId: id }).success).toBe(true);
    expect(IssueAccessSchema.safeParse({ roomId: 'room-a' }).success).toBe(false);
    expect(IssueAccessSchema.safeParse({ roomId: '../room', userId: id }).success).toBe(false);
    expect(IssueCursorSchema.safeParse({ id, createdAt: '2026-09-16T00:00:00.000Z' }).success).toBe(
      true,
    );
    expect(IssueCursorSchema.safeParse({ id, createdAt: '2026-09-16T00:00:00' }).success).toBe(
      false,
    );
  });
});

describe('issue import contract', () => {
  it('validates every child, defaults fields and strips server metadata', () => {
    const issues = ImportIssuesSchema.parse([
      {
        title: ' Parent ',
        id: 'old',
        subIssues: [{ title: 'Child', createdAt: 'old' }],
      },
    ]);
    expect(issues[0]).toEqual({
      title: 'Parent',
      url: '',
      status: 'open',
      estimate: null,
      subIssues: [
        {
          title: 'Child',
          url: '',
          status: 'open',
          estimate: null,
          subIssues: [],
        },
      ],
    });
    expect(
      ImportIssuesSchema.safeParse([
        {
          title: 'Good',
          subIssues: [{ title: 'Bad', url: 'javascript:alert(1)' }],
        },
      ]).success,
    ).toBe(false);
  });
  it('bounds depth and count before recursive parsing', () => {
    let tree: unknown[] = [{ title: 'Leaf' }];
    for (let i = 1; i < 20; i++) tree = [{ title: 'Parent', subIssues: tree }];
    expect(ImportIssuesSchema.safeParse(tree).success).toBe(true);
    expect(ImportIssuesSchema.safeParse([{ title: 'Too deep', subIssues: tree }]).success).toBe(
      false,
    );
    expect(
      ImportIssuesSchema.safeParse(Array.from({ length: 5001 }, () => ({ title: 'Issue' })))
        .success,
    ).toBe(false);
    expect(ImportIssuesSchema.safeParse([]).success).toBe(false);
  });
  it('normalizes active statuses to the last active branch and its ancestors', () => {
    const issues = ImportIssuesSchema.parse([
      { title: 'Old', status: 'in_progress' },
      {
        title: 'Parent',
        status: 'closed',
        subIssues: [{ title: 'Active', status: 'in_progress' }],
      },
    ]);
    expect(issues.map((issue) => issue.status)).toEqual(['open', 'in_progress']);
    expect(issues[1]?.subIssues[0]?.status).toBe('in_progress');
  });
});

describe('issue response and transfer boundaries', () => {
  it.each([null, {}, { issues: [] }, [{ title: 'Bad', subIssues: null }], [null], [42]])(
    'rejects malformed imports %j',
    (value) => {
      expect(ImportIssuesSchema.safeParse(value).success).toBe(false);
    },
  );

  it('serializes nested issues without server-owned fields and validates responses', () => {
    const leaf = {
      id: 'leaf',
      title: 'Child',
      status: IssueStatus.OPEN,
      estimate: 0,
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const parent = {
      ...leaf,
      id: 'parent',
      issueNumber: '001',
      url: 'https://example.com',
      lastModifiedAt: leaf.createdAt,
      subIssues: [leaf],
    };
    expect(toTransferIssues([parent])).toEqual([
      {
        title: 'Child',
        issueNumber: '001',
        url: 'https://example.com',
        status: IssueStatus.OPEN,
        estimate: 0,
        subIssues: [
          {
            title: 'Child',
            url: '',
            status: IssueStatus.OPEN,
            estimate: 0,
            subIssues: [],
          },
        ],
      },
    ]);
    expect(toTransferIssues([])).toEqual([]);
    const page = { issues: [parent], activeIssue: leaf, nextCursor: null };
    expect(IssuePageSchema.parse(page)).toEqual(page);
    expect(
      IssuePageSchema.safeParse({
        ...page,
        issues: [{ ...leaf, status: 'other' }],
      }).success,
    ).toBe(false);
    expect(ImportIssuesResultSchema.parse({ count: 0 })).toEqual({ count: 0 });
    expect(ImportIssuesResultSchema.safeParse({ count: -1 }).success).toBe(false);
  });
});
