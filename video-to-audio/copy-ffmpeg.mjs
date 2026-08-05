import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// ESM versiyonu kullan: module worker ile çalışan "export default" içeriyor.
// UMD versiyonu module worker'da importScripts yerine dynamic import kullanıldığında
// .default olmadığı için ERROR_IMPORT_FAILURE hatası verir.
const coreDir = resolve(__dirname, "node_modules/@ffmpeg/core/dist/esm");
const outDir = resolve(__dirname, "public/ffmpeg");

mkdirSync(outDir, { recursive: true });

for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const sourcePath = resolve(coreDir, file);

  if (!existsSync(sourcePath)) {
    console.log(`Atlandi: ${file} (pakette yok)`);
    continue;
  }

  copyFileSync(sourcePath, resolve(outDir, file));
  console.log(`Kopyalandi: ${file}`);
}
