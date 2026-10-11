import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readLatestAuditAccount, readLatestAuditState, writeRoundAuditRecord } from "./audit.ts";

test("reads the account from the latest timestamped audit record", async () => {
	const directory = await mkdtemp(join(tmpdir(), "jev-trader-audit-"));
	const olderRecord = {
		startedAt: "2026-10-11T12:00:00.000Z",
		account: { balance: 1_000, availableFunds: 1_000, positions: [] },
		result: { decisionContext: { executionRound: 3 } },
	};
	const latestRecord = {
		startedAt: "2026-10-11T12:15:00.000Z",
		account: { balance: 900, availableFunds: 800, positions: [] },
		result: { decisionContext: { executionRound: 4 } },
	};

	try {
		await writeRoundAuditRecord(latestRecord, directory);
		await writeRoundAuditRecord(olderRecord, directory);
		assert.deepEqual(await readLatestAuditAccount(directory), latestRecord.account);
		assert.deepEqual(await readLatestAuditState(directory), {
			account: latestRecord.account,
			executionRound: 4,
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("returns no account when the audit directory does not exist", async () => {
	const directory = join(tmpdir(), `jev-trader-missing-${Date.now()}`);
	assert.equal(await readLatestAuditAccount(directory), undefined);
	assert.equal(await readLatestAuditState(directory), undefined);
});

test("starts from round zero when the latest audit record predates round tracking", async () => {
	const directory = await mkdtemp(join(tmpdir(), "jev-trader-audit-"));
	const record = {
		startedAt: "2026-10-11T12:34:56.789Z",
		account: { balance: 10_000, availableFunds: 10_000, positions: [] },
	};

	try {
		await writeRoundAuditRecord(record, directory);
		assert.deepEqual(await readLatestAuditState(directory), {
			account: record.account,
			executionRound: 0,
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("writes the execution round in one JSON audit record", async () => {
	const directory = await mkdtemp(join(tmpdir(), "jev-trader-audit-"));
	const record = {
		startedAt: "2026-10-11T12:34:56.789Z",
		result: {
			decisionContext: {
				executionRound: 4,
				state: { close15m: [60_000], close4h: [59_000] },
			},
			decision: { model: "jev-test" },
		},
		account: { balance: 10_000, availableFunds: 10_000, positions: [] },
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