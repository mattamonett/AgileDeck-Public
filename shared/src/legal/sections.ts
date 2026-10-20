import type { SiteConfig } from '../site/config';

export interface LegalSection {
  /** Empty for text that comes before the first heading of a custom file. */
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

/** When the built-in agreement and privacy notice last changed. */
export const DEFAULT_LEGAL_UPDATED = 'October 15, 2026';

/** Custom terms and privacy files larger than this stop the API at startup. */
export const LEGAL_FILE_MAX_BYTES = 100 * 1024;

export function legalSectionsText(sections: readonly LegalSection[]): string {
  return sections
    .map((section) => [section.heading, ...section.paragraphs].filter(Boolean).join('\n'))
    .join('\n\n');
}

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

export class LegalTextError extends Error {}

function fillPlaceholders(line: string, config: SiteConfig): string {
  const values: Readonly<Record<string, string>> = {
    siteName: config.site.name,
    contactEmail: config.site.contactEmail,
    governingLaw: config.site.governingLaw,
  };
  return line.replace(PLACEHOLDER, (match, key: string) => {
    const value = values[key];
    if (value === undefined)
      throw new LegalTextError(
        `Unknown placeholder ${match}; use {{siteName}}, {{contactEmail}} or {{governingLaw}}`,
      );
    return value;
  });
}

/**
 * Reads an operator's terms or privacy file. It is plain text: a line starting
 * with "## " starts a section and its heading, blank lines separate
 * paragraphs, and the lines of one paragraph keep their line breaks. Nothing
 * else is interpreted; the browser shows it as text, never as HTML.
 */
export function parseLegalText(text: string, config: SiteConfig): LegalSection[] {
  const sections: { heading: string; paragraphs: string[] }[] = [];
  let section: { heading: string; paragraphs: string[] } | null = null;
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length === 0) return;
    if (!section) {
      section = { heading: '', paragraphs: [] };
      sections.push(section);
    }
    section.paragraphs.push(paragraph.join('\n'));
    paragraph = [];
  };
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n?|\n/);
  for (const rawLine of lines) {
    const line = fillPlaceholders(rawLine.trimEnd(), config);
    const heading = /^##(?:\s+(.*))?$/.exec(line);
    if (heading) {
      endParagraph();
      section = { heading: (heading[1] ?? '').trim(), paragraphs: [] };
      sections.push(section);
    } else if (line.trim() === '') {
      endParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }
  endParagraph();
  const filled = sections.filter((entry) => entry.heading !== '' || entry.paragraphs.length > 0);
  if (filled.length === 0) throw new LegalTextError('The file has no text');
  return filled;
}
