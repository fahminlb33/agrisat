import { defineConfig } from "vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";

import { nitro } from "nitro/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import babel from "@rolldown/plugin-babel";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		nitro(),
		tailwindcss(),
		tanstackStart({ spa: { enabled: true } }),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
});

export default config;
