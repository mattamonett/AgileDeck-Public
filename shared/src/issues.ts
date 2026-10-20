import { z } from 'zod';

export const ISSUE_PAGE_SIZE = 50;
/** Issues one import may add, children included. Larger boards can be imported in parts. */
export const ISSUE_IMPORT_LIMIT = 500;
/** Largest import body in bytes; 500 issues at the field limits fit well inside it. */
export const ISSUE_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const ISSUE_TEXT_LIMITS = {
  title: 200,
  url: 2048,
  issueNumber: 100,
} as const;
export enum IssueStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
}

export interface Issue {
  id: string;
  title: string;
  issueNumber?: string;
  url?: string;
  createdAt: string;
  lastModifiedAt?: string;
  status: IssueStatus;
  estimate: number | null;
  subIssues?: Issue[];
}
export interface IssuePage {
  issues: Issue[];
  nextCursor: string | null;
  activeIssue: Issue | null;
}

const fields = z.object({
  issueNumber: z.string().max(ISSUE_TEXT_LIMITS.issueNumber).trim().nullable().optional(),
  title: z.string().max(ISSUE_TEXT_LIMITS.title).trim().min(1),
  url: z
    .string()
    .max(ISSUE_TEXT_LIMITS.url)
    .trim()
    .refine((value) => {
      if (!value) return true;
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, 'Enter a complete http:// or https:// URL.'),
  status: z.enum(IssueStatus),
  estimate: z.number().finite().nullable(),
});
// Unknown fields (including all client timestamps) are discarded.
export const CreateIssueSchema = fields.extend({
  url: fields.shape.url.default(''),
  status: fields.shape.status.default(IssueStatus.OPEN),
  estimate: fields.shape.estimate.default(null),
  parentId: z.uuid().optional(),
});
export const UpdateIssueSchema = fields
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Supply at least one issue field.');
export const IssueAccessSchema = z.object({
  roomId: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9\s\-_]+$/),
  userId: z.uuid(),
});
export const IssueIdSchema = z.uuid();
export const IssueCursorSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});
export type CreateIssueInput = z.input<typeof CreateIssueSchema>;
export type UpdateIssueInput = z.infer<typeof UpdateIssueSchema>;

export interface TransferIssue {
  title: string;
  issueNumber?: string | null | undefined;
  url: string;
  status: IssueStatus;
  estimate: number | null;
  subIssues: TransferIssue[];
}

// Validate depth before entering the recursive schema, including hostile API input.
const transferIssue: z.ZodType<TransferIssue> = z.lazy(() =>
  CreateIssueSchema.omit({ parentId: true }).extend({
    subIssues: z.array(transferIssue).default([]),
  }),
);
export const ImportIssuesSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    const stack = [{ value, depth: 0 }];
    let count = 0;
    for (let item = stack.pop(); item; item = stack.pop()) {
      if (!Array.isArray(item.value)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Issues and subIssues must be arrays.',
        });
        return;
      }
      for (const issue of item.value) {
        if (++count > ISSUE_IMPORT_LIMIT || item.depth >= 20) {
          ctx.addIssue({
            code: 'custom',
            message: 'Import at most 500 issues at a time, with up to 20 nesting levels.',
          });
          return;
        }
        if (issue && typeof issue === 'object' && 'subIssues' in issue)
          stack.push({ value: issue.subIssues, depth: item.depth + 1 });
      }
    }
  })
  .pipe(z.array(transferIssue).min(1))
  .transform((issues) => {
    let activePath: TransferIssue[] = [];
    const visit = (items: TransferIssue[], parents: TransferIssue[]) => {
      for (const issue of items) {
        const path = [...parents, issue];
        if (issue.status === IssueStatus.IN_PROGRESS) activePath = path;
        visit(issue.subIssues, path);
      }
    };
    visit(issues, []);
    const normalize = (items: TransferIssue[]) => {
      for (const issue of items) {
        if (activePath.includes(issue)) issue.status = IssueStatus.IN_PROGRESS;
        else if (issue.status === IssueStatus.IN_PROGRESS) issue.status = IssueStatus.OPEN;
        normalize(issue.subIssues);
      }
    };
    normalize(issues);
    return issues;
  });

export function toTransferIssues(issues: Issue[]): TransferIssue[] {
  return issues.map((issue) => ({
    title: issue.title,
    ...(issue.issueNumber ? { issueNumber: issue.issueNumber } : {}),
    url: issue.url ?? '',
    status: issue.status,
    estimate: issue.estimate,
    subIssues: toTransferIssues(issue.subIssues ?? []),
  }));
}

/** Server-owned issue metadata is validated separately from editable fields. */
export const IssueSchema: z.ZodType<Issue> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      title: z.string(),
      issueNumber: z.string().optional(),
      url: fields.shape.url.optional(),
      createdAt: z.iso.datetime(),
      lastModifiedAt: z.iso.datetime().optional(),
      status: z.enum(IssueStatus),
      estimate: z.number().finite().nullable(),
      subIssues: z.array(IssueSchema).optional(),
    })
    .transform(({ issueNumber, url, lastModifiedAt, subIssues, ...issue }) => ({
      ...issue,
      ...(issueNumber !== undefined ? { issueNumber } : {}),
      ...(url !== undefined ? { url } : {}),
      ...(lastModifiedAt !== undefined ? { lastModifiedAt } : {}),
      ...(subIssues !== undefined ? { subIssues } : {}),
    })),
);

export const IssueListSchema = z.array(IssueSchema);
export const IssuePageSchema = z.object({
  issues: IssueListSchema,
  nextCursor: z.string().nullable(),
  activeIssue: IssueSchema.nullable(),
});
export const ImportIssuesResultSchema = z.object({
  count: z.number().int().nonnegative(),
});
/** Closed issues that would be (or were) deleted by clearing closed issues. */
export const ClosedIssuesResultSchema = ImportIssuesResultSchema;
