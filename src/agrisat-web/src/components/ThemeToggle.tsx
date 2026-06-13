import { useEffect, useState } from "react";
import { Sun, Moon, SunMoon } from "lucide-react";

type ThemeMode = "light" | "dark" | "auto";

function getInitialMode(): ThemeMode {
	if (typeof window === "undefined") {
		return "auto";
	}

	const stored = window.localStorage.getItem("theme");
	if (stored === "light" || stored === "dark" || stored === "auto") {
		return stored;
	}

	return "auto";
}

function applyThemeMode(mode: ThemeMode) {
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;

	document.documentElement.classList.remove("light", "dark");
	document.documentElement.classList.add(resolved);

	if (mode === "auto") {
		document.documentElement.removeAttribute("data-theme");
	} else {
		document.documentElement.setAttribute("data-theme", mode);
	}

	document.documentElement.style.colorScheme = resolved;
}

export default function ThemeToggle({
	variant = "sidebar",
}: {
	variant?: "sidebar" | "floating";
}) {
	const [mode, setMode] = useState<ThemeMode>("auto");

	useEffect(() => {
		const initialMode = getInitialMode();
		setMode(initialMode);
		applyThemeMode(initialMode);
	}, []);

	useEffect(() => {
		if (mode !== "auto") {
			return;
		}

		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyThemeMode("auto");

		media.addEventListener("change", onChange);
		return () => {
			media.removeEventListener("change", onChange);
		};
	}, [mode]);

	function toggleMode() {
		const nextMode: ThemeMode =
			mode === "light" ? "dark" : mode === "dark" ? "auto" : "light";
		setMode(nextMode);
		applyThemeMode(nextMode);
		window.localStorage.setItem("theme", nextMode);
	}

	const label =
		mode === "auto"
			? "Theme mode: auto (system). Click to switch to light mode."
			: `Theme mode: ${mode}. Click to switch mode.`;

	const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : SunMoon;
	const modeLabel =
		mode === "light" ? "Light" : mode === "dark" ? "Dark" : "Auto";

	return (
		<button
			type="button"
			onClick={toggleMode}
			aria-label={label}
			title={label}
			className={
				variant === "floating"
					? "flex items-center gap-2 rounded-xl bg-background/95 px-3 py-2.5 text-sm font-medium text-foreground shadow-lg backdrop-blur-md ring-1 ring-border/50 transition-all duration-200 hover:shadow-xl"
					: "flex items-center gap-2 rounded-2xl border border-sidebar-border bg-sidebar-accent px-3 py-1.5 text-sm font-semibold text-sidebar-foreground transition hover:-translate-y-0.5"
			}
		>
			<Icon className="h-4 w-4" />
			{modeLabel}
		</button>
	);
}
