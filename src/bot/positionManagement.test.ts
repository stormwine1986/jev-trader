import assert from "node:assert/strict";
import { test } from "node:test";
import { PositionManager } from "./positionManagement.ts";

test("reserves funds when opening and realizes a long profit when closing", () => {
	const manager = new PositionManager(1_000);
	const position = manager.openPosition({
		symbol: "BTCUSDT",
		type: "BUY",
		shares: 2,
		entryPrice: 100,
	});

	assert.equal(position.id, 1);
	assert.equal(manager.balance, 1_000);
	assert.equal(manager.availableFunds, 800);
	assert.deepEqual(manager.positions, [position]);

	const closed = manager.closePosition(position.id, 120);

	assert.equal(closed.profitOrLoss, 40);
	assert.equal(manager.balance, 1_040);
	assert.equal(manager.availableFunds, 1_040);
	assert.deepEqual(manager.positions, []);
});

test("realizes a short profit when closing below entry price", () => {
	const manager = new PositionManager(1_000);
	const position = manager.openPosition({
		symbol: "BTCUSDT",
		type: "SELL",
		shares: 2,
		entryPrice: 100,
	});

	const closed = manager.closePosition(position.id, 80);

	assert.equal(closed.profitOrLoss, 40);
	assert.equal(manager.balance, 1_040);
	assert.equal(manager.availableFunds, 1_040);
});

test("charges a loss for long and short positions", () => {
	const manager = new PositionManager(1_000);
	const long = manager.openPosition({
		symbol: "BTCUSDT",
		type: "BUY",
		shares: 1,
		entryPrice: 100,
	});
	const short = manager.openPosition({
		symbol: "ETHUSDT",
		type: "SELL",
		shares: 1,
		entryPrice: 100,
	});

	manager.closePosition(long.id, 90);
	manager.closePosition(short.id, 110);

	assert.equal(manager.balance, 980);
	assert.equal(manager.availableFunds, 980);
});

test("allows a short loss to exceed its reserved funds", () => {
	const manager = new PositionManager(100);
	const position = manager.openPosition({
		symbol: "BTCUSDT",
		type: "SELL",
		shares: 1,
		entryPrice: 50,
	});

	const closed = manager.closePosition(position.id, 200);

	assert.equal(closed.profitOrLoss, -150);
	assert.equal(manager.balance, -50);
	assert.equal(manager.availableFunds, -50);
});

test("rejects invalid positions and trades exceeding available funds", () => {
	const manager = new PositionManager(100);

	assert.throws(() => new PositionManager(0), RangeError);
	assert.throws(
		() =>
			manager.openPosition({
				symbol: "BTCUSDT",
				type: "BUY",
				shares: 1,
				entryPrice: 101,
			}),
		RangeError,
	);
	assert.throws(
		() =>
			manager.openPosition({
				symbol: "BTCUSDT",
				type: "BUY",
				shares: 0,
				entryPrice: 50,
			}),
		RangeError,
	);
	assert.equal(manager.availableFunds, 100);
	assert.deepEqual(manager.positions, []);
});

test("returns defensive copies and rejects closing unknown positions", () => {
	const manager = new PositionManager(100);
	const position = manager.openPosition({
		symbol: "BTCUSDT",
		type: "BUY",
		shares: 1,
		entryPrice: 50,
	});

	position.shares = 99;
	assert.equal(manager.positions[0].shares, 1);
	assert.throws(() => manager.closePosition(999, 50), RangeError);
});

test("restores available funds and positions from an account snapshot", () => {
	const manager = PositionManager.fromSnapshot({
		balance: 1_000,
		availableFunds: 800,
		positions: [
			{ id: 4, symbol: "BTCUSDT", type: "BUY", shares: 2, entryPrice: 100 },
		],
	});

	assert.equal(manager.balance, 1_000);
	assert.equal(manager.availableFunds, 800);
	assert.deepEqual(manager.positions, [
		{ id: 4, symbol: "BTCUSDT", type: "BUY", shares: 2, entryPrice: 100 },
	]);
	assert.equal(manager.openPosition({
		symbol: "ETHUSDT",
		type: "BUY",
		shares: 1,
		entryPrice: 100,
	}).id, 5);
});