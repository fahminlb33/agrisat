export const VARIABLE_KEY_MAP: Record<number, string> = {
	2: "ndvi",
	3: "gndvi",
	4: "wdrvi",
	5: "msavi",
	6: "ndre",
	7: "cire",
	8: "ndmi",
	9: "ndwi",
};

export function getVariableKey(variableId: number): string {
	return VARIABLE_KEY_MAP[variableId] ?? "ndvi";
}
