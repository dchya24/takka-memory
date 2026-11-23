import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirror pi's extension-view: local tests resolve `@earendil-works/pi-ai` to the shim
// (TypeBox Type + StringEnum) exactly like pi-coding-agent does for extensions at runtime.
export default defineConfig({
	resolve: {
		alias: {
			"@earendil-works/pi-ai": path.resolve(
				path.dirname(fileURLToPath(import.meta.url)),
				"src/adapters/pi-ai-shim.ts",
			),
		},
	},
});
