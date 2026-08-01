import { defineConfig } from "tsdown";

export default defineConfig({
	exports: true,
	deps: {
		alwaysBundle: [],
	},
	publint: true,
	dts: { entry: ["src/index.ts"] },
});
