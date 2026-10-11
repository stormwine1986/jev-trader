#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { JevDecisionClient } from "../jev/jevDecisionClient.ts";
import { runTraderBot } from "../bot/traderBot.ts";
import { PositionManager } from "../bot/positionManagement.ts";
import { DEFAULT_TREND_CONFIDENCE_THRESHOLD } from "../bot/traderBot.ts";
import { readLatestAuditState, writeRoundAuditRecord } from "../bot/audit.ts";

const RUN_INTERVAL_MS = 15 * 60 * 1000;

type RoundSummaryInput = {
  startedAt: string;
  result: {
    decision?: {
      answers?: {
        trend?: {
          choice?: string;
          confidence?: number;
        };
      };
    };
    closedPositions?: unknown[];
    openedPosition?: unknown;
  };
  account: {
    balance: number;
  };
};

export function summarizeRound({
  startedAt,
  result,
  account,
}: RoundSummaryInput) {
  const direction = result.decision?.answers?.trend?.choice ?? null;
  const confidence = result.decision?.answers?.trend?.confidence ?? null;

  return {
    startedAt,
    decision: {
      direction,
      confidence,
    },
    positions: {
      opened: result.openedPosition ? 1 : 0,
      closed: result.closedPositions?.length ?? 0,
    },
    balance: account.balance,
  };
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
    const startedAt = new Date().toISOString();
    const result = await runTraderBot({
      client,
      positionManager,
      executionRound,
      confidenceThreshold: Number(
        process.env.BTC_TREND_CONFIDENCE_THRESHOLD ??
          DEFAULT_TREND_CONFIDENCE_THRESHOLD,
      ),
    });

    const account = {
      balance: positionManager.balance,
      availableFunds: positionManager.availableFunds,
      positions: positionManager.positions,
    };
    await writeRoundAuditRecord({
      startedAt,
      result,
      account,
    });

    console.log(JSON.stringify(summarizeRound({
      startedAt,
      result,
      account,
    }), null, 2));

    await new Promise((resolve) => setTimeout(resolve, RUN_INTERVAL_MS));
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