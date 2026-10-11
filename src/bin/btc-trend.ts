#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { JevDecisionClient } from "../jev/jevDecisionClient.ts";
import { runTraderBot } from "../bot/traderBot.ts";
import { PositionManager } from "../bot/positionManagement.ts";
import { DEFAULT_TREND_CONFIDENCE_THRESHOLD } from "../bot/traderBot.ts";
import {
  DEFAULT_PAYOFF_RATIO,
  DEFAULT_WIN_PROBABILITY,
} from "../bot/positionSizing.ts";
import { readLatestAuditState, writeRoundAuditRecord } from "../bot/audit.ts";

const RUN_INTERVAL_MS = 15 * 60 * 1000;

export function formatRoundStatus(
  executionRound: number,
  startedAt: Date,
  nextAt: Date,
): string {
  return `${executionRound},start_at=${formatUtcPlusEight(startedAt)},next=${formatUtcPlusEight(nextAt)}`;
}

function formatUtcPlusEight(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${shifted.getUTCFullYear()}.${pad(shifted.getUTCMonth() + 1)}.${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())} UTC+8`;
}

async function waitUntil(date: Date): Promise<void> {
  const delay = date.getTime() - Date.now();
  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export function formatErrorDetails(error: unknown): string {
  return error instanceof Error
    ? inspect(error, { depth: null, colors: false })
    : String(error);
}

async function main() {
  const apiKey = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY ?? "";
  const client = new JevDecisionClient({ apiKey });
  const latestAudit = await readLatestAuditState();
  const positionManager = latestAudit === undefined
    ? new PositionManager(Number(process.env.TRADER_INITIAL_BALANCE ?? 10_000))
    : PositionManager.fromSnapshot(latestAudit.account);
  let executionRound = latestAudit?.executionRound ?? 0;

  while (true) {
    executionRound += 1;
    const startedAt = new Date();
    const nextAt = new Date(startedAt.getTime() + RUN_INTERVAL_MS);
    console.log(formatRoundStatus(executionRound, startedAt, nextAt));

    let result: Awaited<ReturnType<typeof runTraderBot>>;
    try {
      result = await runTraderBot({
        client,
        positionManager,
        executionRound,
        confidenceThreshold: Number(
          process.env.BTC_TREND_CONFIDENCE_THRESHOLD ??
            DEFAULT_TREND_CONFIDENCE_THRESHOLD,
        ),
        winProbability: Number(
          process.env.TRADER_WIN_PROBABILITY ?? DEFAULT_WIN_PROBABILITY,
        ),
        payoffRatio: Number(
          process.env.TRADER_PAYOFF_RATIO ?? DEFAULT_PAYOFF_RATIO,
        ),
      });
    } catch (error) {
      console.error(`Trader bot round ${executionRound} failed: ${formatErrorDetails(error)}`);
      await waitUntil(nextAt);
      continue;
    }

    const account = {
      balance: positionManager.balance,
      availableFunds: positionManager.availableFunds,
      positions: positionManager.positions,
    };
    await writeRoundAuditRecord({
      startedAt: startedAt.toISOString(),
      result,
      account,
    });

    await waitUntil(nextAt);
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(`Trader bot failed: ${formatErrorDetails(error)}`);
    process.exitCode = 1;
  });
}