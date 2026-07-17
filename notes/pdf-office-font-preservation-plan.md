# Office -> PDF Font Koruma Plani

## Uygulama durumu

2026-07-17 tarihinde tamamlandi.

- Tarayici tarafinda yalnizca `.pptx` icin normalizasyon eklendi.
- `a:pPr/a:defRPr` ile birlikte grafik etiketi seviyesindeki
  `c:dLbl/c:txPr` ve `c:dLbls/c:txPr` mirasi destekleniyor.
- Ilk surum yalnizca `b` ve `i` attribute'larini acik hale getiriyor.
- Senkron ZIP islemleri yerine `fflate` asenkron API'leri kullaniliyor.
- 64 MB sikistirilmis / 256 MB acilmis paket, 5000 entry ve 8 MB chart XML
  korumalari var; sinir disinda orijinal dosyayla donusume devam ediliyor.
- Dijital imzali paketler degistirilmiyor.
- Referans PPTX'te alti run normalize edildi ve PDF'e yalnizca
  `OpenSans-Bold` gomuldu.
- 10 sentetik tarayici testi, iki dosyali batch testi ve 19 sayfalik PPTX
  regresyonu basarili.

## Bu dokuman nasil kullanilmali?

Bu dosya tamamlanan uygulamanin karar ve regresyon kaydidir. Yeni bir task'ta
ayni degisiklikleri yeniden uygulamak yerine mevcut kod ve kabul kriterleri
buradan kontrol edilmelidir. Ana görev PPTX -> PDF donusumunde font ailesi ve
font agirligi sadakatini iyilestirmektir.

**Ek notlardaki surukle-birak maddeleri Office -> PDF görevinin kapsamina
dahil degildir.** Kullanici onayi sonrasinda ayri bir is olarak yalnizca uc
gorsel uygulamasinda uygulanmistir.

## Hedef

PDF Toolkit icindeki Office -> PDF donusumunde, bilgisayarda kurulu olan
fontlarin LibreOffice tarafindan dogru aile ve dogru agirlikla kullanilmasini
saglamak.

Ilk hedef, PowerPoint grafik etiketlerinde miras alinan `bold`/`italic` gibi
metin ozelliklerinin LibreOffice headless donusumunde kaybolmasini onlemektir.

Google Fonts indirme veya uzaktan font saglama bu görevin kapsami degildir.
Mevcut sistem fontlari kullanilmaya devam edilmelidir.

## Kanitlanmis hata

Referans dosyalar:

- Kaynak PPTX:
  `/Users/yusufemreatasayar/Desktop/İşler/MMO/İYMA 2026/İYMA 2026 Sunum/Charts/Asgari Ücret Protokolü.pptx`
- Mevcut uygulama ciktisi:
  `/Users/yusufemreatasayar/Downloads/Asgari Ücret Protokolü (1).pdf`

Ortam:

- LibreOffice: `26.2.4.2`
- Helper: `pdf-compress-server`
- Donusum: `soffice --headless --convert-to pdf`

Tespitler:

1. Open Sans ailesi kullanici bilgisayarinda kurulu.
2. LibreOffice bu fontu gorebiliyor.
3. PPTX icindeki `ppt/charts/chart1.xml`, grafik etiketleri icin acikca
   `Open Sans` kullaniyor.
4. Grafik paragraf varsayilan metin ozelliginde `b="1"` bulunuyor.
5. Etiket degerlerini tasiyan `a:fld/a:rPr` dugumlerinde `b="1"` dogrudan
   yazmiyor; PowerPoint bu degeri `a:pPr/a:defRPr` uzerinden miras aliyor.
6. LibreOffice bu mirasi grafik alaninda dogru uygulamiyor ve PDF'e yalnizca
   `OpenSans-Regular` gomuyor.
7. Bu nedenle metin font ailesi olarak Open Sans olsa da Arial benzeri, ince
   bir gorunume sahip oluyor.

Mevcut PDF dogrulamasi:

```text
name                    type       emb sub uni
OpenSans-Regular        TrueType   yes yes yes
```

Gecici kanit testi:

- Kaynak PPTX'in gecici kopyasinda grafik etiketlerinin `a:rPr` dugumlerine
  `b="1"` acikca eklendi.
- Ayni LibreOffice surumuyle yeniden PDF olusturuldu.
- Yeni PDF'e `OpenSans-Bold` gomuldu.
- Render, PowerPoint'in PPTX icindeki thumbnail gorunumuyle eslesti.

```text
name                    type       emb sub uni
OpenSans-Bold           TrueType   yes yes yes
```

Sonuc: Sorun fontun kurulu olmamasi veya Google Fonts ihtiyaci degil; PPTX
grafik metin ozelliklerinin LibreOffice tarafindan eksik miras alinmasidir.

## Mevcut mimari

Office dosyalari su akistan donusuyor:

1. `pdf-toolkit/src/App.tsx`
2. `pdf-toolkit/src/lib/convert-client.ts`
3. `POST http://127.0.0.1:4184/convert`
4. `pdf-compress-server/server.mjs`
5. LibreOffice headless PDF export

Ilgili noktalar:

- `pdf-toolkit/src/App.tsx`
  - Tekli ve toplu Office donusum akisini yonetir.
- `pdf-toolkit/src/lib/convert-client.ts`
  - Office dosyasini helper'a gonderir.
- `pdf-compress-server/server.mjs`
  - `convertDocumentThroughLibreOffice(...)` ile gecici dosyayi LibreOffice'e
    verir.
- `pdf-toolkit` zaten `fflate` bagimliligina sahiptir.
- `pdf-compress-server` su anda harici npm bagimliligi olmadan dagitilir.

## Onerilen mimari

PPTX on islemesini tarayici tarafinda, helper'a gondermeden hemen once yapmak
en dusuk riskli yoldur.

Neden:

- `pdf-toolkit` icinde `fflate` zaten bulunuyor.
- Tarayicida `DOMParser` ve `XMLSerializer` mevcut.
- Helper'a yeni runtime bagimliligi ve yeni `node_modules` dagitimi eklenmez.
- macOS ve Windows ayni normalize edilmis PPTX'i helper'a gonderir.
- Orijinal kullanici dosyasi degistirilmez.

Onerilen yeni dosya:

```text
pdf-toolkit/src/lib/pptx-normalize.ts
```

Onerilen giris noktasi:

```ts
normalizePptxForLibreOffice(file: File): Promise<{
  file: File;
  changed: boolean;
  warnings: string[];
}>
```

Bu fonksiyon yalnizca `.pptx` icin calisir. `.ppsx` ile eski binary `.ppt` ve
`.pps` dosyalari bu ilk surumde degistirilmeden helper'a gonderilir.

## Uygulama adimlari

### 1. PPTX'i gecici olarak ac

- `file.arrayBuffer()` ile kaynak byte'larini al.
- `fflate.unzip` ile PPTX ZIP icerigini asenkron olarak bellekte ac.
- Yalnizca `ppt/charts/chart*.xml` dosyalarini hedefle.
- Orijinal `File` nesnesine veya diskteki kaynak dosyaya dokunma.

### 2. Grafik XML'ini guvenli sekilde parse et

- XML'i `strFromU8` ile metne cevir.
- `DOMParser` ile `application/xml` olarak parse et.
- Parser hatasi varsa o chart'i atla ve warning uret.
- Regex ile tum XML'i yeniden yazma. OOXML namespace ve dugum sirasi
  korunmali.

Kullanilacak DrawingML namespace:

```text
http://schemas.openxmlformats.org/drawingml/2006/main
```

### 3. Miras alinan run ozelliklerini acik hale getir

Her `a:p` paragrafi icin:

1. `a:pPr/a:defRPr` dugumunu bul.
2. Paragraftaki `a:r/a:rPr` ve `a:fld/a:rPr` dugumlerini bul.
3. Run uzerinde eksik olan, fakat `defRPr` uzerinde tanimli bulunan ozellikleri
   run'a kopyala.
4. Run'da acikca tanimli bir degeri asla ezme.

Grafik etiketinin kendi paragraf default'u eksikse attribute bazinda su sirayla
fallback uygula:

1. `a:p/a:pPr/a:defRPr`
2. ilgili `c:dLbl/c:txPr` icindeki `a:defRPr`
3. kapsayici `c:dLbls/c:txPr` icindeki `a:defRPr`

Ilk surumde desteklenecek attribute'lar:

- `b`
- `i`

Ikinci asamada, testlerle guvenli oldugu dogrulanirsa:

- `u`
- `strike`
- `baseline`
- `kern`
- `cap`
- `spc`

Font ailesi icin:

- `a:latin`, `a:ea` ve `a:cs` cocuklari run'da yoksa ve `defRPr` icinde varsa
  kopyalanabilir.
- Bu cocuklar eklenirken OOXML dugum sirasi korunmali.
- Ilk regresyon dosyasinda aile zaten dogru miras alindigi icin, font ailesi
  kopyalama ayri bir testten sonra etkinlestirilmelidir.

### 4. Yalnizca degisen dosyayi yeniden paketle

- Degisen chart XML'lerini `XMLSerializer` ve `strToU8` ile ZIP'e geri yaz.
- `fflate.zip` ile yeni PPTX byte'lari asenkron olarak uret.
- Kaynakla ayni ad ve MIME type'a sahip yeni bir `File` olustur.
- Hicbir chart degismediyse orijinal `File` nesnesini kullan.

### 5. Donusum istemcisine entegre et

`pdf-toolkit/src/lib/convert-client.ts` icindeki `convertOfficeToPdf(file)`
akisi:

1. Dosya `.pptx` ise normalize etmeyi dene.
2. Normalize basariliysa gecici dosyayi `FormData`'ya ekle.
3. Normalize islemi hata verirse donusumu bloklama.
4. Hata halinde orijinal dosyayla devam et ve gelistirici warning'i kaydet.

Kullaniciya teknik XML hatasi gosterilmemeli. Donusum tamamlanabiliyorsa akista
kalmalidir.

### 6. Gozlemlenebilirlik

Gelistirme modunda su bilgiler loglanabilir:

- kac chart incelendi,
- kac run normalize edildi,
- hangi ozelliklerin acik hale getirildigi,
- parser/ZIP warning'leri.

Dosya icerigi, metin degerleri veya kullaniciya ait belge verisi loglanmamali.

## Guvenlik ve koruma kurallari

- Orijinal Office dosyasi asla degistirilmemeli.
- Normalize edilmis gecici dosya kullaniciya otomatik indirilmemeli.
- Yalnizca `.pptx` ZIP tabanli formati islenmeli.
- `.ppt`, `.pps` gibi binary formatlara mudahale edilmemeli.
- Run'da acik bir stil degeri varsa miras degeriyle ezilmemeli.
- XML parse hatasi Office -> PDF donusumunu durdurmamali.
- Dosya boyutu ve 50 dosyalik batch limitleri degistirilmemeli.
- OAuth, diger helper'lar ve PDF duzenleme akislariyla ilgisiz kodlara
  dokunulmamali.

## Test plani

### A. Hedef regresyon

Referans PPTX'i uygulama uzerinden donustur:

```text
/Users/yusufemreatasayar/Desktop/İşler/MMO/İYMA 2026/İYMA 2026 Sunum/Charts/Asgari Ücret Protokolü.pptx
```

Beklenen:

- PDF tek sayfa olmali.
- Grafik ve renkler korunmali.
- Etiketler PowerPoint thumbnail'indeki gibi kalin gorunmeli.
- `pdffonts` ciktisinda `OpenSans-Bold` bulunmali.
- Etiketlerin yuzde ve kategori metinleri kaybolmamali.

Kontrol:

```bash
pdffonts output.pdf
pdftoppm -png -r 144 -f 1 -singlefile output.pdf output-preview
```

### B. Acik stil korumasi

- Run'da acikca `b="0"` bulunan bir PPTX test et.
- Paragraf default'u `b="1"` olsa bile run regular kalmali.

### C. Italic mirasi

- `defRPr i="1"` ve run'da `i` bulunmayan bir grafik etiketi test et.
- PDF'e italic varyant gomulmeli.

### D. Normal PPTX regresyonu

- Grafik icermeyen bir PPTX donustur.
- Normalize sonucu kaynakla ayni davranmali.
- Sayfa sayisi, metin ve gorseller korunmali.

### E. Buyuk sunum regresyonu

`notes/helper-runtime-matrix.md` icinde kullanilan 19 sayfalik PPTX testi
tekrarlanmali:

- 19 sayfa korunmali.
- Gorsel objeler kaybolmamali.
- Kucuk gomulu ikonlar gorunmeli.
- Donusum suresi mevcut timeout'u asmamali.

### F. Batch regresyonu

- Birden fazla PPTX sec.
- Her dosya ayri PDF'e donusmeli.
- Sonuc ZIP'i olusmali.
- Bir dosyadaki normalize warning'i diger dosyalari bozmamali.

### G. Windows

- On isleme tarayici tarafinda oldugu icin ayni bundle Windows'ta da
  calismali.
- Mevcut `.github/workflows/windows-helpers.yml` Office donusum testi
  korunmali.
- Mumkunse font agirligi regresyonu icin lisansi uygun, sentetik bir PPTX
  fixture eklenmeli.
- Kullaniciya ait referans PPTX repo'ya eklenmemeli.

## Kabul kriterleri

- Referans PPTX ciktisi `OpenSans-Bold` gomuyor.
- Gorsel sonuc kaynak PowerPoint thumbnail'iyle uyumlu.
- Normal PPTX/PPT donusumleri bozulmuyor.
- Batch donusum calismaya devam ediyor.
- Donusum helper'i bulunamazsa mevcut hata davranisi degismiyor.
- Normalize hatasi orijinal dosyayla donusume geri donuyor.
- Yeni Google API, Google Fonts veya uzaktan font indirme bagimliligi yok.
- TR ve EN arayuz akislari bozulmuyor.
- `npm --prefix pdf-toolkit run build` basarili.

## Degismesi beklenen dosyalar

Tahmini:

```text
pdf-toolkit/src/lib/pptx-normalize.ts
pdf-toolkit/src/lib/convert-client.ts
pdf-toolkit/src/App.tsx                 # yalnizca status/warning gerekirse
notes/helper-runtime-matrix.md          # yeni regresyon kaydi
```

Yeni dependency eklenmesi beklenmiyor.

## Uygulama sirasinda karar noktasi

Ilk uygulama yalnizca `b` ve `i` attribute mirasini acik hale getirsin. Font
ailesi cocuklarini (`a:latin`, `a:ea`, `a:cs`) run'a kopyalamak ancak ayri bir
ornekle gercekten gerekli oldugu kanitlanirsa eklenmeli. Kanitlanmis hatayi
cozerken genel PPTX yapisini gereksiz yere yeniden yazmamak onceliklidir.

---

# Ek Notlar: Uretim Ekranlarinda Surukle-Birak

## Uygulama durumu

2026-07-17 tarihinde kullanici onayiyla yalnizca su uc batch uygulamasinda
tamamlandi:

- Image Converter
- Image Resizer
- EXIF Cleaner

Uretim workspace'ine birakilan gercek dosyalar mevcut listeye eklenir; mevcut
ayarlar korunur. Dosya secme butonlari calismaya devam eder. Diger uygulamalar
bu kapsama dahil degildir ve yeni bir acik onay olmadan ele alinmayacaktir.

## Mevcut durum

Zaten destekleyenler:

- PDF'e donusturme paneli coklu dosya surukle-birak kabul ediyor.
- Yuklu PDF ekranina birakilan PDF, mevcut PDF ile birlestiriliyor.
- BG Remover uretim ekranina birakilan yeni gorseller listeye ekleniyor.

Uretim ekraninda yalnizca butonla dosya eklenen, surukle-birak icin uygun
batch uygulamalari:

- Image Converter
- Image Resizer
- EXIF Cleaner

Bu uc uygulamada en dusuk riskli davranis:

```text
Dosyalari eklemek icin birak
```

Birakilan dosyalar mevcut listeye eklenir; mevcut ayarlar ve dosyalar
silinmez.

## Kapsam disi tek dosyali uygulamalar

Tek dosyali akislarda drop davranisi "ekle" degil "mevcut dosyayi degistir"
olacaktir:

- Audio Editor
- Video Compressor / Video Edit
- Video to Audio
- Stem Splitter

Kapsam ileride yeniden acilirsa kararlastirilmasi gerekenler:

1. Dosya birakildiginda mevcut calisma dogrudan degissin mi?
2. Secim, segment veya tamamlanmis sonuc varsa onay penceresi gosterilsin mi?
3. Drop tum workspace'te mi, yalnizca belirli bir hedef alanda mi calissin?

Oneri: Kaydedilmemis duzenleme varsa onay, temiz durumda dogrudan degistirme.

## Ozel hedef gerektirenler

- CSV Toolkit:
  - Ana workspace'e drop "ana dosyayi degistir" anlamina gelebilir.
  - Birleştir paneline drop "ikinci CSV'yi ekle" anlamina gelmeli.
  - Global drop yanlislikla filtre ve temizlik ayarlarini silebilir.
- QR Generator:
  - Global dosya drop uygun degil.
  - Yalnizca logo alanina gorsel drop dusunulebilir.
- PDF Watermark:
  - Filigran gorseli icin ayri ve hedefli drop alani kullanilmali.
- Analytica ve Dev Toolkit:
  - Genel dosya drop davranisi gerekli degil.

## Uygulanan ortak teknik kurallar

- Yalnizca `DataTransfer` icinde gercek `Files` varsa dis dosya drop'u olarak
  kabul et.
- Image Resizer'daki kart siralama gibi dahili drag islemlerini dis dosya
  drop'undan ayir.
- Nested elementlerde drag sayaci kullan; overlay titremesin.
- Islem veya export surerken drop'u devre disi birak.
- Dosya turu ve limitleri mevcut butonlu yukleme ile ayni validator'u
  kullanmali.
- Batch uygulamasinda drop "ekle", tekli uygulamada "degistir" olarak acikca
  yazmali.
- Butonla dosya secme davranisi her zaman korunmali.
- Mobilde drag/drop beklenmedigi icin mevcut dosya secme UX'i degismemeli.
- TR ve EN metinleri birlikte hazirlanmali.

## Kapsam karari

Tek dosyali ses/video uygulamalari ile ozel hedef gerektiren CSV, QR ve PDF
Watermark akislari bilerek kapsam disinda birakildi. Bu alanlar mevcut
davranislarini koruyacak.
