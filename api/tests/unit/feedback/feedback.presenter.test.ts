import { categoryCounts, voteStates } from '../../../src/modules/feedback/feedback.presenter';

describe('feedback view mapping', () => {
  it('counts known categories and ignores retired ones', () => {
    expect(
      categoryCounts([
        { category: 'bug', count: 3 },
        { category: 'general', count: 1 },
        { category: 'retired', count: 9 },
      ]),
    ).toEqual({
      general: 1,
      bug: 3,
      feature_request: 0,
      new_character_request: 0,
    });
  });

  it('builds vote totals and the viewer vote for requested items only', () => {
    const states = voteStates(['a', 'b'], {
      counts: [
        { feedbackId: 'a', reaction: 'agree', count: 2n },
        { feedbackId: 'a', reaction: 'unknown', count: 5n },
        { feedbackId: 'other', reaction: 'agree', count: 1n },
      ],
      own: [
        { feedbackId: 'a', reaction: 'agree' },
        { feedbackId: 'b', reaction: 'bogus' },
      ],
    });
    expect([...states.keys()]).toEqual(['a', 'b']);
    expect(states.get('a')).toEqual({
      voteCounts: {
        agree: 2,
        disagree: 0,
        seen_too: 0,
        would_use: 0,
        not_for_me: 0,
        would_throw: 0,
      },
      userVote: 'agree',
    });
    expect(states.get('b')?.userVote).toBeNull();
  });
});
