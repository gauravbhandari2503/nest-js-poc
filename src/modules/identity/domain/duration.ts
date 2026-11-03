const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** Parses env durations such as `15m` or `7d` into milliseconds. */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match)
    throw new Error(`Invalid duration "${value}" (use 30s, 15m, 12h or 7d)`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}
