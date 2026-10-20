/** Strips angle brackets, trims and caps free text from socket payloads. */
export function sanitize(str: unknown, maxLen: number = 50): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim().substring(0, maxLen);
}
