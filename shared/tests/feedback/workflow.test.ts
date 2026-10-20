import { FeedbackWorkflowSchema, UpdateFeedbackWorkflowSchema } from '../../src/feedback/workflow';

describe('feedback workflow', () => {
  it('requires a closure reason and rejects resolution data on open feedback', () => {
    const workflow = {
      workflowStatus: 'new',
      resolutionReason: null,
      resolutionNote: null,
      duplicateOfId: null,
    };
    expect(FeedbackWorkflowSchema.parse(workflow)).toEqual(workflow);
    expect(
      UpdateFeedbackWorkflowSchema.safeParse({
        previous: workflow,
        next: workflow,
      }).success,
    ).toBe(true);
    expect(
      UpdateFeedbackWorkflowSchema.safeParse({
        previous: workflow,
        next: {
          ...workflow,
          workflowStatus: 'closed',
          resolutionReason: 'duplicate',
        },
      }).success,
    ).toBe(false);
    expect(
      UpdateFeedbackWorkflowSchema.safeParse({
        previous: workflow,
        next: {
          ...workflow,
          workflowStatus: 'closed',
          resolutionReason: 'duplicate',
          duplicateOfId: '10000000-0000-4000-8000-000000000001',
        },
      }).success,
    ).toBe(true);
    expect(
      FeedbackWorkflowSchema.safeParse({
        ...workflow,
        workflowStatus: 'under_review',
      }).success,
    ).toBe(true);
    for (const resolutionReason of [
      'implemented',
      'fixed',
      'duplicate',
      'not_planned',
      'unable_to_reproduce',
    ]) {
      expect(
        FeedbackWorkflowSchema.safeParse({
          ...workflow,
          workflowStatus: 'closed',
          resolutionReason,
        }).success,
      ).toBe(true);
    }
    for (const invalid of [
      { ...workflow, workflowStatus: 'closed' },
      { ...workflow, resolutionReason: 'fixed' },
      { ...workflow, resolutionNote: 'Already done' },
      { ...workflow, duplicateOfId: '10000000-0000-4000-8000-000000000001' },
      { ...workflow, workflowStatus: 'triaged' },
      { ...workflow, workflowStatus: 'closed', resolutionReason: 'other' },
    ])
      expect(FeedbackWorkflowSchema.safeParse(invalid).success).toBe(false);
  });
});
