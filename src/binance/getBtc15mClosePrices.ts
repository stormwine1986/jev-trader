const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const KLINE_HIGH_PRICE_INDEX = 2;
const KLINE_LOW_PRICE_INDEX = 3;
const KLINE_CLOSE_PRICE_INDEX = 4;
const KLINE_COUNT = 100;
const ATR_PERIOD = 14;

export type BtcKline = {
	high: number;
	low: number;
	close: number;
};

export type BtcTrendClosePrices = {
  close15m: number[];
  close4h: number[];
  atr14_15m: number;
};

async function getRecentBtcKlines(interval: "15m" | "4h"): Promise<BtcKline[]> {
  const url = new URL(BINANCE_KLINES_URL);
  url.searchParams.set("symbol", "BTCUSDT");
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(KLINE_COUNT));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Binance API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data) || data.length !== KLINE_COUNT) {
    throw new Error(`Expected ${KLINE_COUNT} Binance klines in the response`);
  }

  return data.map((kline: unknown, index: number) => {
    if (
      !Array.isArray(kline) ||
      typeof kline[KLINE_HIGH_PRICE_INDEX] !== "string" ||
      typeof kline[KLINE_LOW_PRICE_INDEX] !== "string" ||
      typeof kline[KLINE_CLOSE_PRICE_INDEX] !== "string"
    ) {
      throw new Error(`Invalid Binance kline at index ${index}`);
    }

    const high = Number(kline[KLINE_HIGH_PRICE_INDEX]);
    const low = Number(kline[KLINE_LOW_PRICE_INDEX]);
    const closePrice = Number(kline[KLINE_CLOSE_PRICE_INDEX]);
    if (
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(closePrice) ||
      low <= 0 ||
      high < low ||
      closePrice <= 0
    ) {
      throw new Error(`Invalid OHLC prices at index ${index}`);
    }

    return { high, low, close: closePrice };
  });
}

export async function getRecentBtc15mClosePrices(): Promise<number[]> {
  const klines = await getRecentBtcKlines("15m");
  return klines.map(({ close }) => close);
}

export async function getRecentBtcTrendClosePrices(): Promise<BtcTrendClosePrices> {
  const [klines15m, klines4h] = await Promise.all([
    getRecentBtcKlines("15m"),
    getRecentBtcKlines("4h"),
  ]);

  return {
    close15m: klines15m.map(({ close }) => close),
    close4h: klines4h.map(({ close }) => close),
    atr14_15m: calculateAtr14(klines15m),
  };
}

export function calculateAtr14(klines: BtcKline[]): number {
	if (klines.length <= ATR_PERIOD) {
		throw new RangeError(`At least ${ATR_PERIOD + 1} klines are required for ATR14`);
	}

	const trueRanges = klines.map((kline, index) => {
		const previousClose = klines[index - 1]?.close;
		return previousClose === undefined
			? kline.high - kline.low
			: Math.max(
				kline.high - kline.low,
				Math.abs(kline.high - previousClose),
				Math.abs(kline.low - previousClose),
			);
	});

	let atr = trueRanges.slice(0, ATR_PERIOD).reduce((sum, range) => sum + range, 0) / ATR_PERIOD;
	for (const trueRange of trueRanges.slice(ATR_PERIOD)) {
		atr = (atr * (ATR_PERIOD - 1) + trueRange) / ATR_PERIOD;
	}
	return atr;
}