export function toTitleCase(text: string | undefined) {
	if (!text) return text;
	return text.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}
