import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type LatestAuditState = {
	account: unknown;
	executionRound: number;
};

export async function readLatestAuditState(
	directory = "audit",
): Promise<LatestAuditState | undefined> {
	let files: string[];
	try {
		files = await readdir(directory);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw error;
	}

	const latestFile = files
		.filter((file) => /^\d{4}-\d{2}-\d{2}T.*\.json$/.test(file))
		.sort()
		.at(-1);
	if (!latestFile) {
		return undefined;
	}

	const record: unknown = JSON.parse(await readFile(join(directory, latestFile), "utf8"));
	if (typeof record !== "object" || record === null || !("account" in record)) {
		throw new TypeError(`Latest audit record ${latestFile} has no account snapshot`);
	}

	const result = "result" in record ? record.result : undefined;
	const decisionContext = typeof result === "object" && result !== null && "decisionContext" in result
		? result.decisionContext
		: undefined;
	const storedRound = typeof decisionContext === "object" && decisionContext !== null && "executionRound" in decisionContext
		? decisionContext.executionRound
		: undefined;
	if (storedRound !== undefined && (!Number.isSafeInteger(storedRound) || (storedRound as number) < 1)) {
		throw new TypeError(`Latest audit record ${latestFile} has an invalid execution round`);
	}

	return {
		account: record.account,
		executionRound: (storedRound as number | undefined) ?? 0,
	};
}

export async function readLatestAuditAccount(
	directory = "audit",
): Promise<unknown | undefined> {
	return (await readLatestAuditState(directory))?.account;
}

export async function writeRoundAuditRecord<T extends { startedAt: string }>(
	record: T,
	directory = "audit",
): Promise<string> {
	const startTime = Date.parse(record.startedAt);
	if (!Number.isFinite(startTime)) {
		throw new RangeError("startedAt must be a valid date");
	}

	const timestamp = new Date(startTime)
		.toISOString()
		.replaceAll(":", "-")
		.replaceAll(".", "-");
	const filePath = join(directory, `${timestamp}.json`);
	await mkdir(directory, { recursive: true });
	await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, {
		encoding: "utf8",
		flag: "wx",
	});

	return filePath;
}