/**
 * Money is an integer number of paise; rates are integer basis points (1 bps = 0.01%,
 * so 18% is 1800). No floats and no Decimal: every rounding in the app goes through
 * the helpers in this file, so totals are reproducible forever.
 */
export type Paise = number;
export type Bps = number;

export const BPS_DENOMINATOR = 10_000;

export function assertInteger(value: number, name = 'value'): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer, got ${value}`);
  }
}

/**
 * `numerator / denominator` rounded to the nearest integer, halves going up
 * (2.5 -> 3, and -2.5 -> -2). Integer arithmetic only, so there is no float drift.
 */
export function roundHalfUp(numerator: number, denominator: number): number {
  assertInteger(numerator, 'numerator');
  assertInteger(denominator, 'denominator');
  if (denominator <= 0) throw new RangeError('denominator must be positive');
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** `amount` times `bps`, rounded half up: 18% of 25000 paise is `applyBps(25000, 1800)`. */
export function applyBps(amount: Paise, bps: Bps): Paise {
  assertInteger(amount, 'amount');
  assertInteger(bps, 'bps');
  return roundHalfUp(amount * bps, BPS_DENOMINATOR);
}

/**
 * Splits `total` across `weights` in proportion, so the parts always add up to `total`
 * exactly (largest-remainder method; ties go to the earlier weight). Used to share a
 * partly refunded booking across ticket, food and tax.
 */
export function splitProportionally(
  total: Paise,
  weights: readonly number[],
): Paise[] {
  assertInteger(total, 'total');
  if (total < 0) throw new RangeError('total must not be negative');
  weights.forEach((weight, i) => {
    assertInteger(weight, `weights[${i}]`);
    if (weight < 0) throw new RangeError('weights must not be negative');
  });

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum === 0) {
    if (total === 0) return weights.map(() => 0);
    throw new RangeError('cannot split a non-zero total across zero weights');
  }

  const parts = weights.map((weight) => {
    const exact = total * weight;
    return {
      floor: Math.floor(exact / weightSum),
      remainder: exact % weightSum,
    };
  });
  let leftover = total - parts.reduce((sum, part) => sum + part.floor, 0);

  const byRemainder = parts
    .map((part, index) => ({ index, remainder: part.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const result = parts.map((part) => part.floor);
  for (const { index } of byRemainder) {
    if (leftover === 0) break;
    result[index]! += 1;
    leftover -= 1;
  }
  return result;
}

/** Display only (`₹1,234.50`). Never parse this back into money. */
export function formatInr(amount: Paise): string {
  assertInteger(amount, 'amount');
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const rupees = Math.floor(abs / 100);
  const paise = String(abs % 100).padStart(2, '0');
  return `${sign}₹${rupees.toLocaleString('en-IN')}.${paise}`;
}
