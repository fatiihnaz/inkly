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
  // Babel parser/traverse: heavy CJS modules used only by the cms-sync CLI
  // and the discover helper. Leave them external so tsup doesn't bundle them
  // (would explode dist size and break the @babel/traverse interop trick).
  external: [
    "react", "react-dom", "next",
    "@babel/parser", "@babel/traverse",
  ],
});
