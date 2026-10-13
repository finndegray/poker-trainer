export const STREAK_MIN_SPOTS = 20;

export type DateKey = string;
export type DayCounts = Readonly<Record<DateKey, number>>;

const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number): string => String(n).padStart(2, '0');

export function localDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// UTC arithmetic avoids daylight-saving shifts; the key itself is a local calendar date.
const formatUtc = (t: Date): DateKey => `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;

export function shiftDateKey(key: DateKey, days: number): DateKey {
  if (!Number.isInteger(days)) throw new Error(`Tagesversatz muss eine ganze Zahl sein: ${days}`);
  const m = KEY_PATTERN.exec(key);
  if (!m) throw new Error(`Ungültiges Datum: ${key}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  // Date.UTC silently rolls over impossible dates (2026-02-31 -> 2026-03-03); the round-trip catches that.
  if (formatUtc(new Date(Date.UTC(year, month, day))) !== key) throw new Error(`Ungültiges Datum: ${key}`);
  return formatUtc(new Date(Date.UTC(year, month, day + days)));
}

export function incrementDay(days: DayCounts, key: DateKey, by = 1): Record<DateKey, number> {
  return { ...days, [key]: (days[key] ?? 0) + by };
}

const dayDone = (days: DayCounts, key: DateKey): boolean => (days[key] ?? 0) >= STREAK_MIN_SPOTS;

export function currentStreak(days: DayCounts, todayKey: DateKey): number {
  let key = dayDone(days, todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  let streak = 0;
  while (dayDone(days, key)) {
    streak++;
    key = shiftDateKey(key, -1);
  }
  return streak;
}

export function dayProgress(days: DayCounts, todayKey: DateKey): { count: number; target: number; done: boolean } {
  const count = days[todayKey] ?? 0;
  return { count, target: STREAK_MIN_SPOTS, done: count >= STREAK_MIN_SPOTS };
}
