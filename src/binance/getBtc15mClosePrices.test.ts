import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateAtr14, type BtcKline } from "./getBtc15mClosePrices.ts";

test("calculates ATR14 using Wilder smoothing", () => {
	const klines: BtcKline[] = Array.from({ length: 15 }, (_, index) => ({
		high: index === 14 ? 109 : 102,
		low: index === 14 ? 91 : 98,
		close: 100,
	}));

	assert.equal(calculateAtr14(klines), 5);
});

test("requires enough klines for ATR14", () => {
	assert.throws(() => calculateAtr14([]), RangeError);
});