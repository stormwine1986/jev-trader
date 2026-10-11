import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { writeRoundAuditRecord } from "./audit.ts";

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