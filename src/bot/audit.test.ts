import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readLatestAuditAccount, writeRoundAuditRecord } from "./audit.ts";

test("reads the account from the latest timestamped audit record", async () => {
	const directory = await mkdtemp(join(tmpdir(), "jev-trader-audit-"));
	const olderRecord = {
		startedAt: "2026-10-11T12:00:00.000Z",
		account: { balance: 1_000, availableFunds: 1_000, positions: [] },
	};
	const latestRecord = {
		startedAt: "2026-10-11T12:15:00.000Z",
		account: { balance: 900, availableFunds: 800, positions: [] },
	};

	try {
		await writeRoundAuditRecord(latestRecord, directory);
		await writeRoundAuditRecord(olderRecord, directory);
		assert.deepEqual(await readLatestAuditAccount(directory), latestRecord.account);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("returns no account when the audit directory does not exist", async () => {
	const directory = join(tmpdir(), `jev-trader-missing-${Date.now()}`);
	assert.equal(await readLatestAuditAccount(directory), undefined);
});

test("writes one JSON audit record using its round start timestamp", async () => {
	const directory = await mkdtemp(join(tmpdir(), "jev-trader-audit-"));
	const record = {
		startedAt: "2026-10-11T12:34:56.789Z",
		decisionContext: {
			state: { close15m: [60_000], close4h: [59_000] },
		},
		decision: { model: "jev-test" },
		positionRecommendation: { positionPercent: 6.67 },
		actions: { closedPositions: [], openedPosition: null },
	};

	try {
		const filePath = await writeRoundAuditRecord(record, directory);
		assert.equal(filePath, join(directory, "2026-10-11T12-34-56-789Z.json"));
		assert.deepEqual(JSON.parse(await readFile(filePath, "utf8")), record);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("rejects invalid round start timestamps", async () => {
	await assert.rejects(
		writeRoundAuditRecord({ startedAt: "not-a-date" }),
		RangeError,
	);
});