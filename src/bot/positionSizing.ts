export type PositionSizingOptions = {
  winProbability?: number;
  payoffRatio?: number;
};

export type StopLossTakeProfitOptions = {
  direction: "BUY" | "SELL";
  entryPrice: number;
  atr14: number;
  atrMultiplier?: number;
  payoffRatio?: number;
};

export type StopLossTakeProfitPrices = {
  stopLossPrice: number;
  takeProfitPrice: number;
};

export const DEFAULT_WIN_PROBABILITY = 0.35;
export const DEFAULT_PAYOFF_RATIO = 3;
export const DEFAULT_STOP_LOSS_ATR_MULTIPLIER = 2;

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

export function calculateStopLossTakeProfitPrices({
  direction,
  entryPrice,
  atr14,
  atrMultiplier = DEFAULT_STOP_LOSS_ATR_MULTIPLIER,
  payoffRatio = DEFAULT_PAYOFF_RATIO,
}: StopLossTakeProfitOptions): StopLossTakeProfitPrices {
  if (direction !== "BUY" && direction !== "SELL") {
    throw new RangeError('direction must be "BUY" or "SELL"');
  }
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    throw new RangeError("entryPrice must be greater than 0");
  }
  if (!Number.isFinite(atr14) || atr14 <= 0) {
    throw new RangeError("atr14 must be greater than 0");
  }
  if (!Number.isFinite(atrMultiplier) || atrMultiplier <= 0) {
    throw new RangeError("atrMultiplier must be greater than 0");
  }
  if (!Number.isFinite(payoffRatio) || payoffRatio <= 0) {
    throw new RangeError("payoffRatio must be greater than 0");
  }

  const directionSign = direction === "BUY" ? 1 : -1;
  const stopDistance = atrMultiplier * atr14;
  const stopLossPrice = entryPrice - directionSign * stopDistance;
  const takeProfitPrice = entryPrice + directionSign * stopDistance * payoffRatio;
  if (
    !Number.isFinite(stopLossPrice) ||
    stopLossPrice <= 0 ||
    !Number.isFinite(takeProfitPrice) ||
    takeProfitPrice <= 0
  ) {
    throw new RangeError("calculated stop-loss and take-profit prices must be finite and positive");
  }

  return { stopLossPrice, takeProfitPrice };
}