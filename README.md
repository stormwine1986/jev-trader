# 基于 Jev 模型的量化交易原型

⚠ **警告：本项目仅能作为学习研究用途，并不是完善的交易系统。不得用于实盘交易。**

⚠ **警告：本项目不构成任何投资建议。**

## Trader Bot

### flow

- 利用决策组件决策 BTC 的价格趋势
- 置信度高于默认阈值 `0.7` 才确认趋势；未确认时不交易
- 将趋势置信度作为胜率输入半凯利仓位计算器，按账户余额与最新收盘价计算仓位
- 看涨时先平掉 BTC 空头仓位，再开多头；看跌时先平掉 BTC 多头仓位，再开空头
- 已有同方向 BTC 仓位时不重复加仓；开仓金额不会超过可用资金
- 将模拟执行结果和账户状态输出为 JSON

运行时可通过 `BTC_TREND_CONFIDENCE_THRESHOLD` 设置 `[0, 1]` 内的阈值，通过 `TRADER_INITIAL_BALANCE` 设置模拟初始资金（默认 `10000`）。该 CLI 每次启动都会创建新的内存账本，结果不会持久化，也不会连接交易所。

## Jev 决策组件

`src/jev/jevDecisionClient.ts` 封装了 Jev `systemone` API，可传入文本或结构化状态以及 Noul、Choice、Score 问题。BTC 趋势决策同时提交最近 100 根 15m 与 100 根 4h K 线收盘价。API Key 通过 `TYPESAFE_API_KEY` 等环境变量管理，并在创建客户端时显式传入；客户端不会读取或记录密钥。遇到 429/529 时会自动退避重试。

```ts
import { JevDecisionClient } from "./jev/jevDecisionClient.js";
import { decideBtcTrend } from "./bot/btcTrendBot.js";

const client = new JevDecisionClient({
	apiKey: process.env.TYPESAFE_API_KEY ?? "",
});
const decision = await decideBtcTrend(client);

console.log(decision.answers.trend.choice);
```

实际交易前应自行校验 Jev 输出，并实施仓位、止损等风险控制；模型响应不是交易保证。

## 仓位计算组件

`src/bot/positionSizing.ts` 使用半凯利公式计算建议仓位百分比。默认冷启动胜率为 `35%`、盈亏比为 `3`，对应建议仓位约为 `6.67%`；也可以传入经过验证的胜率和盈亏比：

```ts
import { calculateHalfKellyPositionPercent } from "./bot/positionSizing.js";

const positionPercent = calculateHalfKellyPositionPercent({
	winProbability: 0.35,
	payoffRatio: 3,
});

console.log(positionPercent); // 约 6.67
```

胜率使用 `0` 到 `1` 之间的小数，盈亏比表示每单位亏损对应的盈利倍数。无正期望时返回 `0`；无效参数会抛出 `RangeError`。该组件只提供数学计算结果，不代表实际交易建议。

## 仓位管理组件
`src/bot/positionManagement.ts` 通过 `PositionManager` 记录仓位和资金，并模拟开平仓。开仓按 `shares * entryPrice` 占用资金；平仓按 BUY/SELL 方向结算盈亏。`balance` 是可用资金加持仓开仓成本，不包含未实现盈亏；`availableFunds` 是当前未占用资金。

```ts
import { PositionManager } from "./bot/positionManagement.js";

const account = new PositionManager(10_000);
const position = account.openPosition({
	symbol: "BTCUSDT",
	type: "BUY",
	shares: 0.01,
	entryPrice: 60_000,
});

account.closePosition(position.id, 61_000);
console.log(account.balance, account.availableFunds);
```

初始余额、数量和价格必须是有限正数；资金不足、无效仓位或不存在的仓位 ID 会抛出 `RangeError`。这是本地模拟账本，不会连接交易所或处理手续费、保证金和强平。

## 审计组件

Trader Bot 每轮运行后会在项目工作目录的 `audit/` 中写入一个 JSON 文件，文件名使用该轮启动时间的 UTC 时间戳。记录包含提交给 Jev 的收盘价状态与问题、决策结果、仓位建议、平仓和开仓结果、未执行原因，以及轮次结束时的模拟账户状态。若审计文件无法写入，CLI 会报告错误并停止运行。

## Trader Bot CLI

在 `.env` 中设置 `TYPESAFE_API_KEY`，然后运行：

```sh
npm run trader-bot
```

命令启动后立即运行一轮 bot flow，此后每轮结束等待 15 分钟再运行；按 Ctrl+C 退出。它会读取最近 100 根 BTCUSDT 的 15 分钟和 4 小时 K 线收盘价，交由 Jev 综合判断；交易执行价格仍使用最新 15 分钟收盘价，并将 Jev 决策和模拟账户状态以 JSON 输出。模拟账本在进程运行期间保留，重启后重新加载审计目录中最新的账户状态。也可将项目安装为本地命令后运行 `trader-bot`。
