import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.MINIAPPS_BASE ?? "/";
const outDir = process.env.MINIAPPS_OUT_DIR ?? "dist";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 4183,
    strictPort: true,
  },
  optimizeDeps: {
    include: ["pdfjs-dist"],
  },
});
