# UI standardizasyonu + Windows test turu — bulgular ve düzeltmeler

Tarih: 2026-08-01/04. Kapsam: footer/logo standardizasyonu (tüm dağıtım app'leri) ve
miniapps.tr'nin bir Windows 11 / Chrome makinesinde test edilmesiyle çıkan sorunlar.
AGENTS.md'deki tuzak maddeleri buraya işaret eder.

---

## A) Sticky footer + üst logo standardizasyonu (12 dağıtım app'i)

**Hedef:** miniapps footer logosu her app'te viewport dibine pinli; üst app logoları aynı boyutta.

**Sticky footer mekanizması** (her app'in `src/styles/global.css` sonuna append bloğu):
```
#root { display:flex; flex-direction:column; min-height:100vh; }
.<shell> { flex:1 0 auto; width:100%; padding-bottom:0; display:flex; flex-direction:column; }
.miniapps-footer { margin-top:auto; }
```
- INSIDE-main app'lerde (11 app) shell `grid→flex-column`'a çevrildi (tek-kolon grid'ler için güvenli;
  `align-items` flex-column'da aynı davranır; `justify-items`/`place-items` shell'lerde yoktu).
- qr-generator footer'ı `</main>` **dışında** (sibling), 2-kolon grid → shell'e `display:flex` verilmedi.

**Üç landmine (sırayla keşfedildi, hepsi canlıda kanıtlandı):**
1. **`margin: 0 auto` + flex = shrink-to-fit.** `#root` flex-column olunca, `margin:auto` olan shell
   tam genişliğe yayılmak yerine içeriğe göre büzülüp ortalanıyor (dev-toolkit 1280px viewport'ta
   1280→939px'e düştü). **Çözüm:** shell'e `width: 100%` (max-width cap'ler, margin auto ortalar).
2. **Shell `padding-bottom` footer'ı yukarı itiyor.** Footer shell'in içerik-kutusu dibine pinleniyor;
   shell'in alt padding'i footer'ın ALTINDA kalıyor (video-compressor 48px, audio-editor
   `clamp(64–104px)` → footer 48–100px yukarıda "havada"). **Çözüm:** append'te `padding-bottom: 0`
   (append dosya sonunda olduğu için tüm önceki padding/clamp/media kurallarını override eder).
3. **QR açık `width` kullanıyor, `max-width` değil.** `.qr-shell { width: min(1420px, calc(100vw - 40px)) }`
   ile yan boşluk (20px gutter) sağlıyor; yatay padding yok. Genel `width:100%` bunu ezip içeriği
   kenara yapıştırdı. QR'ın açık width'i var (auto değil) → flex'te shrink sorunu yaşamaz → `width:100%`
   **kaldırıldı** (sadece QR'dan).

**Üst logo standardı:** 76px masaüstü / 64px mobil (`@media max-width:760px`). Canlı ölçümle 13 app
tarandı: sadece **pdf-toolkit** (92→76) ve **dev-toolkit** (96→76) sapıyordu; diğer 9 zaten 76/64.
**qr-generator** logosu 106px (özel yan-hero akışı) — kasıtlı bırakıldı.
Footer logo: hepsinde `.miniapps-footer-logo { height:36px }`, asset `miniapps-logo-dark.svg` (açık temalı
app'ler) / `-light.svg` (koyu temalı PDF). Asset'ler ve boyut app'ler arası birebir aynı (md5 aynı).

## B) Ana sayfa (dağıtım home) büyük ekranda küçük kalıyordu

`.miniapps-shell.is-distribution .distribution-workspace .app-grid` 6 kolon, `max-width: 1320px`'de
sabit; >1600px'te `min-width` kuralı yoktu → 1920/2560'ta grid ortada küçük, geniş yan boşluk.
**Çözüm** (`miniapps/src/styles/global.css`): `@media (min-width: 1601px)` ile akıcı büyüme
`clamp(1320px, calc(100vw - 360px), 1900px)`. Ölçülen: 1920→1560px/ikon 212px, 2560→1900px/ikon 268px;
≤1600 **değişmedi**. Kartlar `1fr` olduğu için grid genişleyince ikonlar da büyür.

## C) Windows test turu — diğer sorunlar

- **QR seeded örnek veri sızıntısı (ÇÖZÜLDÜ).** `qr-generator/src/lib/defaults.ts` içindeki
  `exampleHistory` (3 örnek: İletişim Kartı/MMO Link/Misafir Wi-Fi) + `exampleFields` public site'ta
  ilk-ziyaretçiye gösteriliyordu; vCard'da **gerçek isim** (kullanıcının adı) vardı. `exampleHistory`
  boşaltıldı, `exampleFields` silindi; `storage.ts:isLegacyStarterDraft` eski localStorage starter'ını
  temizlemek için `mmo.org.tr`/`MMO-Guest` referansını tutuyor (görüntülenmiyor, org-genel) ama isim
  kontrolü kaldırıldı. İlk-ziyaretçi artık boş geçmişle başlar.

- **PDF compress "drop ekranında kalıyor" → geçici.** İkinci denemede çalıştı (cache/transient).
  pdf.js module worker deploy'da mevcut; kalıcı bir kod hatası bulunamadı.

- **Vocal Remover (stem-splitter) Windows installer sessiz başarısızlık (GUARD EKLENDİ).**
  `Install MiniApps Helpers.cmd`, kardeş `Install MiniApps Helpers.ps1`'i `%~dp0` ile çağırıyor.
  Kullanıcı `.cmd`'yi **ZIP'in içinden** (çıkartmadan) çalıştırınca Windows sadece `.cmd`'yi bir temp
  klasöre çıkarıp çalıştırıyor, `.ps1` orada olmuyor → PowerShell "file does not exist" hatası veriyor
  ama batch yine "Installation completed" yazıyordu → helper kurulmuyor, app "hazır değil" diyor
  (`backendHealth` null = helper'a erişilemiyor). **Çözüm:** `.cmd`'ye `.ps1` var mı guard'ı eklendi
  ("önce ZIP'i çıkart" mesajı + abort). Değişiklik `distribution/stem-helper/templates-windows/` →
  `windows-helpers.yml` Actions ile yeni helper build'i üretilir; kullanıcı yeniden indirmeli.
  **Kullanıcıya hemen çözüm:** ZIP'i tamamen çıkart, `.cmd`'yi çıkartılan klasörden çalıştır.

- **video-to-audio & audio-editor (ffmpeg.wasm) — COEP/SharedArrayBuffer — BEKLEMEDE.**
  Console: `ffmpeg-core.worker.js` 404 + `worker-BAOIWoxA.js` "COEP ile bloklandı" (COEP NOT-SET).
  Kök neden: `build-github-pages.mjs`'in ürettiği `service-worker.js` COOP/COEP header'ını **yalnızca
  navigation (HTML) yanıtına** ekliyor (`addCrossOriginIsolationHeaders` → `navigationNetworkFirst`),
  ffmpeg'in **worker script'ine** eklemiyor → worker cross-origin-isolated olamıyor → SharedArrayBuffer
  bloklu. Mac'te çalışıyor çünkü orada Vite dev-server header'ları veriyor (`vite.config.ts`
  COOP/COEP). App'ler `@ffmpeg/core ^0.12.6` (ST) bağımlısı ama build `crossOriginIsolatedEntryUrls`'te
  (MT/SAB gerektiren) sayıyor — olası tutarsızlık. İki aday çözüm (ikisi de failing tarayıcıda test
  gerektirir): (1) SW'yi worker yanıtlarına da COOP/COEP ekleyecek şekilde düzelt; (2) app'leri
  tek-thread core'a hizalayıp COEP'i kaldır (video-compressor WebCodecs kullandığı için COEP'siz
  çalışıyor — farklı teknoloji, birebir örnek değil). **Kör düzeltme yapılmadı** (Mac'te çalışan
  kurulumu bozma riski). Windows'ta F12 açık iteratif test gerekli.
