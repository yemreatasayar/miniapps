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
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  server: {
    port: 4324,
    host: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
