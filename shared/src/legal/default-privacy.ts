import type { SiteConfig } from '../site/config';
import { joinList } from './join-list';
import type { LegalSection } from './sections';

function days(count: number): string {
  return count === 1 ? '1 day' : `${count} days`;
}

/**
 * The built-in privacy notice for these settings: it leaves out features that
 * are switched off and states the configured retention periods. Keep it in step
 * with the stored data and retention rules in docs/operations.md.
 */
export function defaultPrivacyNotice(config: SiteConfig): LegalSection[] {
  const { name, contactEmail, networkProviders } = config.site;
  const { feedback, issues, usageStats } = config.features;
  const agreements = config.legal.requireAgreement;
  const { inactiveRoomDays, usageRetentionDays } = config.limits;
  const places = feedback ? 'in rooms and on the feedback page' : 'in rooms';
  const roomWork = issues
    ? 'your current vote until the round ends, issues and estimates you add, and per-room statistics'
    : 'your current vote until the round ends, and per-room statistics';
  const issueRange = issues
    ? '; the site also keeps the lowest and highest votes for each issue, but not who cast them'
    : '';
  const deviceSettings = joinList([
    'your display name',
    ...(agreements ? ['the agreement version you accepted'] : []),
    'your character, throwable, and sound settings',
  ]);
  const retention = joinList([
    'Rate-limit counts are kept for 30 days',
    'abuse counters expire within days',
    ...(usageStats ? [`app-wide usage counts are kept for ${days(usageRetentionDays)}`] : []),
  ]);
  return [
    {
      heading: 'Who runs the site',
      paragraphs: [
        `${name} is a free planning poker tool. This copy is run by the person or organization you can reach at ${contactEmail} (the "site owner"). There are no accounts, ads, analytics, tracking pixels, or third-party scripts or fonts. Nothing is sold or shared for marketing.`,
        'The site runs on open-source software. The people who wrote that software do not run this copy and receive none of its data.',
      ],
    },
    {
      heading: 'What the site stores',
      paragraphs: [
        `A browser ID: a random identifier in a signed, HttpOnly cookie, so the site can recognise your browser ${places}. It is not linked to your real identity.`,
        `The display name you choose, and your room activity: which rooms you joined, whether you were approved or an observer, ${roomWork} such as votes cast, throws sent and received, streaks, characters used, your last known name, and when you last joined. The most recent revealed round, with each name and vote, is saved with the room until the next round starts${issueRange}.`,
        ...(agreements
          ? [
              'Agreement records: which version of the site use agreement you accepted, its text, and when.',
            ]
          : []),
        ...(feedback
          ? [
              'Feedback, replies, and reactions you submit. The site owner reviews each submission before it is published.',
            ]
          : []),
        'Abuse protection: your IP address is used to apply rate limits and daily budgets. It is stored only as a one-way hash inside daily counters. The site also counts how often your browser ID is rate limited.',
        ...(config.access.passwordProtects === 'nothing'
          ? []
          : [
              'If the site asks for a password, a signed cookie remembers for 30 days that your browser entered it. The password itself is not stored in your browser.',
            ]),
        ...(usageStats
          ? [
              'App-wide usage counts, such as how many rooms were created on a day. These carry no room, browser, or network identity.',
            ]
          : []),
      ],
    },
    {
      heading: 'What stays on your device',
      paragraphs: [
        `Your browser's local storage keeps ${deviceSettings}. The site receives your display name when you join a room and the throwables you use in it; the other settings stay in your browser. Clearing this site's data in your browser removes these settings and the browser ID cookie.`,
      ],
    },
    {
      heading: 'Why it is used',
      paragraphs: [
        `To run rooms${feedback ? ' and the feedback page' : ''}, keep the site secure, prevent abuse, and understand overall use so the site can be improved. Where privacy law asks for a legal basis, this is the site owner's legitimate interest in providing and protecting the site${feedback ? ', and for feedback, your choice to submit it' : ''}.`,
      ],
    },
    {
      heading: 'Who can see it',
      paragraphs: [
        `People in your room see your name, role, approval status, votes after they are revealed, throws, and room statistics.${feedback ? ' Published feedback and replies can be seen by other people who use the feedback page.' : ''} The site owner can see stored data through a private admin page.`,
        networkProviders.length > 0
          ? `Traffic reaches the site through ${joinList(networkProviders)}, which may log technical details such as IP addresses under their own privacy policies.`
          : 'Your browser connects directly to the server that runs the site; no outside network provider is involved.',
        'The site has no AI features and does not send your data to any AI provider.',
      ],
    },
    {
      heading: 'How long it is kept',
      paragraphs: [
        `Rooms, with their members, ${issues ? 'issues, ' : ''}approvals, and statistics, are deleted after ${days(inactiveRoomDays)} without activity. Join requests expire after 5 minutes, and people who leave are removed from the room after a 2-minute reconnect grace period.`,
        `${agreements ? `Agreement records not linked to a room or feedback are deleted after ${days(inactiveRoomDays)}. ` : ''}${retention}.`,
        ...(feedback
          ? [
              'Feedback and replies are kept until the site owner deletes them. If your browser ID is deleted, your feedback stays but is no longer linked to your browser.',
            ]
          : []),
      ],
    },
    {
      heading: 'Your choices and rights',
      paragraphs: [
        `You can ask to see, correct, or delete data linked to your browser ID by emailing ${contactEmail}. Include your display name and room so the request can be matched. Depending on where you live, you may also have the right to object to processing or to complain to your data protection authority.`,
      ],
    },
    {
      heading: 'Children',
      paragraphs: [
        'The site is not intended for children under 13 and does not knowingly collect their data.',
      ],
    },
    {
      heading: 'Changes',
      paragraphs: [
        'This notice may be updated as the site changes. The date above shows when it was last updated.',
      ],
    },
  ];
}
