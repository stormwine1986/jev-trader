export type PositionType = "BUY" | "SELL";

export type Position = {
	id: number;
	symbol: string;
	type: PositionType;
	shares: number;
	entryPrice: number;
};

export type OpenPositionOptions = Omit<Position, "id">;

export type PositionManagerSnapshot = {
	balance: number;
	availableFunds: number;
	positions: Position[];
};

export type ClosedPosition = Position & {
	exitPrice: number;
	profitOrLoss: number;
};

export class PositionManager {
	private availableFundsValue: number;
	private readonly openPositions = new Map<number, Position>();
	private nextPositionId = 1;

	constructor(initialBalance: number) {
		this.assertPositiveFinite(initialBalance, "initialBalance");
		this.availableFundsValue = initialBalance;
	}

	static fromSnapshot(snapshot: unknown): PositionManager {
		if (typeof snapshot !== "object" || snapshot === null) {
			throw new TypeError("account snapshot must be an object");
		}

		const account = snapshot as Partial<PositionManagerSnapshot>;
		if (
			!Number.isFinite(account.balance) ||
			!Number.isFinite(account.availableFunds) ||
			!Array.isArray(account.positions)
		) {
			throw new TypeError("account snapshot has invalid balance, available funds, or positions");
		}

		const manager = new PositionManager(1);
		manager.availableFundsValue = account.availableFunds;
		for (const position of account.positions) {
			if (!Number.isInteger(position.id) || position.id <= 0 || manager.openPositions.has(position.id)) {
				throw new RangeError("position ids must be unique positive integers");
			}
			if (!position.symbol.trim()) {
				throw new RangeError("symbol must not be empty");
			}
			if (position.type !== "BUY" && position.type !== "SELL") {
				throw new RangeError('type must be "BUY" or "SELL"');
			}
			manager.assertPositiveFinite(position.shares, "shares");
			manager.assertPositiveFinite(position.entryPrice, "entryPrice");
			manager.openPositions.set(position.id, { ...position });
			manager.nextPositionId = Math.max(manager.nextPositionId, position.id + 1);
		}

		if (!Number.isFinite(account.balance) || Math.abs(manager.balance - account.balance) > Number.EPSILON * Math.max(1, Math.abs(account.balance)) * 8) {
			throw new RangeError("account snapshot balance does not match available funds and positions");
		}
		return manager;
	}

	get availableFunds(): number {
		return this.availableFundsValue;
	}

	get balance(): number {
		const investedFunds = [...this.openPositions.values()].reduce(
			(total, position) => total + position.shares * position.entryPrice,
			0,
		);
		return this.availableFundsValue + investedFunds;
	}

	get positions(): Position[] {
		return [...this.openPositions.values()].map((position) => ({ ...position }));
	}

	openPosition(options: OpenPositionOptions): Position {
		if (!options.symbol.trim()) {
			throw new RangeError("symbol must not be empty");
		}
		if (options.type !== "BUY" && options.type !== "SELL") {
			throw new RangeError('type must be "BUY" or "SELL"');
		}
		this.assertPositiveFinite(options.shares, "shares");
		this.assertPositiveFinite(options.entryPrice, "entryPrice");

		const requiredFunds = options.shares * options.entryPrice;
		if (!Number.isFinite(requiredFunds)) {
			throw new RangeError("position value must be finite");
		}
		if (requiredFunds > this.availableFundsValue) {
			throw new RangeError("insufficient available funds");
		}

		const position: Position = { id: this.nextPositionId++, ...options };
		this.availableFundsValue -= requiredFunds;
		this.openPositions.set(position.id, position);
		return { ...position };
	}

	closePosition(positionId: number, exitPrice: number): ClosedPosition {
		this.assertPositiveFinite(exitPrice, "exitPrice");

		const position = this.openPositions.get(positionId);
		if (!position) {
			throw new RangeError(`position ${positionId} does not exist`);
		}

		const direction = position.type === "BUY" ? 1 : -1;
		const profitOrLoss =
			direction * (exitPrice - position.entryPrice) * position.shares;
		const releasedFunds = position.shares * position.entryPrice + profitOrLoss;
		if (!Number.isFinite(releasedFunds)) {
			throw new RangeError("closing position would result in non-finite funds");
		}

		this.openPositions.delete(positionId);
		this.availableFundsValue += releasedFunds;
		return { ...position, exitPrice, profitOrLoss };
	}

	private assertPositiveFinite(value: number, name: string): void {
		if (!Number.isFinite(value) || value <= 0) {
			throw new RangeError(`${name} must be greater than 0`);
		}
	}
}