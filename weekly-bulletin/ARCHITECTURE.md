# Haftalık Bülten Stüdyosu

Bu doküman, `weekly-bulletin` mini app'inin ne yaptığını, nasıl organize edildiğini ve hangi katmanın hangi sorumluluğu aldığını özetler.

## 1. Amaç

Uygulama, haftalık şube bülteni üretmek için hazırlanmış lokal çalışan bir üretim aracıdır.

Temel hedefler:

- 1080 px genişliğinde tek uzun bülten üretmek
- Haberleri manuel veya Excel üzerinden içe almak
- Görselleri lokal olarak eşleştirmek
- Canlı önizleme vermek
- Tek uzun PDF çıktısı üretmek
- PDF içinde tıklanabilir gerçek link annotation'ları korumak
- Sunucuya ihtiyaç duymadan tamamen tarayıcı içinde çalışmak

## 2. Teknoloji Seçimi

Uygulama sade ve lokal kalması için küçük bir stack ile kuruldu:

- `React 18`: arayüz ve state yönetimi
- `TypeScript`: veri modeli ve yardımcı katmanlarda güvenli geliştirme
- `Vite`: hızlı lokal geliştirme ve build
- `xlsx`: Excel/CSV içe aktarma
- `pdf-lib`: programatik PDF üretimi
- `@pdf-lib/fontkit`: PDF içinde özel font gömmek için
- `IndexedDB`: draft ve geçmiş tasarımları local saklamak için

Bu seçimlerin amacı:

- framework karmaşasını düşük tutmak
- internet/server bağımlılığını kaldırmak
- tek kullanıcıya yönelik hızlı bir üretim aracı sağlamak

## 3. Genel Mimari

Uygulama tek sayfalı bir editör gibi çalışır ve üç ana akış üzerine kuruludur:

1. Sol panelde veri girişi ve düzenleme yapılır.
2. Sağ panelde 1080 px bazlı canlı önizleme gösterilir.
3. Aynı veri modeli hem preview hem PDF export için kullanılır.

En önemli mimari karar şu:

`documentState` tek doğruluk kaynağıdır.

Yani:

- form alanları bu state'i günceller
- layout motoru bu state'ten konum ve yükseklik hesaplar
- preview bu layout'u render eder
- PDF export yine aynı document + layout mantığını kullanır
- draft ve history kayıtları da aynı belge modelini saklar

## 4. Klasör Yapısı

```text
miniapps/weekly-bulletin/
├── public/
│   ├── assets/
│   └── fonts/
├── samples/
├── scripts/
├── src/
│   ├── components/
│   ├── legacy/
│   ├── lib/
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
├── ARCHITECTURE.md
├── README.md
└── package.json
```

## 5. Ana Dosyalar ve Sorumlulukları

### 5.1 Uygulama kabuğu

Dosyalar:

- [App.tsx](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/App.tsx)
- [WeeklyBulletinStudio.tsx](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/legacy/WeeklyBulletinStudio.tsx)

Burada:

- `App.tsx` uygulamanın giriş noktasıdır
- `WeeklyBulletinStudio.tsx` gerçek editör ve preview orkestrasyonunu taşır
- ana state burada tutulur
- draft/history bootstrap edilir
- buton aksiyonları yönetilir
- Excel import, görsel upload, kayıt ve PDF export tetiklenir
- layout hesaplanıp preview'a gönderilir

Kısacası editör orkestrasyonu `WeeklyBulletinStudio.tsx` içindedir.

### 5.2 Bileşen katmanı

Dosyalar:

- [NewsItemEditor.tsx](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/components/NewsItemEditor.tsx)
- [PreviewDocument.tsx](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/components/PreviewDocument.tsx)
- [HistoryPanel.tsx](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/components/HistoryPanel.tsx)

Sorumluluklar:

- `NewsItemEditor`: tek haber kartının editörü
- `PreviewDocument`: hesaplanmış layout'u görsel önizlemeye çevirir
- `HistoryPanel`: geçmiş tasarımları listeler, açar, siler

### 5.3 Veri modeli ve yardımcı katman

Dosyalar:

- [types.ts](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/lib/types.ts)
- [format.ts](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/lib/format.ts)
- [defaultDocument.ts](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/lib/defaultDocument.ts)

Sorumluluklar:

- veri tiplerini tanımlamak
- yeni boş belge/haber üretmek
- metin, link, görsel adı, summary HTML gibi alanları normalize etmek
- haber güncelleme, reorder ve image resolve gibi ortak işlemleri toplamak

### 5.4 Layout motoru

Dosya: [layout.ts](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/lib/layout.ts)

Bu katman uygulamanın kalbidir.

Görevi:

- belge yüksekliğini içeriğe göre hesaplamak
- header, intro alanı, beyaz panel ve haber bloklarının koordinatlarını üretmek
- başlık, meta, tarih, summary ve link butonları için ölçüm yapmak
- rich text summary yüksekliğini ölçmek
- preview ve PDF için ortak bir `BulletinLayout` nesnesi oluşturmak

Bu yaklaşım sayesinde UI görünümü ile export görünümü aynı geometriye dayanır.

### 5.5 Excel içe aktarma

Dosya: [excel.ts](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/lib/excel.ts)

Özellikler:

- `.xlsx`, `.xls`, `.csv` okuyabilir
- İngilizce ve Türkçe kolon başlıklarını normalize eder
- örneğin `Başlık`, `Özet (Haber Metni)`, `Haber Linki`, `Haber Görseli` gibi alanları tanır
- `Footer Açıklama Metni` veya benzeri alanları `intro_text` olarak eşler

Bu katman import formatını arayüzden bağımsız tutar.

### 5.6 Görsel işleme

Dosya: [images.ts](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/lib/images.ts)

Sorumluluklar:

- yüklenen görselleri okumak
- veri URL formatına çevirmek
- PDF katmanı için dönüştürme yardımcıları sağlamak
- mümkün olduğunda görsel boyutunu optimize etmek

### 5.7 Local kayıt sistemi

Dosya: [storage.ts](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/lib/storage.ts)

Sorumluluklar:

- draft kaydetmek
- geçmiş tasarım kaydetmek
- geçmiş kayıtları listelemek
- kayıt açmak/silmek

Saklama katmanı `IndexedDB` üstünde çalışır.

İki temel kayıt tipi vardır:

- `draft`: otomatik kayıt
- `saved`: kullanıcı tarafından bilinçli kaydedilmiş tasarım

### 5.8 PDF export katmanı

Dosya: [pdf.ts](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/lib/pdf.ts)

Bu katman klasik browser print kullanmaz.

Bunun yerine:

- belge için layout üretir
- arka planı ve bazı görsel katmanları PDF'e çizer
- overlay katmanını oluşturur
- haber görsellerini ayrı yerleştirir
- link alanlarını PDF annotation olarak ekler

Bu sayede:

- tek uzun özel boyutlu PDF alınır
- linkler tıklanabilir kalır
- sayfa bazlı A4 kırılması yaşanmaz

## 6. Veri Modeli

Ana belge tipi `BulletinDocument`'tır.

Başlıca alanlar:

- `id`: belge kimliği
- `name`: tasarım adı
- `issueLabel`: sayı etiketi / üst metin
- `introText`: giriş metni
- `newsItems`: haber listesi
- `uploadedImages`: yüklenmiş lokal görseller
- `createdAt`, `updatedAt`: zaman bilgileri

Her haber `NewsItem` tipindedir.

Başlıca alanlar:

- `title`
- `summary`
- `summaryHtml`
- `summaryFontSize`
- `summaryBold`
- `summaryItalic`
- `summaryAlign`
- `linkLabel`
- `source`
- `author`
- `date`
- `link`
- `imageName`

Not:

- `summary` düz metin taşıyabilir
- `summaryHtml` zengin metin içeriğini saklar
- `imageName`, yüklenen görseller içinde eşleşme anahtarı olarak kullanılır

## 7. Veri Akışı

### 7.1 Manuel düzenleme akışı

1. Kullanıcı form alanlarını değiştirir.
2. `WeeklyBulletinStudio.tsx` belge state'ini günceller.
3. `buildBulletinLayout(...)` yeniden çalışır.
4. Sağ taraftaki preview yeni layout ile tekrar çizilir.
5. Otomatik draft kaydı arka planda IndexedDB'ye yazılır.

### 7.2 Excel import akışı

1. Excel dosyası seçilir.
2. `parseExcelFile(...)` kolonları normalize eder.
3. Satırlar `NewsItem` listesine dönüştürülür.
4. Varsa intro alanı da Excel'den belgeye aktarılır.
5. Preview anında güncellenir.

### 7.3 Görsel eşleştirme akışı

1. Kullanıcı tekil ya da toplu görsel yükler.
2. Görseller `uploadedImages` içine alınır.
3. Haber kartındaki `imageName` ile görsel adı karşılaştırılır.
4. Eşleşme tam ad veya normalize edilmiş ad üzerinden yapılır.

Destek mantığı:

- uzantılı veya uzantısız eşleşme
- `jpg`, `jpeg`, `png`, `webp` gibi farklı uzantılar
- büyük/küçük harf farkı
- Türkçe karakter farkları
- boşluk, tire, alt çizgi toleransı

### 7.4 Kaydetme akışı

1. Draft otomatik kaydedilir.
2. `Tasarımı Kaydet` kullanıcı aksiyonudur.
3. Aynı kayıt ve aynı tasarım adıyla kaydediliyorsa mevcut history kaydı overwrite edilir.
4. Tasarım adı değişmişse yeni history kaydı açılır.

Bu davranış şu kullanıcı ihtiyacına göre tasarlandı:

- aynı iş üzerinde çalışırken versiyon çöpü oluşmaması
- isim değişince yeni kayıt mantığının korunması

### 7.5 PDF export akışı

1. Mevcut belge sanitize edilir.
2. Layout yeniden hesaplanır.
3. PDF katmanı arka plan, overlay, görseller ve link annotation'larını üretir.
4. Tek uzun PDF indirilir.

## 8. Responsive Yaklaşım

Arayüz iki kolon mantığında tasarlanmıştır:

- sol: editör alanı
- sağ: preview alanı

Masaüstünde iki kolon aynı ekranda birlikte çalışır. Daralan ekranlarda kolonlar önce sıkışır, belirli bir eşikten sonra tek kolona düşer. Amaç, mümkün olduğunca masaüstü kullanımını korumaktır; erken mobil kırılımına zorlamamaktır.

Stil dosyası:

- [global.css](/Users/yusufemreatasayar/miniapps/weekly-bulletin/src/styles/global.css)

## 9. Tasarım Mantığı

Önizleme gerçek bir "sayfa" değildir; uzun bir kompozisyondur.

Belgenin genel şeması:

- üst alan: sabit
- giriş metni: dinamik yükseklik
- beyaz içerik paneli: dinamik yükseklik
- haber blokları: alt alta akan dinamik modüller
- alt alan: isteğe bağlı / tasarıma göre değişebilir

Temel prensip:

- genişlik sabit
- yükseklik içerik kadar büyür
- başlık ve özet alanları kesilmez
- PDF çıktısı da aynı mantığı korur

## 10. Neden Browser Print Kullanılmıyor?

Çünkü bu projede ihtiyaç klasik sayfa basımı değil.

İstenen yapı:

- tek uzun PDF
- özel boyut
- tıklanabilir link alanları
- preview ile daha uyumlu geometri

Browser print yaklaşımı:

- sayfa mantığına zorlar
- A4/pagination davranışı üretir
- link ve özel koordinat kontrolünde yetersiz kalır

Bu nedenle export tamamen programatik tasarlandı.

## 11. Güçlü Yönler

- lokal ve hızlı çalışma
- küçük dependency seti
- tek veri modeli üzerinden preview + export
- Excel ve manuel girişin birlikte çalışması
- IndexedDB ile hafif geçmiş sistemi
- PDF tarafında gerçek link annotation desteği
- başka mini app'lere ölçeklenebilir klasör yapısı

## 12. Bilinçli Trade-off'lar

Bu proje bir müşteri paneli değil, üretim aracıdır. Bu yüzden bazı kararlar bilinçli olarak sade tutuldu:

- authentication yok
- server yok
- paylaşım/collaboration yok
- karmaşık state library yok
- CMS benzeri içerik modeli yok

Yani ürün mantığı yerine editör verimliliği önceliklidir.

## 13. Genişletme İçin Uygun Noktalar

İleride aşağıdaki geliştirmeler rahatça eklenebilir:

- farklı şablon temaları
- çoklu mini app dashboard entegrasyonu
- daha gelişmiş rich text toolbar
- PDF kalite profilleri
- export öncesi doğrulama ekranı
- import mapping ekranı
- hazır bülten şablon preset'leri

Bu genişlemeler için en uygun giriş noktaları:

- veri modeli değişiklikleri için `src/lib/types.ts`
- yeni layout varyasyonu için `src/lib/layout.ts`
- yeni export davranışı için `src/lib/pdf.ts`
- yeni editör bileşenleri için `src/components/`

## 14. Çalıştırma ve Build

Komutlar:

```bash
cd /Users/yusufemreatasayar/miniapps/weekly-bulletin
npm install
npm run dev
npm run build
```

Örnek sample üretimi:

```bash
npm run generate:samples
```

## 15. Kısa Özet

Bu mini app'in mimarisi, tek bir belge modelinden hareketle dört şeyi aynı anda çözmek üzerine kuruldu:

- hızlı düzenleme
- güvenilir preview
- lokal kayıt
- kontrollü PDF export

Bu yüzden proje küçük görünse de merkezinde güçlü bir layout + export mantığı bulunuyor. Uygulamanın sürdürülebilirliği de büyük ölçüde bu ayrımdan geliyor:

- `App.tsx` giriş noktası
- `WeeklyBulletinStudio.tsx` orkestrasyon
- `components/` arayüz
- `lib/` iş mantığı
- `storage.ts` lokal kalıcılık
- `layout.ts` görsel geometri
- `pdf.ts` çıktı motoru
