import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function readLatestAuditAccount(
	directory = "audit",
): Promise<unknown | undefined> {
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
	return record.account;
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