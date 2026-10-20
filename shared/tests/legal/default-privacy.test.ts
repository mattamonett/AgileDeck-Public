import { defaultPrivacyNotice } from '../../src/legal/default-privacy';
import { legalSectionsText } from '../../src/legal/sections';
import { DEFAULT_SITE_CONFIG, SiteConfigSchema, type SiteConfigInput } from '../../src/site/config';

const config = (input: SiteConfigInput) => SiteConfigSchema.parse(input);
const text = (sections: readonly { heading: string; paragraphs: readonly string[] }[]) =>
  legalSectionsText(sections);

describe('privacy notice', () => {
  it('states the default retention and data', () => {
    const notice = text(defaultPrivacyNotice(DEFAULT_SITE_CONFIG));
    expect(notice).toContain('Agile Deck is a free planning poker tool');
    expect(notice).toContain('reach at admin@example.com');
    expect(notice).toContain('deleted after 90 days without activity');
    expect(notice).toContain(
      'Agreement records not linked to a room or feedback are deleted after 90 days.',
    );
    expect(notice).toContain(
      'Rate-limit counts are kept for 30 days, abuse counters expire within days, and app-wide usage counts are kept for 400 days.',
    );
    expect(notice).toContain('Agreement records: which version');
    expect(notice).toContain('Feedback, replies, and reactions you submit.');
    expect(notice).toContain('App-wide usage counts, such as');
    expect(notice).toContain('issues and estimates you add');
    expect(notice).toContain('lowest and highest votes for each issue');
    expect(notice).toContain(
      'keeps your display name, the agreement version you accepted, and your character',
    );
    expect(notice).toContain('no outside network provider is involved');
    expect(notice).not.toContain('password');
  });

  it('follows the configured retention periods', () => {
    const notice = text(
      defaultPrivacyNotice(config({ limits: { inactiveRoomDays: 1, usageRetentionDays: 30 } })),
    );
    expect(notice).toContain('deleted after 1 day without activity');
    expect(notice).toContain('app-wide usage counts are kept for 30 days');
  });

  it('leaves out switched-off features', () => {
    const notice = text(
      defaultPrivacyNotice(
        config({
          features: { feedback: false, issues: false, usageStats: false },
          legal: { requireAgreement: false },
        }),
      ),
    );
    expect(notice).not.toMatch(/feedback/i);
    expect(notice).not.toMatch(/issue/i);
    expect(notice).not.toMatch(/usage counts/i);
    expect(notice).not.toMatch(/agreement/i);
    expect(notice).toContain('recognise your browser in rooms.');
    expect(notice).toContain('your current vote until the round ends, and per-room statistics');
    expect(notice).toContain(
      'keeps your display name and your character, throwable, and sound settings.',
    );
    expect(notice).toContain(
      'Rate-limit counts are kept for 30 days and abuse counters expire within days.',
    );
    expect(notice).toContain('Rooms, with their members, approvals, and statistics');
    expect(notice).toContain('To run rooms, keep the site secure');
  });

  it('names network providers and the password cookie', () => {
    const one = text(
      defaultPrivacyNotice(
        config({
          site: { networkProviders: ['Cloudflare'] },
          access: { passwordProtects: 'everything' },
        }),
      ),
    );
    expect(one).toContain('Traffic reaches the site through Cloudflare, which may log');
    expect(one).toContain('remembers for 30 days that your browser entered it');
    const three = text(
      defaultPrivacyNotice(config({ site: { networkProviders: ['A', 'B', 'C'] } })),
    );
    expect(three).toContain('through A, B, and C, which');
  });
});
