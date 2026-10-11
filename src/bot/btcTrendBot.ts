import {
  getRecentBtcTrendClosePrices,
  type BtcTrendClosePrices,
} from "../binance/getBtc15mClosePrices.ts";
import {
  JevDecisionClient,
  type JevQuestions,
} from "../jev/jevDecisionClient.ts";

export const btcTrendQuestions = {
  trend: {
    type: "choice",
    instructions:
      "结合BTC最近100根15m和100根4h K线的收盘价，综合判断价格趋势并预测看涨还是看跌。",
    criteria: {
      看涨: "收盘价整体呈上升趋势",
      看跌: "收盘价整体呈下降趋势",
    },
  },
} satisfies JevQuestions;

export async function decideBtcTrend(
  client: Pick<JevDecisionClient, "decide">,
  getClosePrices: () => Promise<BtcTrendClosePrices> = getRecentBtcTrendClosePrices,
) {
  const closePrices = await getClosePrices();

  return client.decide({
    state: closePrices,
    questions: btcTrendQuestions,
  });
}