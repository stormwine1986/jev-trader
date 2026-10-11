import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeRound } from "./btc-trend.ts";

test("summarizes the round with the compact fields needed for CLI output", () => {
  const summary = summarizeRound({
    startedAt: "2026-10-11T12:34:56.789Z",
    result: {
      decision: {
        model: "jev-test",
        answers: {
          trend: {
            type: "choice",
            choice: "看涨",
            probabilities: { 看涨: 0.9, 看跌: 0.1 },
            confidence: 0.9,
          },
        },
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      confidenceThreshold: 0.7,
      closedPositions: [
        { id: 1, symbol: "BTCUSDT", type: "SELL", shares: 0.1, entryPrice: 50_000, exitPrice: 55_000, profitOrLoss: 500 },
      ],
      openedPosition: { id: 2, symbol: "BTCUSDT", type: "BUY", shares: 0.05, entryPrice: 60_000 },
      reason: "unsupported-trend",
    },
    account: {
      balance: 12345.67,
      availableFunds: 10000,
      positions: [{ id: 3, symbol: "BTCUSDT", type: "BUY", shares: 0.05, entryPrice: 60_000 }],
    },
  });

  assert.deepEqual(summary, {
    startedAt: "2026-10-11T12:34:56.789Z",
    decision: {
      direction: "看涨",
      confidence: 0.9,
    },
    positions: {
      opened: 1,
      closed: 1,
    },
    balance: 12345.67,
  });
});
