import { durationToMs } from '../duration.js';

describe('durationToMs', () => {
  it('parses seconds, minutes, hours and days', () => {
    expect(durationToMs('30s')).toBe(30_000);
    expect(durationToMs('15m')).toBe(900_000);
    expect(durationToMs('12h')).toBe(43_200_000);
    expect(durationToMs('7d')).toBe(604_800_000);
  });

  it('rejects anything else', () => {
    expect(() => durationToMs('soon')).toThrow();
    expect(() => durationToMs('7')).toThrow();
  });
});
