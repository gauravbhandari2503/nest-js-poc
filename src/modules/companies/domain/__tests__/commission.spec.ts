import { bpsToPercent, percentToBps } from '../commission.js';

describe('commission percent', () => {
  it('converts percent to whole basis points', () => {
    expect(percentToBps(10)).toBe(1000);
    expect(percentToBps(12.5)).toBe(1250);
    expect(percentToBps(0.01)).toBe(1);
    expect(percentToBps(100)).toBe(10_000);
  });

  it('does not drift on values that are inexact as floats', () => {
    expect(percentToBps(0.07)).toBe(7);
    expect(percentToBps(1.15)).toBe(115);
  });

  it('converts basis points back to percent', () => {
    expect(bpsToPercent(1250)).toBe(12.5);
    expect(bpsToPercent(percentToBps(33.33))).toBe(33.33);
  });
});
