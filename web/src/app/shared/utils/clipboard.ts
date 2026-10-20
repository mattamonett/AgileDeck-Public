/**
 * Copies text to the clipboard. Falls back to a hidden textarea where the async clipboard API
 * is missing (older browsers, insecure origins), and to a prompt when even that fails.
 */
export function copyText(text: string): void {
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    window.prompt('Copy this link:', text);
  } finally {
    document.body.removeChild(textarea);
  }
}
