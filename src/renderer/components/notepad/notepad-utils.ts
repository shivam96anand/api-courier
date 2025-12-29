/**
 * Utility functions for the Notepad component
 */

/**
 * HTML-escape a string to prevent XSS when inserting into innerHTML
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Extract the file name from a full file path
 */
export function getFileName(filePath: string): string {
  const segments = filePath.split(/[/\\]/);
  return segments[segments.length - 1] || filePath;
}

/**
 * Check if the notepad tab is currently active
 */
export function isNotepadActive(): boolean {
  const section = document.getElementById('notepad-tab');
  return Boolean(section && section.classList.contains('active'));
}
