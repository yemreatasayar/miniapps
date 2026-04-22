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
  server: { port: 4192, host: true },
});
