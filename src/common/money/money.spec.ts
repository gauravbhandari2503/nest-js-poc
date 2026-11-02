import {
  applyBps,
  formatInr,
  roundHalfUp,
  splitProportionally,
} from './money.js';

describe('roundHalfUp', () => {
  it.each([
    [1, 2, 1], // 0.5 -> 1
    [3, 2, 2], // 1.5 -> 2
    [5, 2, 3], // 2.5 -> 3
    [1, 3, 0],
    [2, 3, 1],
    [7, 1, 7],
    [0, 5, 0],
    [-5, 2, -2], // -2.5 rounds up, toward zero
    [-7, 2, -3], // -3.5 -> -3
  ])('%i / %i = %i', (n, d, expected) => {
    expect(roundHalfUp(n, d)).toBe(expected);
  });

  it('rejects a non-positive denominator and non-integers', () => {
    expect(() => roundHalfUp(1, 0)).toThrow(RangeError);
    expect(() => roundHalfUp(1, -2)).toThrow(RangeError);
    expect(() => roundHalfUp(1.5, 2)).toThrow(RangeError);
  });
});

describe('applyBps', () => {
  it('computes 18% GST on Rs 250.00 exactly', () => {
    expect(applyBps(25_000, 1800)).toBe(4500);
  });

  it('rounds half up per line (the spec example: 10% of Rs 250 x 2, then tax)', () => {
    expect(applyBps(50_000, 1000)).toBe(5000); // discount on 2 seats
    expect(applyBps(45_000, 1800)).toBe(8100); // ticket tax on the net
    expect(applyBps(24_000, 500)).toBe(1200); // food tax
  });

  it('rounds a half paise up', () => {
    expect(applyBps(5, 1000)).toBe(1); // 0.5 -> 1
    expect(applyBps(15, 1000)).toBe(2); // 1.5 -> 2
    expect(applyBps(4, 1000)).toBe(0); // 0.4 -> 0
  });

  it('handles 0% and 100%', () => {
    expect(applyBps(12_345, 0)).toBe(0);
    expect(applyBps(12_345, 10_000)).toBe(12_345);
  });
});

describe('splitProportionally', () => {
  it('returns each part unchanged when total equals the sum of weights', () => {
    const weights = [45_000, 8100, 24_000, 1200];
    expect(splitProportionally(78_300, weights)).toEqual(weights);
  });

  it('gives the leftover paisa to the largest remainder', () => {
    // 100 across [1,1,1] is 33.33 each: one part gets the extra paisa, earliest first.
    expect(splitProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitProportionally(10, [1, 2])).toEqual([3, 7]); // 3.33 / 6.67 -> 3 / 7
  });

  it('handles zero weights', () => {
    expect(splitProportionally(0, [0, 0])).toEqual([0, 0]);
    expect(splitProportionally(100, [0, 5])).toEqual([0, 100]);
    expect(() => splitProportionally(100, [0, 0])).toThrow(RangeError);
  });

  it('rejects negative inputs', () => {
    expect(() => splitProportionally(-1, [1])).toThrow(RangeError);
    expect(() => splitProportionally(1, [-1, 2])).toThrow(RangeError);
  });

  it('always sums exactly and stays within one paisa of the exact share (1000 random cases)', () => {
    let seed = 42;
    const random = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % max;
    };
    for (let run = 0; run < 1000; run++) {
      const weights = Array.from({ length: 1 + random(5) }, () =>
        random(100_000),
      );
      const total = random(1_000_000);
      const sum = weights.reduce((a, b) => a + b, 0);
      if (sum === 0) continue;

      const parts = splitProportionally(total, weights);

      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      parts.forEach((part, i) => {
        const exact = (total * weights[i]!) / sum;
        expect(part).toBeGreaterThanOrEqual(Math.floor(exact));
        expect(part).toBeLessThanOrEqual(Math.ceil(exact));
      });
    }
  });
});

describe('formatInr', () => {
  it('formats with Indian digit grouping', () => {
    expect(formatInr(123_450)).toBe('₹1,234.50');
    expect(formatInr(100_000_000)).toBe('₹10,00,000.00');
    expect(formatInr(5)).toBe('₹0.05');
    expect(formatInr(-250)).toBe('-₹2.50');
  });
});
