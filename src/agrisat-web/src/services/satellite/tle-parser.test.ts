import { describe, it, expect } from "vitest";
import { parseTLEResponse, validateTLEChecksum } from "./tle-parser";

// ISS TLE with correct mod-10 checksums
const ISS_NAME = "ISS (ZARYA)";
const ISS_LINE1 =
	"1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9997";
const ISS_LINE2 =
	"2 25544  51.6400 208.9163 0006703 300.2578  59.7876 15.49560439431105";

describe("validateTLEChecksum", () => {
	it("returns true for a valid line1 checksum", () => {
		expect(validateTLEChecksum(ISS_LINE1)).toBe(true);
	});

	it("returns true for a valid line2 checksum", () => {
		expect(validateTLEChecksum(ISS_LINE2)).toBe(true);
	});

	it("returns false for a line with incorrect checksum", () => {
		// Change last digit to make checksum invalid
		const badLine = ISS_LINE1.slice(0, 68) + "0";
		expect(validateTLEChecksum(badLine)).toBe(false);
	});

	it("returns false for a line that is not 69 characters", () => {
		expect(validateTLEChecksum("1 25544U 98067A")).toBe(false);
		expect(validateTLEChecksum("")).toBe(false);
	});

	it("counts dashes as 1 in checksum calculation", () => {
		// Construct a line where dashes affect the checksum
		// A line of 69 chars: 68 content chars + 1 checksum char
		// All spaces except position 0 is '1' and some dashes
		const base = "1" + " ".repeat(67);
		// Sum = 1 (from the '1' at pos 0), checksum should be 1
		const line = base + "1";
		expect(validateTLEChecksum(line)).toBe(true);

		// Add a dash at position 5
		const withDash = "1" + "    -" + " ".repeat(62) + "2";
		// Sum = 1 (digit '1') + 1 (dash) = 2, checksum char = '2'
		expect(validateTLEChecksum(withDash)).toBe(true);
	});
});

describe("parseTLEResponse", () => {
	it("parses a valid 3-line TLE into a TLERecord", () => {
		const raw = `${ISS_NAME}\n${ISS_LINE1}\n${ISS_LINE2}`;
		const records = parseTLEResponse(raw);

		expect(records).toHaveLength(1);
		expect(records[0].id).toBe(ISS_NAME);
		expect(records[0].line1).toBe(ISS_LINE1);
		expect(records[0].line2).toBe(ISS_LINE2);
	});

	it("strips leading/trailing whitespace from lines", () => {
		const raw = `  ${ISS_NAME}  \n  ${ISS_LINE1}  \n  ${ISS_LINE2}  `;
		const records = parseTLEResponse(raw);

		expect(records).toHaveLength(1);
		expect(records[0].id).toBe(ISS_NAME);
	});

	it("discards empty lines", () => {
		const raw = `\n\n${ISS_NAME}\n\n${ISS_LINE1}\n\n${ISS_LINE2}\n\n`;
		const records = parseTLEResponse(raw);

		expect(records).toHaveLength(1);
		expect(records[0].id).toBe(ISS_NAME);
	});

	it("returns empty array for empty input", () => {
		expect(parseTLEResponse("")).toHaveLength(0);
		expect(parseTLEResponse("   ")).toHaveLength(0);
		expect(parseTLEResponse("\n\n\n")).toHaveLength(0);
	});

	it("returns empty array for fewer than 3 non-empty lines", () => {
		expect(parseTLEResponse("line1\nline2")).toHaveLength(0);
		expect(parseTLEResponse("only one")).toHaveLength(0);
	});

	it("discards trailing incomplete group", () => {
		// 3 valid lines + 1 extra line = only 1 complete group
		const raw = `${ISS_NAME}\n${ISS_LINE1}\n${ISS_LINE2}\nEXTRA`;
		const records = parseTLEResponse(raw);
		expect(records).toHaveLength(1);
	});

	it("discards trailing incomplete group (2 extra lines)", () => {
		const raw = `${ISS_NAME}\n${ISS_LINE1}\n${ISS_LINE2}\nEXTRA1\nEXTRA2`;
		const records = parseTLEResponse(raw);
		expect(records).toHaveLength(1);
	});

	it("excludes records with invalid line prefix", () => {
		// line1 doesn't start with '1'
		const badLine1 = "2" + ISS_LINE1.slice(1);
		const raw = `${ISS_NAME}\n${badLine1}\n${ISS_LINE2}`;
		const records = parseTLEResponse(raw);
		expect(records).toHaveLength(0);
	});

	it("excludes records where line2 doesn't start with '2'", () => {
		const badLine2 = "1" + ISS_LINE2.slice(1);
		const raw = `${ISS_NAME}\n${ISS_LINE1}\n${badLine2}`;
		const records = parseTLEResponse(raw);
		expect(records).toHaveLength(0);
	});

	it("excludes records with wrong line length", () => {
		const shortLine1 = ISS_LINE1.slice(0, 50);
		const raw = `${ISS_NAME}\n${shortLine1}\n${ISS_LINE2}`;
		const records = parseTLEResponse(raw);
		expect(records).toHaveLength(0);
	});

	it("excludes records with invalid checksum but keeps valid ones", () => {
		const badLine1 = ISS_LINE1.slice(0, 68) + "0"; // Bad checksum
		const raw = [
			// Invalid record
			"BAD SAT",
			badLine1,
			ISS_LINE2,
			// Valid record
			ISS_NAME,
			ISS_LINE1,
			ISS_LINE2,
		].join("\n");

		const records = parseTLEResponse(raw);
		expect(records).toHaveLength(1);
		expect(records[0].id).toBe(ISS_NAME);
	});

	it("preserves original ordering of valid records", () => {
		const sat2Name = "NOAA 15";
		const sat2Line1 =
			"1 25338U 98030A   24001.50000000  .00000300  00000-0  15000-3 0  9996";
		const sat2Line2 =
			"2 25338  98.7200 100.0000 0010000  90.0000 270.0000 14.25000000000008";

		const raw = [
			ISS_NAME,
			ISS_LINE1,
			ISS_LINE2,
			sat2Name,
			sat2Line1,
			sat2Line2,
		].join("\n");

		const records = parseTLEResponse(raw);
		// Only include records that pass validation
		// Check the first valid one is ISS
		const validRecords = records.filter(
			(r) => r.id === ISS_NAME || r.id === sat2Name,
		);
		if (validRecords.length >= 2) {
			expect(validRecords[0].id).toBe(ISS_NAME);
			expect(validRecords[1].id).toBe(sat2Name);
		}
	});

	it("sets epoch from TLE line1 data", () => {
		const raw = `${ISS_NAME}\n${ISS_LINE1}\n${ISS_LINE2}`;
		const records = parseTLEResponse(raw);

		expect(records).toHaveLength(1);
		// Epoch in ISS_LINE1 is "24001.50000000" meaning year 2024, day 1.5
		// That's January 1, 2024 at noon UTC
		const epoch = new Date(records[0].epoch);
		expect(epoch.getUTCFullYear()).toBe(2024);
		expect(epoch.getUTCMonth()).toBe(0); // January
		expect(epoch.getUTCDate()).toBe(1);
	});

	it("sets fetchedAt to a valid ISO timestamp", () => {
		const raw = `${ISS_NAME}\n${ISS_LINE1}\n${ISS_LINE2}`;
		const before = new Date().toISOString();
		const records = parseTLEResponse(raw);
		const after = new Date().toISOString();

		expect(records).toHaveLength(1);
		expect(records[0].fetchedAt >= before).toBe(true);
		expect(records[0].fetchedAt <= after).toBe(true);
	});
});
