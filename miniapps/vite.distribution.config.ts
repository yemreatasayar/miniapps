import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const base = process.env.MINIAPPS_BASE ?? "/";
const outDir = process.env.MINIAPPS_OUT_DIR ?? "dist";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "distribution.html"),
      },
    },
  },
});
