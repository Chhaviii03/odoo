function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Calendar date in the user's local timezone (YYYY-MM-DD). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayLocal(): string {
  return localDateKey(new Date());
}

/** Build a local Date from a date input value + time input value. */
export function parseLocalDateTime(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

/** Send an unambiguous UTC instant to the API. */
export function toApiDateTime(date: string, time: string): string {
  return parseLocalDateTime(date, time).toISOString();
}

export function minutesOfLocalDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
