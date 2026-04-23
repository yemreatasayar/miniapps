# Stem Splitter Web + Helper Tasarımı

## Amaç

`stem-splitter` uygulamasını GitHub Pages üstündeki canlı `miniapps` shell'ine
tam browser-only hale getirmeden ekleyebilmek.

Hedef davranış:

- kullanıcı canlı sitede `Vocal Remover` kartını görür
- uygulama açıldığında local helper var mı kontrol edilir
- helper varsa işlem tamamen kullanıcının kendi cihazında yapılır
- helper yoksa kullanıcı en kısa yoldan helper kurulumuna yönlendirilir
- kullanıcı ses dosyasını bizim server'ımıza yüklemez
- işlem GitHub Pages veya başka bir cloud backend üzerinde çalışmaz

---

## Kısa Karar

Bu araç için en doğru model:

- **web shell + local helper**

Bu araç için şimdilik uygun olmayan model:

- **GitHub Pages üzerinde saf browser-only split**

Neden:

- frontend şu anda `http://127.0.0.1:4195` backend'ine bağlı
- backend Python `.venv` + `demucs` + sistem `ffmpeg` istiyor
- işlem CPU yoğun ve model tabanlı
- statik hosting ile sunulabilir, ama statik hosting üzerinde çalıştırılamaz

---

## Kullanıcı Akışı

### Akış A — Helper kuruluysa

1. Kullanıcı shell'de `Vocal Remover` kartına tıklar.
2. App açılır.
3. Frontend `http://127.0.0.1:4195/api/health` çağrısı yapar.
4. Helper sağlıklıysa normal çalışma ekranı görünür.
5. Kullanıcı dosya seçer.
6. Split işlemi local helper'da başlar.
7. Sonuç dosyaları helper'dan indirilir.
8. Geçici iş klasörleri helper tarafından temizlenir.

### Akış B — Helper kurulu değilse

1. Kullanıcı `Vocal Remover` kartına tıklar.
2. App açılır.
3. Health check başarısız olur.
4. Kullanıcıya net bir kurulum ekranı gösterilir:
   - `Bu araç cihazında çalışan küçük bir yardımcı servis gerektirir.`
   - `Ses dosyan yine cihazında kalır; işlem server'a yüklenmez.`
5. Kullanıcı işletim sistemine göre kurulum dosyasını indirir:
   - `Stem Helper for macOS`
   - `Stem Helper for Windows`
6. Kurulum tamamlandıktan sonra kullanıcı `Tekrar Dene` butonuna basar.
7. App health check'i tekrar yapar ve açılır.

---

## UX Tasarımı

## Shell kartı

Kart görünür olabilir ama küçük bir secondary etiket taşıyabilir:

- `Local helper gerekli`

Bu etiket şart değil; ilk sürümde sade kalması istenirse kaldırılabilir.

## App açılış durumları

### 1. Helper aranıyor

- Başlık: `Local helper kontrol ediliyor`
- Alt metin: `Cihazındaki stem engine aranıyor. Bu işlem birkaç saniye sürebilir.`

### 2. Helper yok

- Başlık: `Vocal Remover hazır değil`
- Alt metin: `Bu araç local helper ile çalışır. Ses dosyan cihazında işlenir; server'a yüklenmez.`
- Butonlar:
  - `macOS için indir`
  - `Windows için indir`
  - `Tekrar dene`

### 3. Helper var ama warm-up sürüyor

- Başlık: `Model hazırlanıyor`
- Alt metin: `İlk açılışta helper modeli ısıtıyor. Birkaç dakika sürebilir.`
- İsteğe bağlı detay:
  - `Warm-up durumu: running / ready / error`

### 4. Helper hata verdi

- Başlık: `Local helper çalışıyor ama hazır değil`
- Gösterilebilecek bilgiler:
  - `ffmpeg bulunamadı`
  - `Python ortamı eksik`
  - `Model warm-up başarısız`

İlk sürümde kullanıcıya ham hata göstermek yerine sade dil tercih edilmeli.

---

## Teknik Mimari

## Web tarafı

- `stem-splitter` frontend'i `apps/stem-splitter/` ve `apps-en/stem-splitter/`
  olarak build edilebilir
- `distribution-config.json` içinde hidden olmaktan çıkarılabilir
- frontend health check için `GET /api/health` kullanır
- split işlemi `POST /api/split` ile local helper'a gider

## Tarayıcı uyumluluğu

Canlı site `https` üzerinden çalışırken helper `http://127.0.0.1:4195` üstünde
dinler.

Bu model pratikte Chromium tabanlı tarayıcılarda çalışır; çünkü loopback
adresleri için özel davranış vardır.

MVP için destek hedefi açıkça şu olmalıdır:

- Chrome
- Edge
- diğer Chromium tabanlı masaüstü tarayıcılar

Firefox ve benzeri tarayıcılarda loopback/mixed-content davranışı ayrıca test
edilmeden resmi destek verilmemelidir.

## Helper tarafı

Tek bir local servis:

- `http://127.0.0.1:4195`

Görevleri:

- `demucs` split işlemini çalıştırmak
- geçici dosyaları yönetmek
- job progress dönmek
- sonuç dosyalarını local download endpoint'leriyle sunmak
- warm-up durumunu bildirmek

---

## Helper Paket Yapısı

## macOS

Önerilen teslim paketi:

```text
stem-helper-mac/
├── Stem Helper.app
├── Install Stem Helper.command
├── Uninstall Stem Helper.command
├── runtime/
│   ├── node
│   ├── python/
│   ├── ffmpeg
│   └── app/
│       ├── server.mjs
│       ├── requirements.txt
│       └── helper-config.json
└── logs/
```

### macOS MVP

En hızlı uygulanabilir çözüm:

- `Install Stem Helper.command`
- helper kullanıcı dizinine kurulup `LaunchAgent` ile çalıştırılır

Örnek kurulum hedefi:

```text
~/Library/Application Support/miniapps/stem-helper/
```

Örnek agent:

```text
~/Library/LaunchAgents/com.miniapps.stem-helper.plist
```

## Windows

Önerilen teslim paketi:

```text
stem-helper-win/
├── Install Stem Helper.bat
├── Uninstall Stem Helper.bat
├── Start Stem Helper.vbs
├── runtime/
│   ├── node.exe
│   ├── python/
│   ├── ffmpeg.exe
│   └── app/
│       ├── server.mjs
│       ├── requirements.txt
│       └── helper-config.json
└── logs/
```

### Windows MVP

En hızlı uygulanabilir çözüm:

- helper kullanıcı profiline kurulup Startup shortcut veya Task Scheduler ile açılır

---

## Kurulum Mantığı

## Hedef

Kullanıcıdan şunları istememek:

- Homebrew kur
- Python kur
- terminalde pip çalıştır
- `ffmpeg` elle kur

## İdeal yaklaşım

Kurulum paketinin içinde gömülü runtime'lar olsun:

- Node
- Python
- ffmpeg
- helper server kodu

Kurulum script'i şunları yapar:

1. hedef klasörü oluşturur
2. runtime dosyalarını kopyalar
3. gerekli yazma izinlerini ayarlar
4. local config üretir
5. servis tanımını kurar
6. helper'ı başlatır
7. health check yapar
8. başarı mesajı verir

## Model indirme

`demucs` modeli kurulum paketinin içine gömülmeyebilir.
İlk çalıştırmada indirilmesi daha gerçekçi.

Bu durumda:

- helper ilk açılışta warm-up yapar
- model cache kullanıcının cihazında oluşur
- ilk çalıştırma yavaş olabilir

Bu maliyet kabul edilebilir; çünkü server compute maliyeti yine sıfır kalır.

---

## Minimum Teknik Gereksinimler

## Backend tarafında uyarlama gerekecekler

Bugünkü backend kodu çok lokal path'e bağlı:

- `ROOT_DIR` sabit makine yoluna gömülü
- `.venv/bin/python3` sabit path kabul ediyor
- `ffmpeg` sistemde varsayılıyor
- CORS yalnızca `http://localhost:4194` için açık

Dağıtıma uygun hale getirmek için:

1. `ROOT_DIR` dinamik olmalı
2. Python binary path config'ten gelmeli
3. ffmpeg path config'ten gelmeli
4. CORS allowlist web domain'i de kapsamalı
5. health response kurulum tanısı verebilmeli

Önerilen config:

```json
{
  "port": 4195,
  "pythonBin": "./runtime/python/bin/python3",
  "ffmpegBin": "./runtime/ffmpeg",
  "allowedOrigins": [
    "https://yemreatasayar.github.io",
    "http://127.0.0.1:4179",
    "http://localhost:4179"
  ],
  "extraOrigins": [
    "https://miniapps.example.com"
  ]
}
```

Not:

- `allowedOrigins` içine mevcut resmi origin'ler yazılır
- `extraOrigins` alanı ileride custom domain eklendiğinde helper kurulumunu
  yeniden paketlemeden allowlist genişletmek için tutulabilir
- custom domain'e geçilirse helper config'i de buna göre güncellenmelidir

---

## Health Check Sözleşmesi

Mevcut health endpoint korunabilir ama biraz genişletilmeli:

```json
{
  "ok": true,
  "ffmpegInstalled": true,
  "pythonBin": "...",
  "model": "htdemucs",
  "warmup": {
    "status": "ready",
    "message": "Model hazır"
  },
  "install": {
    "helperVersion": "1.0.0",
    "platform": "macos-arm64"
  }
}
```

Bu sayede frontend sadece "var / yok" değil, "hazır / bozuk / kurulum eksik"
ayrımını da yapabilir.

---

## Güvenlik ve Gizlilik

Bu modelin temel avantajı:

- kullanıcı ses dosyası cloud backend'e yüklenmez
- model inference kullanıcının kendi cihazında çalışır
- GitHub Pages sadece statik shell sunar

Riskler:

- local helper açık bir port dinler
- CORS gevşek bırakılırsa istenmeyen local siteler erişebilir
- temp klasörleri iyi temizlenmezse disk tüketimi artar

Alınması gereken önlemler:

- yalnızca gerekli origin'lere izin ver
- mümkünse local token / nonce ekle
- job TTL ve cleanup zorunlu olsun
- output indirme sonrası cleanup sürsün

---

## MVP Önerisi

İlk sürüm için önerilen kapsam:

1. `stem-splitter` shell'de görünür olsun
2. helper yoksa kurulum ekranı çıksın
3. yalnızca macOS helper paketi hazırlansın
4. Windows daha sonra gelsin
5. model ilk açılışta indirilsin
6. app içinden `helper yok / warm-up / hazır` durumları yönetilsin

Bu sürümle:

- web tarafında deneyim başlamış olur
- kullanıcı dosyaları server'a gitmez
- en zor parça olan browser-only model taşıma işine girmeden çözüm çıkar

---

## Uygulama Sırası

### Faz 1

- backend'i dağıtıma uygun path/config yapısına çek
- CORS'u canlı site + local preview için düzelt
- health endpoint'i daha açıklayıcı yap

### Faz 2

- macOS helper paket yapısını oluştur
- `Install Stem Helper.command`
- `Uninstall Stem Helper.command`
- LaunchAgent ile auto-start

### Faz 3

- web app'te helper-required ekranı tasarla
- shell'de kartı görünür yap
- helper health check durumlarını işle

### Faz 4

- gerçek cihaz testi
- model warm-up süreleri
- büyük dosya testleri
- cleanup / iptal akışı

---

## Nihai Tavsiye

Evet, `stem-splitter` canlı site ekosistemine alınabilir.
Ama doğru yöntem:

- **GitHub Pages + local helper**

Şu aşamada önerilmeyen yöntem:

- **GitHub Pages + saf browser-only stem separation**

En kısa uygulanabilir ürün kararı:

- web'de görünür app
- helper yoksa kurulum ekranı
- helper kurulduktan sonra tamamen local split
