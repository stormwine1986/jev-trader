import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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