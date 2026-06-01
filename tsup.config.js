import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.js",
    server: "src/server/get-content.js",
    actions: "src/server/actions.js",
    page: "src/server/cms-page.jsx",
    "cli-sync": "src/cli/sync.js",
  },
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  // oxc-parser: native (napi) parser used only by the cms-sync CLI and the
  // discover helper. Must stay external - tsup can't bundle the platform
  // binary, and it's resolved from the consumer's node_modules at runtime.
  external: [
    "react", "react-dom", "next",
    "oxc-parser",
  ],
});
