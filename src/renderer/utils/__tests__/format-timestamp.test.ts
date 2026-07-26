import { describe, expect, it } from 'vitest';
import { formatResponseTimestamp } from '../format-timestamp';

describe('formatResponseTimestamp', () => {
  it('formats a Date as DD/MM/YY H:MM:SS AM/PM', () => {
    const date = new Date(2026, 6, 19, 15, 46, 44); // 19 Jul 2026, 3:46:44 PM local
    expect(formatResponseTimestamp(date)).toBe('19/07/26 3:46:44 PM');
  });

  it('accepts a numeric timestamp and zero-pads the date', () => {
    const date = new Date(2026, 0, 5, 9, 1, 2); // 05 Jan 2026, 9:01:02 AM local
    expect(formatResponseTimestamp(date.getTime())).toBe('05/01/26 9:01:02 AM');
  });

  it('renders midnight as 12 AM', () => {
    const date = new Date(2026, 0, 5, 0, 0, 0);
    expect(formatResponseTimestamp(date)).toBe('05/01/26 12:00:00 AM');
  });

  it('renders noon as 12 PM', () => {
    const date = new Date(2026, 0, 5, 12, 30, 15);
    expect(formatResponseTimestamp(date)).toBe('05/01/26 12:30:15 PM');
  });
});
