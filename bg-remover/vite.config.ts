import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const base = process.env.MINIAPPS_BASE ?? "/";
const outDir = process.env.MINIAPPS_OUT_DIR ?? "dist";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ["@imgly/background-removal"],
  },
  server: {
    port: 4188,
    host: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
});
