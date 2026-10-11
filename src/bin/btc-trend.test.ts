import assert from "node:assert/strict";
import { test } from "node:test";
import { formatErrorDetails, formatRoundStatus, formatTraderRoundStatus } from "./btc-trend.ts";

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
