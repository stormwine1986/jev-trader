import assert from "node:assert/strict";
import { test } from "node:test";
import { decideBtcTrend, btcTrendQuestions } from "./btcTrendBot.ts";
import { runTraderBot } from "./traderBot.ts";
import { PositionManager } from "./positionManagement.ts";
import type { JevDecision, JevQuestions, JevValue } from "../jev/jevDecisionClient.ts";
import type { JevDecisionClient } from "../jev/jevDecisionClient.ts";

test("submits both periods of recent closes as state", async () => {
  const closePrices = {
    close15m: Array.from({ length: 100 }, (_, index) => 60_000 + index),
    close4h: Array.from({ length: 100 }, (_, index) => 55_000 + index),
    atr14_15m: 100,
  };
  let receivedRequest:
    | { state: JevValue; questions: JevQuestions }
    | undefined;
  const client = {
    async decide<Q extends JevQuestions>(request: {
      state: JevValue;
      questions: Q;
    }): Promise<JevDecision<Q>> {
      receivedRequest = request;
      return {
        model: "jev-test",
        answers: {
          trend: {
            type: "choice",
            choice: "看涨",
            probabilities: { 看涨: 0.8, 中性: 0.15, 看跌: 0.05 },
            confidence: 0.8,
          },
        },
        usage: { input_tokens: 10, output_tokens: 5 },
      } as JevDecision<Q>;
    },
  } satisfies Pick<JevDecisionClient, "decide">;

  const decision = await decideBtcTrend(client, async () => closePrices);

  assert.deepEqual(receivedRequest?.state, {
    close15m: closePrices.close15m,
    close4h: closePrices.close4h,
  });
  assert.deepEqual(receivedRequest?.questions, btcTrendQuestions);
  assert.equal(decision.answers.trend.choice, "看涨");
});

function createTrendClient(choice: string, confidence: number) {
  return {
    async decide<Q extends JevQuestions>(request: {
      state: JevValue;
      questions: Q;
    }): Promise<JevDecision<Q>> {
      return {
        model: "jev-test",
        answers: {
          trend: {
            type: "choice",
            choice,
            probabilities: { [choice]: confidence },
            confidence,
          },
        },
        usage: { input_tokens: 10, output_tokens: 5 },
      } as JevDecision<Q>;
    },
  } satisfies Pick<JevDecisionClient, "decide">;
}

test("does not trade when trend confidence does not exceed the threshold", async () => {
  const account = new PositionManager(10_000);
  const result = await runTraderBot({
    client: createTrendClient("看涨", 0.7),
    positionManager: account,
    getClosePrices: async () => ({ close15m: [60_000], close4h: [59_000], atr14_15m: 100 }),
  });

  assert.equal(result.reason, "below-threshold");
  assert.deepEqual(account.positions, []);
  assert.equal(account.availableFunds, 10_000);
});

test("does not open a position without a positive ATR", async () => {
  const account = new PositionManager(10_000);
  const result = await runTraderBot({
    client: createTrendClient("看涨", 0.8),
    positionManager: account,
    getClosePrices: async () => ({ close15m: [60_000], close4h: [59_000], atr14_15m: 0 }),
  });

  assert.equal(result.reason, "invalid-atr");
  assert.deepEqual(account.positions, []);
});

test("monitors an open position without requesting a trend decision", async () => {
  const account = new PositionManager(10_000);
  const position = account.openPosition({
    symbol: "BTCUSDT",
    type: "SELL",
    shares: 0.01,
    entryPrice: 50_000,
    stopLossPrice: 51_000,
    takeProfitPrice: 48_000,
  });
  let decisionCount = 0;
  const client = {
    async decide<Q extends JevQuestions>(): Promise<JevDecision<Q>> {
      decisionCount += 1;
      throw new Error("trend decision should be skipped while positioned");
    },
  } satisfies Pick<JevDecisionClient, "decide">;

  const result = await runTraderBot({
    client,
    positionManager: account,
    executionRound: 3,
    confidenceThreshold: Number.NaN,
    getClosePrices: async () => ({ close15m: [49_000], close4h: [], atr14_15m: 100 }),
  });

  assert.equal(decisionCount, 0);
  assert.equal(result.reason, "holding-position");
  assert.equal(result.currentPrice, 49_000);
  assert.equal(result.unrealizedPnl, 10);
  assert.deepEqual(result.closedPositions, []);
  assert.equal(result.openedPosition, undefined);
  assert.equal(result.decision, undefined);
  assert.equal(result.positionRecommendation.positionPercent, null);
  assert.deepEqual(account.positions, [position]);
});

test("closes a position at take profit without reopening in the same round", async () => {
  const account = new PositionManager(10_000);
  account.openPosition({
    symbol: "BTCUSDT",
    type: "BUY",
    shares: 0.01,
    entryPrice: 50_000,
    stopLossPrice: 49_000,
    takeProfitPrice: 52_000,
  });
  const result = await runTraderBot({
    client: createTrendClient("看跌", 0.9),
    positionManager: account,
    getClosePrices: async () => ({ close15m: [52_000], close4h: [], atr14_15m: 100 }),
  });

  assert.equal(result.reason, "take-profit");
  assert.equal(result.closedPositions.length, 1);
  assert.equal(result.closedPositions[0].exitPrice, 52_000);
  assert.equal(result.closedPositions[0].profitOrLoss, 20);
  assert.equal(result.decision, undefined);
  assert.equal(result.openedPosition, undefined);
  assert.deepEqual(account.positions, []);
});

test("uses configured Kelly values independently of trend confidence", async () => {
  const account = new PositionManager(10_000);
  const result = await runTraderBot({
    client: createTrendClient("看涨", 0.8),
    positionManager: account,
    winProbability: 0.4,
    payoffRatio: 2,
    stopLossAtrMultiplier: 1,
    getClosePrices: async () => ({ close15m: [60_000], close4h: [59_000], atr14_15m: 100 }),
  });

  assert.ok(Math.abs(result.positionRecommendation.positionPercent! - 5) < 1e-12);
  assert.ok(Math.abs(result.positionRecommendation.requestedValue! - 500) < 1e-9);
  assert.ok(Math.abs(result.openedPosition!.shares - 500 / 60_000) < 1e-12);
  assert.equal(result.positionRecommendation.stopLossPrice, 59_900);
  assert.equal(result.positionRecommendation.takeProfitPrice, 60_200);
});

test("requests another Jev decision after opening a position", async () => {
  const account = new PositionManager(10_000);
  let decisionCount = 0;
  const client = {
    async decide<Q extends JevQuestions>(request: {
      state: JevValue;
      questions: Q;
    }): Promise<JevDecision<Q>> {
      decisionCount += 1;
      return createTrendClient("看涨", 0.8).decide(request);
    },
  } satisfies Pick<JevDecisionClient, "decide">;
  const getClosePrices = async () => ({ close15m: [60_000], close4h: [59_000], atr14_15m: 100 });

  const firstResult = await runTraderBot({ client, positionManager: account, getClosePrices });
  const secondResult = await runTraderBot({ client, positionManager: account, getClosePrices });

  assert.ok(firstResult.openedPosition);
  assert.equal(secondResult.reason, "holding-position");
  assert.equal(secondResult.unrealizedPnl, 0);
  assert.equal(secondResult.decision, undefined);
  assert.equal(decisionCount, 1);
});