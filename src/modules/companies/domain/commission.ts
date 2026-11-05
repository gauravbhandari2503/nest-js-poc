/**
 * Commission rates are shown to people and sent over the API as a percent (`12.5`), and
 * stored as whole basis points (`1250`) so money maths never touches floats.
 */
export const percentToBps = (percent: number): number =>
  Math.round(percent * 100);

export const bpsToPercent = (bps: number): number => bps / 100;
