const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = ISO.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
}

export function addDays(iso: string, days: number): string {
  const m = ISO.exec(iso)!;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function yearOf(iso: string): number {
  return +iso.slice(0, 4);
}

/** 2026-03-07 -> "07.03" (the format used in r/peloton threads) */
export function ddmm(iso: string): string {
  return iso.slice(8, 10) + "." + iso.slice(5, 7);
}

/** Every ISO date from first to last inclusive. */
export function eachDay(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}
