import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-internal",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "index.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4181,
    strictPort: true,
  },
});
