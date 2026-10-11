import {
	getRecentBtcTrendClosePrices,
	type BtcTrendClosePrices,
} from "../binance/getBtc15mClosePrices.ts";
import {
	JevDecisionClient,
	type JevDecision,
} from "../jev/jevDecisionClient.ts";
import { decideBtcTrend, btcTrendQuestions } from "./btcTrendBot.ts";
import { PositionManager, type ClosedPosition, type Position } from "./positionManagement.ts";
import { calculateHalfKellyPositionPercent } from "./positionSizing.ts";

export const DEFAULT_TREND_CONFIDENCE_THRESHOLD = 0.7;
export const BTC_SYMBOL = "BTCUSDT";

type TrendDecision = JevDecision<typeof btcTrendQuestions>;

export type TraderBotOptions = {
	client: Pick<JevDecisionClient, "decide">;
	positionManager: PositionManager;
	executionRound?: number;
	confidenceThreshold?: number;
	getClosePrices?: () => Promise<BtcTrendClosePrices>;
};

export type TraderBotResult = {
	decisionContext: {
		executionRound: number;
		state: BtcTrendClosePrices;
		questions: typeof btcTrendQuestions;
	};
	decision: TrendDecision;
	confidenceThreshold: number;
	positionRecommendation: {
		direction: "BUY" | "SELL" | null;
		positionPercent: number | null;
		requestedValue: number | null;
		availableFunds: number;
		executableValue: number | null;
		shares: number | null;
	};
	closedPositions: ClosedPosition[];
	openedPosition?: Position;
	reason?: "below-threshold" | "unsupported-trend" | "already-positioned" | "no-positive-edge" | "no-available-funds";
};

export async function runTraderBot({
	client,
	positionManager,
	executionRound = 1,
	confidenceThreshold = DEFAULT_TREND_CONFIDENCE_THRESHOLD,
	getClosePrices = getRecentBtcTrendClosePrices,
}: TraderBotOptions): Promise<TraderBotResult> {
	if (!Number.isInteger(executionRound) || executionRound < 1) {
		throw new RangeError("executionRound must be a positive integer");
	}
	if (!Number.isFinite(confidenceThreshold) || confidenceThreshold < 0 || confidenceThreshold > 1) {
		throw new RangeError("confidenceThreshold must be between 0 and 1");
	}

	let closePrices: BtcTrendClosePrices = { close15m: [], close4h: [] };
	const decision = await decideBtcTrend(client, async () => {
		closePrices = await getClosePrices();
		return closePrices;
	});
	const trend = decision.answers.trend;
	const targetType = trend.choice === "看涨"
		? "BUY"
		: trend.choice === "看跌"
			? "SELL"
			: null;
	const latestClose = closePrices.close15m.at(-1);
	const result: TraderBotResult = {
		decisionContext: {
			executionRound,
			state: closePrices,
			questions: btcTrendQuestions,
		},
		decision,
		confidenceThreshold,
		positionRecommendation: buildPositionRecommendation(
			positionManager,
			trend.confidence,
			targetType,
			latestClose,
		),
		closedPositions: [],
	};

	if (trend.confidence <= confidenceThreshold) {
		result.reason = "below-threshold";
		return result;
	}

	if (!targetType) {
		result.reason = "unsupported-trend";
		return result;
	}

	const exitPrice = closePrices.close15m.at(-1);
	if (exitPrice === undefined || !Number.isFinite(exitPrice) || exitPrice <= 0) {
		throw new RangeError("the latest close price must be greater than 0");
	}

	for (const position of positionManager.positions) {
		if (position.symbol === BTC_SYMBOL && position.type !== targetType) {
			result.closedPositions.push(positionManager.closePosition(position.id, exitPrice));
		}
	}
	result.positionRecommendation = buildPositionRecommendation(
		positionManager,
		trend.confidence,
		targetType,
		exitPrice,
	);

	if (positionManager.positions.some(
		(position) => position.symbol === BTC_SYMBOL && position.type === targetType,
	)) {
		result.reason = "already-positioned";
		return result;
	}

	if (result.positionRecommendation.positionPercent === 0) {
		result.reason = "no-positive-edge";
		return result;
	}

	const positionValue = result.positionRecommendation.executableValue!;
	if (!Number.isFinite(positionValue) || positionValue <= 0) {
		result.reason = "no-available-funds";
		return result;
	}

	result.openedPosition = positionManager.openPosition({
		symbol: BTC_SYMBOL,
		type: targetType,
		shares: positionValue / exitPrice,
		entryPrice: exitPrice,
	});
	return result;
}

function buildPositionRecommendation(
	positionManager: PositionManager,
	confidence: number,
	direction: "BUY" | "SELL" | null,
	price: number | undefined,
): TraderBotResult["positionRecommendation"] {
	const positionPercent = confidence >= 0 && confidence <= 1
		? calculateHalfKellyPositionPercent({ winProbability: confidence })
		: null;
	const requestedValue = positionPercent === null
		? null
		: positionManager.balance * positionPercent / 100;
	const executableValue = requestedValue === null
		? null
		: Math.min(requestedValue, positionManager.availableFunds);

	return {
		direction,
		positionPercent,
		requestedValue,
		availableFunds: positionManager.availableFunds,
		executableValue,
		shares: executableValue !== null && price !== undefined && price > 0
			? executableValue / price
			: null,
	};
}