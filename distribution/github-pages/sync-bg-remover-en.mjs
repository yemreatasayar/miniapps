import { cpSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.join(__dirname, "site");
const trRoot = path.join(siteRoot, "apps", "bg-remover");
const enRoot = path.join(siteRoot, "apps-en", "bg-remover");

const replacements = [
  ['children:"Bilgi"', 'children:"Info"'],
  ['"Görsel yüklemek için tıkla veya sürükle bırak"', '"Click to upload an image or drag and drop"'],
  ['"İşleniyor…"', '"Processing…"'],
  ['"Görselleri buraya bırak"', '"Drop images here"'],
  ['"PNG, JPG, WEBP ve diğer görsel formatlarını tek seferde ekleyebilirsin."', '"You can add PNG, JPG, WEBP, and other image formats in one go."'],
  ['"Dosya Seç"', '"Choose File"'],
  ['"veya çoklu sürükle bırak"', '"or drag and drop multiple files"'],
  ['"AI modeli çalışıyor"', '"AI model is running"'],
  ['"WASM hazırlanıyor"', '"Preparing WASM"'],
  ['"Varlıklar yükleniyor"', '"Loading assets"'],
  ['"İşleniyor"', '"Processing"'],
  ['"Çıktı hazırlanıyor"', '"Preparing output"'],
  ['"Lütfen bekleyin…"', '"Please wait…"'],
  ['"Son dosya hazırlanıyor…"', '"Preparing final file…"'],
  ['"İşlem devam ediyor"', '"Processing in progress"'],
  ['"Çıktı boyutu"', '"Output size"'],
  ['"Boyut farkı"', '"Size difference"'],
  ['"Lütfen bir görsel dosyası seç."', '"Please choose an image file."'],
  ['"Görsel olmayan dosyalar atlandı."', '"Non-image files were skipped."'],
  ['"Başlatılıyor"', '"Starting"'],
  ['"İşlem başarısız."', '"Processing failed."'],
  ['"Toplu işlem başarısız."', '"Batch processing failed."'],
  ['"İndirilecek hazır çıktı bulunamadı."', '"No ready output found to download."'],
  ['"Arka planı kaldır, nesneyi temiz çıkar."', '"Remove the background and keep the subject clean."'],
  ['"Görsellerini tarayıcıda AI ile işle. Dosyaların sunucuya gitmiyor, her şey cihazında çalışıyor."', '"Process your images with AI in the browser. Files are not sent to a server; everything runs on your device."'],
  ['"Şeffaf PNG"', '"Transparent PNG"'],
  ['"Alpha kanallı çıktı"', '"Alpha channel output"'],
  ['"Yerelde işlem"', '"Processed locally"'],
  ['"Sunucuya yükleme yok"', '"No server upload"'],
  ['"Görseller"', '"Images"'],
  ['"Yüklenen tüm görseller burada. Tıkla veya bu alana yeni dosya bırak."', '"All uploaded images appear here. Click or drop new files into this area."'],
  ['"Yüklenen görseller"', '"Uploaded images"'],
  ['"Hazır"', '"Ready"'],
  ['"Arka Planı Temizle"', '"Remove Background"'],
  ['"Tamamlandı"', '"Done"'],
  ['"PNG İndir"', '"Download PNG"'],
  ['"ZIP İndir"', '"Download ZIP"'],
  ['"Nasıl çalışır?"', '"How it works?"'],
];

function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full));
    else results.push(full);
  }
  return results;
}

rmSync(enRoot, { recursive: true, force: true });
cpSync(trRoot, enRoot, { recursive: true });

for (const filePath of collectFiles(enRoot)) {
  if (!filePath.endsWith(".js") && !filePath.endsWith(".css")) continue;
  const original = readFileSync(filePath, "utf8");
  let updated = original;
  for (const [from, to] of replacements) {
    updated = updated.split(from).join(to);
  }
  if (updated !== original) writeFileSync(filePath, updated);
}

console.log("apps-en/bg-remover synced from TR build with EN localization applied.");
