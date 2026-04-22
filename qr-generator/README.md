# QR Generator

Lokal çalışan, tarayıcı tabanlı ve miniapps dashboard içine bağlanmaya uygun bir QR üretici mini app.

Bu app'in amacı teknik ayrıntıyı kullanıcıya yansıtmadan hızlı QR üretmek, canlı önizleme sunmak, güvenilir export almak ve müşteri bazlı kayıtları birbirinden ayırmaktır.

## Ne Yapar

- 8 QR türünü destekler:
  - Link
  - Wi-Fi
  - vCard
  - WhatsApp
  - E-posta
  - Telefon
  - Konum
  - Metin
- Form alanlarını doldurdukça QR preview anlık güncellenir.
- PNG, SVG ve PDF çıktısı alır.
- Geçmiş kayıtları lokal saklar.
- Müşteri bazlı çalışır; bir müşterinin kayıtları diğer müşteride görünmez.
- miniapps içinden bağımsız sekmede açılabilir.

## Ürün Mantığı

App iki ana eksende çalışır:

1. Üretim akışı
- QR türü seçilir.
- O türe ait alanlar görünür.
- Payload hesaplanır.
- QR preview anında güncellenir.

2. Kayıt akışı
- Tasarım draft olarak lokal saklanır.
- `Kaydet` ile history kaydı oluşturulur.
- Aynı kaydın içeriği güncellenirse overwrite eder.
- `Tasarım Adı` veya `QR Türü` değişirse yeni kayıt açar.

## Müşteri Scope Mantığı

App miniapps tarafından query param ile açılır:

- `customerId`
- `customerName`
- `customerCity`

Bu bilgiler [App.tsx](/Users/yusufemreatasayar/miniapps/qr-generator/src/App.tsx) içinde okunur ve storage scope buna göre belirlenir.

Storage anahtarları müşteri bazlıdır:

- `qr-generator.history.<customerId>`
- `qr-generator.current.<customerId>`

Bu mantık [storage.ts](/Users/yusufemreatasayar/miniapps/qr-generator/src/lib/storage.ts) içinde yönetilir.

Sonuç:
- MMO İstanbul Şubesi için üretilen QR kayıtları, örneğin `b2bNet` içinde görünmez.
- Her müşteri kendi draft ve history alanına sahiptir.

## Mimari

### Ana Orkestrasyon

[App.tsx](/Users/yusufemreatasayar/miniapps/qr-generator/src/App.tsx)

Burada:
- query param okuma
- draft/history state yönetimi
- canlı QR preview üretimi
- export akışları
- logo yükleme
- save/open/delete/clear işlemleri
- ana UI render akışı bulunur

### Veri Modelleri

[types.ts](/Users/yusufemreatasayar/miniapps/qr-generator/src/lib/types.ts)

Burada:
- QR türleri
- alan tipleri
- tasarım ayarları
- kayıt modeli

tanımlanır.

### Varsayılanlar ve Örnekler

[defaults.ts](/Users/yusufemreatasayar/miniapps/qr-generator/src/lib/defaults.ts)

Burada:
- her QR türünün boş başlangıç alanları
- varsayılan tasarım ayarları
- yeni draft üretimi
- global kullanım için örnek kayıtlar

yer alır.

### Payload ve Kurallar

[qr.ts](/Users/yusufemreatasayar/miniapps/qr-generator/src/lib/qr.ts)

Bu katman:
- form alanlarından gerçek QR payload üretir
- Wi-Fi formatını kurar
- vCard string üretir
- WhatsApp, mail, telefon, konum linklerini oluşturur
- kontrast ve taranabilirlik uyarıları üretir

### Lokal Kayıt Sistemi

[storage.ts](/Users/yusufemreatasayar/miniapps/qr-generator/src/lib/storage.ts)

Bu katman:
- draft yükler/kaydeder
- history yükler/kaydeder
- müşteri scope doğrulaması yapar
- legacy starter draft temizliği uygular

### Görsel Katman

[global.css](/Users/yusufemreatasayar/miniapps/qr-generator/src/styles/global.css)

App'in tüm layout, kart, form, preview ve history stilleri burada tutulur.

## Export Mimarisi

### PNG

- Raster çıktıdır.
- Logo varsa compositing canvas üzerinde yapılır.

### SVG

- QR gövdesi vektöreldir.
- SVG logo yüklenmişse vektörel embed denenir.
- Uyum sorunu olursa yüksek çözünürlüklü raster fallback kullanılır; böylece logo görünmez kalmaz.

### PDF

- QR gövdesi PNG olarak gömülmez.
- QR modülleri PDF içine doğrudan çizilir; yani ana QR yapısı vektöreldir.
- Logo ise kontrollü yüksek çözünürlüklü raster olarak eklenir.
- Logo tarafında minimum kalite hedefi 300 DPI eşleniğidir.

Bu mantık [App.tsx](/Users/yusufemreatasayar/miniapps/qr-generator/src/App.tsx) içindeki export fonksiyonlarında bulunur.

## Logo Davranışı

Logo ekleme şu şekilde çalışır:

- kullanıcı görsel yükler
- preview alanında logo güvenli merkez alana yerleşir
- oran `contain` mantığıyla korunur
- hata düzeltme seviyesi düşükken kullanıcı uyarılır
- logo çok büyütülürse kullanıcı uyarılır

Logo güvenliği açısından:
- QR taranabilirliğini bozmamak için ortada beyaz güvenli zemin bırakılır
- logo oranı korunur
- önerilen hata düzeltme seviyesi `Q` veya `H`'dir

## Klasör Yapısı

```text
qr-generator/
├── public/
│   └── assets/
│       └── qr-generator-logo.svg
├── src/
│   ├── lib/
│   │   ├── defaults.ts
│   │   ├── qr.ts
│   │   ├── storage.ts
│   │   └── types.ts
│   ├── styles/
│   │   └── global.css
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
└── vite.config.ts
```

## Çalıştırma

```bash
npm install
npm run dev
```

Bu proje pratikte şu local adreste kullanılıyor:

- [http://qr.localhost:4182/](http://qr.localhost:4182/)

Standalone Vite geliştirme ortamında port farklıysa Vite kendi adresini verebilir.

## Build

```bash
npm run build
```

Build çıktısı `dist/` klasörüne alınır.

## miniapps Entegrasyonu

Bu app miniapps içinden bağımsız olarak açılır.

Yani:
- miniapps sadece launchpad görevi görür
- QR Generator kendi sekmesinde açılır
- kapanması diğer app'leri etkilemez
- müşteri bilgisi launch URL üzerinden taşınır

Bu yaklaşım sayesinde app'ler birbirine gömülü değil, birbirinden bağımsız mini uygulamalar olarak kalır.

## Şu Anki Tasarım Kararları

- UI kompakt tutuldu
- onboarding, üyelik, paylaşım, cloud sync yok
- tüm veri lokal
- müşteri bazlı ayrım öncelikli
- export güvenilirliği, görsel şovdan daha önemli

## Geliştirmeye Açık Alanlar

İleride eklenebilecek mantıklı iyileştirmeler:

- SVG logo embed uyumluluğunu daha da genişletmek
- export preset sistemi
- kopyala / paylaş butonları
- toplu QR şablonları
- miniapps içindeki app bağlantı yönetimini config tabanlı hale getirmek

## Kısa Özet

Bu app, iç kullanım için tasarlanmış, hızlı açılan, müşteri bazlı çalışan ve güvenilir çıktı almaya odaklanan bir QR üretici mini app'tir. Teknik mimarisi küçük tutulmuştur; business logic `lib/` altında, UI orkestrasyonu `App.tsx` içinde, görsel katman ise tek bir CSS dosyasında toplanmıştır.
