import { defaultSiteAgreement } from '../../src/legal/default-agreement';
import { legalSectionsText } from '../../src/legal/sections';
import { DEFAULT_SITE_CONFIG, SiteConfigSchema, type SiteConfigInput } from '../../src/site/config';

const config = (input: SiteConfigInput) => SiteConfigSchema.parse(input);
const text = (sections: readonly { heading: string; paragraphs: readonly string[] }[]) =>
  legalSectionsText(sections);

describe('site use agreement', () => {
  it('names the site, contact and governing law from the settings', () => {
    const agreement = text(
      defaultSiteAgreement(
        config({
          site: {
            name: 'Team Poker',
            contactEmail: 'legal@team.example',
            governingLaw: 'England and Wales',
          },
        }),
      ),
    );
    expect(agreement).toContain('Team Poker (the "site")');
    expect(agreement).toContain('email legal@team.example.');
    expect(agreement).toContain('governed by the laws of England and Wales');
    expect(agreement).not.toContain('Agile Deck');
  });

  it('asks for the checkbox only when agreements are required', () => {
    const required = text(defaultSiteAgreement(DEFAULT_SITE_CONFIG));
    expect(required).toContain('By checking the agreement box you accept these terms.');
    expect(required).toContain('the site will ask you to accept the new version');
    const optional = text(defaultSiteAgreement(config({ legal: { requireAgreement: false } })));
    expect(optional).toContain('By using the site you accept these terms.');
    expect(optional).toContain(
      'Using the site after they change means you accept the new version.',
    );
    expect(optional).not.toContain('checking the agreement box');
  });

  it('mentions issues and feedback only when they are on', () => {
    expect(text(defaultSiteAgreement(DEFAULT_SITE_CONFIG))).toContain(
      'such as names, room names, issues, feedback, and replies.',
    );
    const off = text(
      defaultSiteAgreement(config({ features: { feedback: false, issues: false } })),
    );
    expect(off).toContain('such as names and room names.');
    expect(off).not.toContain('Published feedback');
  });
});
