/**
 * Formats a timestamp as `DD/MM/YY H:MM:SS AM/PM`.
 *
 * This is the same format shown by the API response toolbar, so the history
 * panel and the response view stay visually consistent.
 */
export function formatResponseTimestamp(input: number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;

  return `${day}/${month}/${year} ${displayHours}:${minutes}:${seconds} ${ampm}`;
}
