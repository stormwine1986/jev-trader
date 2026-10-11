const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const KLINE_CLOSE_PRICE_INDEX = 4;
const KLINE_COUNT = 100;

export type BtcTrendClosePrices = {
  close15m: number[];
  close4h: number[];
};

async function getRecentBtcClosePrices(interval: "15m" | "4h"): Promise<number[]> {
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
    if (!Array.isArray(kline) || typeof kline[KLINE_CLOSE_PRICE_INDEX] !== "string") {
      throw new Error(`Invalid Binance kline at index ${index}`);
    }

    const closePrice = Number(kline[KLINE_CLOSE_PRICE_INDEX]);
    if (!Number.isFinite(closePrice)) {
      throw new Error(`Invalid close price at index ${index}`);
    }

    return closePrice;
  });
}

export async function getRecentBtc15mClosePrices(): Promise<number[]> {
  return getRecentBtcClosePrices("15m");
}

export async function getRecentBtcTrendClosePrices(): Promise<BtcTrendClosePrices> {
  const [close15m, close4h] = await Promise.all([
    getRecentBtcClosePrices("15m"),
    getRecentBtcClosePrices("4h"),
  ]);

  return { close15m, close4h };
}