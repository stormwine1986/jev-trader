import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateHalfKellyPositionPercent,
  calculateStopLossTakeProfitPrices,
} from "./positionSizing.ts";

test("uses the cold-start values and returns a percentage", () => {
  assert.equal(calculateHalfKellyPositionPercent(), 6.666666666666665);
});

test("supports supplied win probability and payoff ratio", () => {
  assert.equal(
    calculateHalfKellyPositionPercent({
      winProbability: 0.5,
      payoffRatio: 2,
    }),
    12.5,
  );
});

test("returns zero when the expected edge is not positive", () => {
  assert.equal(
    calculateHalfKellyPositionPercent({
      winProbability: 0.25,
      payoffRatio: 3,
    }),
    0,
  );
});

test("rejects invalid probability and payoff ratio", () => {
  assert.throws(
    () => calculateHalfKellyPositionPercent({ winProbability: 1.1 }),
    RangeError,
  );
  assert.throws(
    () => calculateHalfKellyPositionPercent({ payoffRatio: 0 }),
    RangeError,
  );
});

test("calculates stop-loss and take-profit prices for long and short positions", () => {
  assert.deepEqual(
    calculateStopLossTakeProfitPrices({
      direction: "BUY",
      entryPrice: 100,
      atr14: 4,
      atrMultiplier: 2,
      payoffRatio: 3,
    }),
    { stopLossPrice: 92, takeProfitPrice: 124 },
  );
  assert.deepEqual(
    calculateStopLossTakeProfitPrices({
      direction: "SELL",
      entryPrice: 100,
      atr14: 4,
      atrMultiplier: 2,
      payoffRatio: 3,
    }),
    { stopLossPrice: 108, takeProfitPrice: 76 },
  );
});

test("rejects invalid stop-loss inputs and nonpositive calculated prices", () => {
  assert.throws(
    () => calculateStopLossTakeProfitPrices({ direction: "BUY", entryPrice: 100, atr14: 0 }),
    RangeError,
  );
  assert.throws(
    () => calculateStopLossTakeProfitPrices({ direction: "BUY", entryPrice: 1, atr14: 1 }),
    RangeError,
  );
});