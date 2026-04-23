# Stem Splitter Faz 1 Gorev Ozeti

## Kapsam

Bu calisma, `distribution/github-pages/STEM-HELPER-DESIGN.md` baz alinarak
`stem-splitter` icin Faz 1 helper entegrasyonunun backend ve frontend temelini
hazirlamak amaciyla yapildi.

Odak noktasi:

- backend'i configurable ve packageable hale getirmek
- sabit path bagimliliklarini kaldirmak
- CORS allowlist'i config'e tasimak
- runtime path'lerini disaridan alabilmek
- frontend'i yeni helper health/install sozlesmesine baglamak

## Yapilan Backend Degisiklikleri

### 1. Config tabanli runtime yuklemesi

`backend/server.mjs` artik runtime ayarlarini su kaynaklardan okuyabiliyor:

- varsayilan config dosyasi: `backend/helper-config.json`
- komut satiri: `node backend/server.mjs --config /path/to/config.json`
- environment override'lari: `MINIAPPS_STEM_HELPER_*`

Desteklenen ana alanlar:

- `host`
- `port`
- `baseDir`
- `tmpDir`
- `pythonBin`
- `ffmpegBin`
- `modelName`
- `allowedOrigins`
- `extraOrigins`

### 2. Sabit path'lerin kaldirilmasi

Asagidaki sabit bagimliliklar kaldirildi:

- mutlak `ROOT_DIR`
- sabit `.venv/bin/python3`
- sabit `ffmpeg` varsayimi

Bunlar artik config veya env ile belirlenebiliyor.

### 3. CORS allowlist yapisi

CORS artik tek bir origin'e sabitlenmis degil.

- `allowedOrigins` ve `extraOrigins` birlestiriliyor
- request origin normalize edilip allowlist ile eslestiriliyor
- izinli olmayan origin icin `403` ve acik hata mesaji donuluyor

### 4. Health endpoint genisletmesi

`GET /api/health` artik yalnizca warm-up durumunu degil, kurulum tanisini da
donduruyor.

Ek alanlar:

- `ffmpegBin`
- `pythonInstalled`
- `install.helperVersion`
- `install.platform`
- `install.configPath`
- `install.baseDir`
- `install.allowedOrigins`

### 5. Paketlenebilir helper zemini

`baseDir` mantigi sayesinde packaged helper icinde sibling runtime klasorlerine
gore relatif cozumleme yapilabiliyor. Bu, macOS/Windows helper paket yapisina
gecis icin temel hazirlik sagliyor.

## Yapilan Frontend Degisiklikleri

### 1. Yeni helper durum modeli

Frontend artik helper durumunu daha ince seviyede ele aliyor:

- `checking`
- `offline`
- `warmup`
- `issue`
- `ready`

### 2. API katmani guncellemesi

`src/lib/api.ts` su sekilde guncellendi:

- yeni health alanlari tiplendi
- `ApiError` sinifi eklendi
- network / HTTP hata ayrimi netlestirildi
- `VITE_STEM_SPLITTER_API_BASE` destegi eklendi

### 3. App davranisi

`src/App.tsx` icinde:

- helper yoksa veya hataliysa yukleme alani pasiflesiyor
- helper warm-up durumundaysa bilgilendirme gorunuyor
- helper `ready` olmadan split baslatilmiyor
- `Tekrar Dene` ile health kontrolu manuel tetiklenebiliyor
- backend durum hatalari ile split islem hatalari ayrildi

### 4. UI guncellemeleri

`src/styles/global.css` icinde helper durum kartlari ve rozetleri eklendi:

- helper state badge
- helper summary card
- helper issue/offline/warmup bloklari
- disabled drop-zone stilleri

## Eklenen veya Guncellenen Dosyalar

- `stem-splitter/backend/server.mjs`
- `stem-splitter/backend/helper-config.json`
- `stem-splitter/backend/INSTALL_NOTES.md`
- `stem-splitter/src/lib/api.ts`
- `stem-splitter/src/App.tsx`
- `stem-splitter/src/styles/global.css`

## Dogrulama

Calisma sirasinda asagidaki kontroller yapildi:

- `node -c stem-splitter/backend/server.mjs`
- `npm run build`

Sonuc:

- backend dosyasi syntax kontrolunden gecti
- frontend production build basarili tamamlandi

## Bilinen Sinirlar

- helper kurulum dosyalari henuz uretilmedi
- frontend tarafinda gercek indirme linkleri yok; bu nedenle kurulum CTA'si
  su an tanisal durum ve `Tekrar Dene` akisiyla sinirli
- packaged runtime'larin gercek calisma testi bu adimda yapilmadi

## Sonraki Mantikli Adimlar

1. Helper installer/paket ciktilarini olusturmak
2. Frontend'e platform bazli gercek kurulum linkleri eklemek
3. GitHub Pages shell kartini hidden durumdan cikarmak
4. Helper versioning ve update hikayesini netlestirmek
5. Paketlenmis runtime ile smoke test yapmak
