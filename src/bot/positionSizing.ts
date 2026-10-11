export type PositionSizingOptions = {
  winProbability?: number;
  payoffRatio?: number;
};

const DEFAULT_WIN_PROBABILITY = 0.35;
const DEFAULT_PAYOFF_RATIO = 3;

export function calculateHalfKellyPositionPercent(
  options: PositionSizingOptions = {},
): number {
  const winProbability = options.winProbability ?? DEFAULT_WIN_PROBABILITY;
  const payoffRatio = options.payoffRatio ?? DEFAULT_PAYOFF_RATIO;

  if (
    !Number.isFinite(winProbability) ||
    winProbability < 0 ||
    winProbability > 1
  ) {
    throw new RangeError("winProbability must be between 0 and 1");
  }
  if (!Number.isFinite(payoffRatio) || payoffRatio <= 0) {
    throw new RangeError("payoffRatio must be greater than 0");
  }

  const fullKellyFraction =
    winProbability - (1 - winProbability) / payoffRatio;
  return Math.max(0, fullKellyFraction / 2) * 100;
}