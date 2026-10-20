// Text rules shared by feedback, replies and rejection reasons. Internal to the
// feedback domain: the barrel does not re-export this module.

const forbiddenContent =
  /<[^>]*>|(?:https?:\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b|\b(?:javascript|data|vbscript|file)\s*:)/iu;
const forbiddenControls = /[\p{Cc}\p{Cf}]/u;

export function plainText(value: string): string {
  return value.normalize('NFC').trim();
}

export function safeText(value: string): boolean {
  return !forbiddenContent.test(value) && !forbiddenControls.test(value);
}

export function textLength(value: string): number {
  return Array.from(value).length;
}
