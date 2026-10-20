import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agreementVersionOf, legalSetupWarnings } from '../../../src/config/legal-text';
import {
  getPublicSiteConfig,
  getSiteAgreement,
  getSiteConfig,
  loadSiteConfig,
  setSiteConfig,
  siteConfigDirectory,
  SiteConfigError,
} from '../../../src/config/site-config';

describe('site config loading', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'site-config-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    setSiteConfig();
    delete process.env.SITE_CONFIG_DIR;
    delete process.env.SITE_PASSWORD;
  });

  const writeSettings = (settings: object) =>
    fs.writeFileSync(path.join(directory, 'site.json'), JSON.stringify(settings));

  it('uses every default when there is no site.json', () => {
    const config = loadSiteConfig(directory);
    expect(config.content.defaultMood).toBe('playful');
    expect(getPublicSiteConfig().site.name).toBe('Agile Deck');
  });

  it('applies the settings in site.json', () => {
    fs.writeFileSync(
      path.join(directory, 'site.json'),
      JSON.stringify({
        site: { name: 'Team Poker' },
        content: { moods: ['friendly'], defaultMood: 'friendly' },
      }),
    );
    loadSiteConfig(directory);
    expect(getSiteConfig().content.moods).toEqual(['friendly']);
    expect(getPublicSiteConfig().site.name).toBe('Team Poker');
  });

  it('refuses to start with a file that is not JSON', () => {
    fs.writeFileSync(path.join(directory, 'site.json'), '{ nope');
    expect(() => loadSiteConfig(directory)).toThrow(SiteConfigError);
    expect(() => loadSiteConfig(directory)).toThrow(/is not valid JSON/);
  });

  it('names each invalid setting', () => {
    fs.writeFileSync(
      path.join(directory, 'site.json'),
      JSON.stringify({ content: { moods: ['friendly'] }, extra: 1 }),
    );
    expect(() => loadSiteConfig(directory)).toThrow(
      /content\.defaultMood: defaultMood must be one of moods/,
    );
    expect(() => loadSiteConfig(directory)).toThrow(/\(top level\): Unrecognized key/);
  });

  it('reads the folder from SITE_CONFIG_DIR, else config/ beside api/', () => {
    expect(siteConfigDirectory()).toBe(path.resolve(process.cwd(), '..', 'config'));
    process.env.SITE_CONFIG_DIR = directory;
    expect(siteConfigDirectory()).toBe(directory);
  });

  it('builds the built-in legal text from the settings', () => {
    writeSettings({
      site: { name: 'Team Poker', networkProviders: ['Cloudflare'] },
      limits: { inactiveRoomDays: 30 },
    });
    loadSiteConfig(directory);
    const legal = getPublicSiteConfig().legal;
    expect(legal.terms[0]?.paragraphs[0]).toContain('Team Poker (the "site")');
    expect(JSON.stringify(legal.privacy)).toContain('through Cloudflare');
    expect(JSON.stringify(legal.privacy)).toContain('after 30 days');
    expect(legal.termsUpdated).toBe('October 15, 2026');
    expect(legal.privacyUpdated).toBe('October 15, 2026');
  });

  it('derives the agreement version from the text people accept', () => {
    setSiteConfig();
    const first = getSiteAgreement();
    expect(first.version).toMatch(/^[0-9a-f]{16}$/);
    expect(first.version).toBe(agreementVersionOf(first.text));
    expect(getPublicSiteConfig().legal.agreementVersion).toBe(first.version);
    expect(first.text).toContain('About this agreement\nAgile Deck (the "site")');
    // The privacy notice and the date are not part of the agreement.
    setSiteConfig({
      features: { usageStats: false },
      legal: { updated: 'May 1' },
    });
    expect(getSiteAgreement()).toEqual(first);
    expect(getPublicSiteConfig().legal.termsUpdated).toBe('May 1');
    setSiteConfig({ site: { contactEmail: 'owner@team.example' } });
    expect(getSiteAgreement().version).not.toBe(first.version);
    expect(getSiteAgreement().text).toContain('owner@team.example');
  });

  it('reads custom terms and privacy files from the config folder', () => {
    fs.writeFileSync(
      path.join(directory, 'terms.md'),
      '## Rules\nBe kind on {{siteName}}.\n\nWrite to {{contactEmail}}.\n',
    );
    fs.writeFileSync(path.join(directory, 'privacy.txt'), 'We keep nothing.');
    writeSettings({
      site: { name: 'Team Poker', contactEmail: 'owner@team.example' },
      legal: {
        termsFile: 'terms.md',
        privacyFile: 'privacy.txt',
        updated: '1 May 2027',
      },
    });
    loadSiteConfig(directory);
    const legal = getPublicSiteConfig().legal;
    expect(legal.terms).toEqual([
      {
        heading: 'Rules',
        paragraphs: ['Be kind on Team Poker.', 'Write to owner@team.example.'],
      },
    ]);
    expect(legal.privacy).toEqual([{ heading: '', paragraphs: ['We keep nothing.'] }]);
    expect(legal.termsUpdated).toBe('1 May 2027');
    expect(legal.privacyUpdated).toBe('1 May 2027');
    expect(getSiteAgreement().text).toBe(
      'Rules\nBe kind on Team Poker.\nWrite to owner@team.example.',
    );
    expect(legal.agreementVersion).toBe(agreementVersionOf(getSiteAgreement().text));
  });

  it('accepts the example terms file shipped in config/', () => {
    fs.copyFileSync(
      path.resolve(__dirname, '../../../../config/terms.example.md'),
      path.join(directory, 'terms.md'),
    );
    writeSettings({ legal: { termsFile: 'terms.md' } });
    loadSiteConfig(directory);
    expect(getPublicSiteConfig().legal.terms.map((s) => s.heading)).toEqual([
      '',
      'How this file is read',
      'Using the site',
      'Contact',
    ]);
  });

  it.each([
    ['a missing file', null, /legal\.termsFile: cannot use .*terms\.md: the file does not exist/],
    ['an empty file', '\n  \n', /legal\.termsFile: .*terms\.md: The file has no text/],
    ['an unknown placeholder', '{{owner}}', /Unknown placeholder \{\{owner\}\}/],
    ['a file over 100 KB', 'x'.repeat(100 * 1024 + 1), /larger than 100 KB/],
  ])('refuses to start with %s', (_name, content, message) => {
    if (content !== null) fs.writeFileSync(path.join(directory, 'terms.md'), content);
    writeSettings({ legal: { termsFile: 'terms.md' } });
    expect(() => loadSiteConfig(directory)).toThrow(SiteConfigError);
    expect(() => loadSiteConfig(directory)).toThrow(message);
  });

  it('refuses a folder in place of a legal file', () => {
    fs.mkdirSync(path.join(directory, 'privacy.md'));
    writeSettings({ legal: { privacyFile: 'privacy.md' } });
    expect(() => loadSiteConfig(directory)).toThrow(
      /legal\.privacyFile: cannot use .*privacy\.md: it is not a file/,
    );
  });

  it('needs a config folder for legal files', () => {
    expect(() => setSiteConfig({ legal: { termsFile: 'terms.md' } })).toThrow(
      'legal.termsFile needs a config folder to read terms.md from',
    );
  });

  it('needs SITE_PASSWORD of at least 8 characters when a password protects anything', () => {
    writeSettings({ access: { passwordProtects: 'room-creation' } });
    expect(() => loadSiteConfig(directory)).toThrow(
      /set the SITE_PASSWORD environment variable to at least 8 characters/,
    );
    process.env.SITE_PASSWORD = 'seven77';
    expect(() => loadSiteConfig(directory)).toThrow(SiteConfigError);
    process.env.SITE_PASSWORD = 'eight888';
    expect(loadSiteConfig(directory).access.passwordProtects).toBe('room-creation');
    expect(getPublicSiteConfig().access.passwordProtects).toBe('room-creation');
    expect(JSON.stringify(getPublicSiteConfig())).not.toContain('eight888');
    delete process.env.SITE_PASSWORD;
    writeSettings({ access: { passwordProtects: 'nothing' } });
    expect(loadSiteConfig(directory).access.passwordProtects).toBe('nothing');
  });
});

describe('legal setup warnings', () => {
  afterEach(() => setSiteConfig());

  it('flags the placeholder contact and governing law', () => {
    const warnings = legalSetupWarnings(setSiteConfig());
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('site.contactEmail');
    expect(warnings[1]).toContain('site.governingLaw');
  });

  it('is quiet once the operator fills them in', () => {
    const config = setSiteConfig({
      site: { contactEmail: 'owner@team.example', governingLaw: 'England and Wales' },
    });
    expect(legalSetupWarnings(config)).toEqual([]);
  });
});
