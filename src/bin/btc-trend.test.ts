import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RUN_INTERVAL_MS,
  formatErrorDetails,
  formatRoundStatus,
  formatTraderRoundStatus,
} from "./btc-trend.ts";

test("uses a 3 minute scan interval", () => {
  assert.equal(RUN_INTERVAL_MS, 3 * 60 * 1000);
});

test("formats nested error details for CLI failures", () => {
  const cause = Object.assign(new Error("socket hang up"), {
    code: "ECONNRESET",
  });
  const error = Object.assign(new TypeError("fetch failed", { cause }), {
    status: 503,
    responseBody: "upstream unavailable",
  });

  const details = formatErrorDetails(error);

  assert.match(details, /fetch failed/);
  assert.match(details, /ECONNRESET/);
  assert.match(details, /socket hang up/);
  assert.match(details, /503/);
  assert.match(details, /upstream unavailable/);
});
test("formats the round and next start time in UTC+8", () => {
  assert.equal(
    formatRoundStatus(
      7,
      new Date("2026-10-11T12:34:56.789Z"),
      new Date("2026-10-11T12:49:56.789Z"),
    ),
    "7,start_at=2026.10.11 20:34:56 UTC+8,next=2026.10.11 20:49:56 UTC+8",
  );
});

test("formats holding-position status with unrealized PnL", () => {
  assert.equal(
    formatTraderRoundStatus(
      8,
      new Date("2026-10-11T12:34:56.789Z"),
      new Date("2026-10-11T12:49:56.789Z"),
      {
        executionRound: 8,
        confidenceThreshold: 0.7,
        positionRecommendation: {
          direction: null,
          positionPercent: null,
          requestedValue: null,
          availableFunds: 9_000,
          executableValue: null,
          shares: null,
          stopLossPrice: null,
          takeProfitPrice: null,
        },
        closedPositions: [],
        currentPrice: 61_000,
        unrealizedPnl: 10,
        reason: "holding-position",
      },
      10_000,
    ),
    "8,start_at=2026.10.11 20:34:56 UTC+8,next=2026.10.11 20:49:56 UTC+8,Unrealized PnL=10,",
  );
});

test("formats the Jev choice and confidence below the threshold", () => {
  assert.equal(
    formatTraderRoundStatus(
      1,
      new Date("2026-10-11T12:05:55.000Z"),
      new Date("2026-10-11T12:20:55.000Z"),
      {
        executionRound: 1,
        decision: {
          model: "jev-test",
          answers: {
            trend: {
              type: "choice",
              choice: "中性",
              probabilities: { 看涨: 0.2, 中性: 0.6, 看跌: 0.2 },
              confidence: 0.6,
            },
          },
          usage: { input_tokens: 1, output_tokens: 1 },
        },
        confidenceThreshold: 0.7,
        positionRecommendation: null,
        closedPositions: [],
        reason: "below-threshold",
      },
      10_000,
    ),
    "1,start_at=2026.10.11 20:05:55 UTC+8,next=2026.10.11 20:20:55 UTC+8,choice=中性,confidence=0.6",
  );
});
