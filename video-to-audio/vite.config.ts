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
    // @ffmpeg/ffmpeg ve @ffmpeg/util, Web Worker oluşturma için
    // import.meta.url'e dayandığından Vite pre-bundling ile
    // worker.js URL'i hatalı çözümleniyor (404). Bu paketleri
    // pre-bundling dışında tutunca Vite node_modules'dan olduğu
    // gibi sunar ve worker URL doğru çalışır.
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  server: {
    port: 4186,
    host: true,
  },
});
