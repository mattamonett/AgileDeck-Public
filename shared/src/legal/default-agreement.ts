import type { SiteConfig } from '../site/config';
import { joinList } from './join-list';
import type { LegalSection } from './sections';

/**
 * The built-in site use agreement for these settings. People accept the joined
 * text; the API derives the agreement version from it, so any change to the
 * wording or to the settings it mentions asks visitors to accept again.
 */
export function defaultSiteAgreement(config: SiteConfig): LegalSection[] {
  const { name, contactEmail, governingLaw } = config.site;
  const { feedback, issues } = config.features;
  const required = config.legal.requireAgreement;
  const content = joinList([
    'names',
    'room names',
    ...(issues ? ['issues'] : []),
    ...(feedback ? ['feedback', 'replies'] : []),
  ]);
  return [
    {
      heading: 'About this agreement',
      paragraphs: [
        `${name} (the "site") is a free planning poker tool. This copy is run by the person or organization named in the contact details below (the "site owner"). ${
          required
            ? 'By checking the agreement box you accept these terms.'
            : 'By using the site you accept these terms.'
        } If you do not accept them, do not use the site.`,
        'You must be at least 13 years old to use the site.',
        'The site runs on open-source software. The people who wrote that software do not run this copy, are not a party to these terms, and are not responsible for it.',
      ],
    },
    {
      heading: 'Acceptable use',
      paragraphs: [
        "Do not use the site to post or share anything unlawful, harassing, hateful, threatening, sexually explicit, or that infringes someone else's rights. Do not impersonate other people or post anyone's personal or confidential information.",
        'Do not attack, overload, scrape, or probe the site, get around its limits or access controls, or use automated tools beyond ordinary use.',
      ],
    },
    {
      heading: 'Your content',
      paragraphs: [
        `You keep ownership of what you enter, such as ${content}. You give the site owner a non-exclusive, worldwide, royalty-free permission to store, copy, display, and process it as needed to run and improve the site.`,
        ...(feedback
          ? [
              'Published feedback and replies can be seen by other people who use the site. If you send ideas or suggestions, the site owner may use them freely without payment or any other obligation to you.',
            ]
          : []),
      ],
    },
    {
      heading: 'Moderation and removal',
      paragraphs: [
        "The site owner may review, refuse, edit out, or remove content, delete rooms, or limit or end anyone's access at any time and for any reason. The site owner has no duty to monitor content.",
        `To report content that infringes your copyright or breaks these terms, email ${contactEmail}.`,
      ],
    },
    {
      heading: 'Privacy',
      paragraphs: [
        'The privacy notice explains what the site stores, why, and for how long. It is part of these terms.',
      ],
    },
    {
      heading: 'No warranty',
      paragraphs: [
        'The site is provided "as is" and "as available", without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. There is no promise that it will be available, accurate, secure, or error-free. Features may change or stop, and data may be lost; export anything you want to keep.',
        'You use the site at your own risk and are responsible for decisions you make using it, including decisions based on estimates.',
      ],
    },
    {
      heading: 'Release and limitation of liability',
      paragraphs: [
        'To the extent permitted by applicable law, you release the site owner from claims or losses arising from ordinary negligence in your use of the site, including interruptions, lost data, and reliance on estimates.',
        "To the extent permitted by applicable law, the site owner is not liable for any indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, data, or goodwill, and the site owner's total liability for all claims relating to the site is limited to US$50.",
        'This release and these limits do not apply to fraud, willful misconduct, gross negligence, violations of law, or any rights or remedies that cannot legally be waived or limited.',
      ],
    },
    {
      heading: 'Responsibility for misuse',
      paragraphs: [
        "To the extent permitted by applicable law, you agree to cover the site owner's reasonable losses and costs from third-party claims caused by your content or by your breach of these terms.",
      ],
    },
    {
      heading: 'Governing law',
      paragraphs: [
        `These terms are governed by the laws of ${governingLaw}, without regard to conflict-of-law rules, and disputes will be resolved in the courts located there. This does not take away any protection you have under the mandatory laws of the country where you live.`,
        'If any part of these terms cannot be enforced, the rest still applies.',
      ],
    },
    {
      heading: 'Changes and contact',
      paragraphs: [
        required
          ? 'The site owner may update these terms. When they change, the site will ask you to accept the new version before you continue.'
          : 'The site owner may update these terms. Using the site after they change means you accept the new version.',
        `Questions about these terms: ${contactEmail}.`,
      ],
    },
  ];
}
