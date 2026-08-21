import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
	plugins: [react()],
	define: {
		"process.env.NODE_ENV": JSON.stringify(
			mode === "dev" ? "development" : "production",
		),
	},
	build: {
		sourcemap: mode === "dev" ? true : false,
		minify: mode === "dev" ? false : "esbuild",
		lib: {
			entry: fileURLToPath(new URL("./src/sifpress-ui.ts", import.meta.url)),
			formats: ["es"],
			fileName: () => "ui-sdk.mjs",
		},
		rollupOptions: {
			output: {
				codeSplitting: false,
			},
		},
	},
}));
