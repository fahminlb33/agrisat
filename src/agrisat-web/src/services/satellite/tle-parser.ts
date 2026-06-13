import type { TLERecord } from "#/types/satellite";

/**
 * Validates the mod-10 checksum for a TLE line.
 *
 * Algorithm: Sum digit values of characters in positions 0–66 (0-indexed).
 * Digits count as their numeric value, dashes ('-') count as 1,
 * all other characters count as 0. The sum mod 10 should equal
 * the digit at position 68 (last character).
 */
export function validateTLEChecksum(line: string): boolean {
	if (line.length !== 69) {
		return false;
	}

	let sum = 0;
	for (let i = 0; i < 68; i++) {
		const ch = line[i];
		if (ch >= "0" && ch <= "9") {
			sum += Number(ch);
		} else if (ch === "-") {
			sum += 1;
		}
		// All other characters contribute 0
	}

	const expected = Number(line[68]);
	return sum % 10 === expected;
}

/**
 * Parses raw TLE text into validated TLERecord objects.
 *
 * - Strips leading/trailing whitespace from each line
 * - Discards empty lines
 * - Groups remaining lines into 3-line sets (name, line1, line2)
 * - Discards trailing incomplete group if lines aren't divisible by 3
 * - Validates line1 starts with "1" and is 69 chars
 * - Validates line2 starts with "2" and is 69 chars
 * - Validates mod-10 checksum for both line1 and line2
 * - Excludes invalid records, preserves original ordering
 */
export function parseTLEResponse(rawText: string): TLERecord[] {
	// Split into lines, strip whitespace, discard empty lines
	const lines = rawText
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	// If fewer than 3 non-empty lines, return empty
	if (lines.length < 3) {
		return [];
	}

	// Determine how many complete 3-line groups we have
	const groupCount = Math.floor(lines.length / 3);
	const records: TLERecord[] = [];

	for (let i = 0; i < groupCount; i++) {
		const name = lines[i * 3];
		const line1 = lines[i * 3 + 1];
		const line2 = lines[i * 3 + 2];

		// Validate line1: must start with "1" and be exactly 69 characters
		if (line1.length !== 69 || line1[0] !== "1") {
			continue;
		}

		// Validate line2: must start with "2" and be exactly 69 characters
		if (line2.length !== 69 || line2[0] !== "2") {
			continue;
		}

		// Validate checksums
		if (!validateTLEChecksum(line1) || !validateTLEChecksum(line2)) {
			continue;
		}

		records.push({
			id: name,
			line1,
			line2,
			epoch: extractEpoch(line1),
			fetchedAt: new Date().toISOString(),
		});
	}

	return records;
}

/**
 * Extracts the epoch from a TLE line 1.
 *
 * TLE line 1 format has the epoch year at columns 18-19 and
 * epoch day fraction at columns 20-31.
 */
function extractEpoch(line1: string): string {
	const yearStr = line1.substring(18, 20);
	const dayStr = line1.substring(20, 32).trim();

	let year = Number.parseInt(yearStr, 10);
	// Two-digit year: 57-99 → 1957-1999, 00-56 → 2000-2056
	year = year >= 57 ? 1900 + year : 2000 + year;

	const dayOfYear = Number.parseFloat(dayStr);

	// Convert year + fractional day to ISO date
	const date = new Date(Date.UTC(year, 0, 1));
	date.setTime(date.getTime() + (dayOfYear - 1) * 86400000);

	return date.toISOString();
}
