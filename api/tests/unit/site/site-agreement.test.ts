import { getSiteAgreement, setSiteConfig } from '../../../src/config/site-config';
import {
  acceptsCurrentAgreement,
  agreementRecord,
  requiredAgreement,
} from '../../../src/modules/site/site-agreement';

describe('site agreement', () => {
  afterEach(() => setSiteConfig());

  it('requires the current version, accepted, when the site asks for one', () => {
    setSiteConfig({ legal: { requireAgreement: true } });
    const { version } = getSiteAgreement();

    expect(acceptsCurrentAgreement({ version, accepted: true })).toBe(true);
    expect(acceptsCurrentAgreement({ version, accepted: false })).toBe(false);
    expect(acceptsCurrentAgreement({ version: 'old', accepted: true })).toBe(false);
    expect(acceptsCurrentAgreement(undefined)).toBe(false);
    expect(requiredAgreement()).toEqual(getSiteAgreement());
  });

  it('ignores acceptance when the site asks for none', () => {
    setSiteConfig({ legal: { requireAgreement: false } });

    expect(acceptsCurrentAgreement(undefined)).toBe(true);
    expect(requiredAgreement()).toBeNull();
  });

  it('records the accepted version, its text and when', () => {
    const before = Date.now();
    const record = agreementRecord({ version: 'v1', text: 'Be kind.' });

    expect(record).toMatchObject({
      agreementVersion: 'v1',
      agreementText: 'Be kind.',
    });
    expect(record.agreementAcceptedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
