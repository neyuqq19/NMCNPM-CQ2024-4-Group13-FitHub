import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // Workspaces use different React versions for Expo and web. Resolve shared UI
  // dependencies against this app's React to avoid duplicate-hook runtimes.
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@fithub/contracts": fileURLToPath(
        new URL("../shared/src/index.ts", import.meta.url),
      ),
    },
  },
  cacheDir: process.env.VITE_CACHE_DIR || "node_modules/.vite",
  optimizeDeps: { include: ["@zxing/browser", "@zxing/library"] },
  server: { port: 5173, strictPort: true },
});
