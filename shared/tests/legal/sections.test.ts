import { LegalTextError, legalSectionsText, parseLegalText } from '../../src/legal/sections';
import { SiteConfigSchema, type SiteConfigInput } from '../../src/site/config';

const config = (input: SiteConfigInput) => SiteConfigSchema.parse(input);

describe('custom legal files', () => {
  const site = config({
    site: { name: 'Team Poker', contactEmail: 'a@b.example', governingLaw: 'Ohio' },
  });

  it('splits headings and paragraphs and fills placeholders', () => {
    const sections = parseLegalText(
      '﻿Intro for {{siteName}}.\r\n\r\n## First  \nLine one\n  line two\n\n\nSecond {{ contactEmail }}\n##\nUnder an empty heading\n## Law\nGoverned by {{governingLaw}}.\n### not a heading\n##not either\n## Empty\n',
      site,
    );
    expect(sections).toEqual([
      { heading: '', paragraphs: ['Intro for Team Poker.'] },
      { heading: 'First', paragraphs: ['Line one\nline two', 'Second a@b.example'] },
      { heading: '', paragraphs: ['Under an empty heading'] },
      {
        heading: 'Law',
        paragraphs: ['Governed by Ohio.\n### not a heading\n##not either'],
      },
      { heading: 'Empty', paragraphs: [] },
    ]);
    expect(legalSectionsText(sections)).toBe(
      'Intro for Team Poker.\n\nFirst\nLine one\nline two\nSecond a@b.example\n\nUnder an empty heading\n\nLaw\nGoverned by Ohio.\n### not a heading\n##not either\n\nEmpty',
    );
  });

  it('keeps markup as text', () => {
    expect(parseLegalText('<b>bold</b> **x**', site)).toEqual([
      { heading: '', paragraphs: ['<b>bold</b> **x**'] },
    ]);
  });

  it('rejects an empty file', () => {
    expect(() => parseLegalText(' \n\n##\n', site)).toThrow(LegalTextError);
    expect(() => parseLegalText('', site)).toThrow('The file has no text');
  });

  it('rejects unknown placeholders', () => {
    expect(() => parseLegalText('Hi {{ownerName}}', site)).toThrow(
      'Unknown placeholder {{ownerName}}; use {{siteName}}, {{contactEmail}} or {{governingLaw}}',
    );
  });
});
