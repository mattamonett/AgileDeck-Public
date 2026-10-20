import { DEFAULT_SITE_CONFIG } from '../../src/site/config';
import { PublicSiteConfigSchema, toPublicSiteConfig } from '../../src/site/public-config';

describe('public site config', () => {
  it('builds the public settings the browser receives', () => {
    const publicConfig = toPublicSiteConfig(DEFAULT_SITE_CONFIG, {
      agreementVersion: 'abc',
      termsUpdated: 'Today',
      terms: [{ heading: 'Terms', paragraphs: ['One'] }],
      privacyUpdated: 'Yesterday',
      privacy: [{ heading: 'Privacy', paragraphs: ['Two'] }],
    });
    expect(PublicSiteConfigSchema.parse(publicConfig)).toEqual(publicConfig);
    expect(publicConfig.site).toEqual({ name: 'Agile Deck', contactEmail: 'admin@example.com' });
    expect(publicConfig.limits).toEqual({ maxUsersPerRoom: 25 });
    expect(publicConfig.legal.agreementVersion).toBe('abc');
    expect(publicConfig).not.toHaveProperty('site.governingLaw');
  });
});
