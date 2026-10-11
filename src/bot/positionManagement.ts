export type PositionType = "BUY" | "SELL";

export type Position = {
	id: number;
	symbol: string;
	type: PositionType;
	shares: number;
	entryPrice: number;
};

export type OpenPositionOptions = Omit<Position, "id">;

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