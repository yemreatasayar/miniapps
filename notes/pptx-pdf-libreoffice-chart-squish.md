# PPTX→PDF grafik metni yatay "squish" (LibreOffice) — araştırma kaydı

**Tarih:** 2026-07-30/31 · **Durum:** çözülemedi, düzeltme YAPILMADI (bilinçli karar).
İlgili: `pdf-compress-server/server.mjs` (LibreOffice `--convert-to pdf`), `pdf-toolkit/src/lib/pptx-normalize.ts` (tarayıcı-içi chart normalizasyonu).

## Belirti

PPTX'i PDF'e çevirince grafiklerdeki metin (özellikle büyük veri etiketi sayıları,
ör. `46,50%`) **yatayda sıkışıyor** ("sağdan soldan ezilme"). Kaynak PowerPoint'te normal.
Ayrıca ondalık ayırıcı `,` → `.` oluyor (`46,50%` → `46.50%`).

## Kök neden (kanıtlı)

PDF içindeki metin matrisi (`Tm`) ölçüldü: `a 0 0 d ... Tm` biçiminde **a (yatay) ≠ d (dikey)**.
Yani grafiğin TÜM metni (veri etiketleri + eksen rakamları dahil) yatayda tek yönlü
(anamorfik) ölçekleniyor. Bu, LibreOffice chart motorunun metni içsel bir "referans boyuta"
göre **anizotropik ölçeklemesi**. Sadece kutu en/boy oranına ve grafik türüne bağlı:
yatay bar chart en kötü, doughnut hiç etkilenmiyor.

Test dosyaları (MMO/İYMA 2026 Charts) ve ölçülen `a/d`:

| Dosya | Tür | a/d | Not |
|---|---|---|---|
| Eğitim Yeterliliği | yatay bar | **0.9212** | kullanıcının gerçek PDF çıktısıyla birebir |
| Mesleki Anlamda Gelişim | yatay bar | 0.9601 | |
| İş Yerinde Cinsiyet Eşitsizliği | doughnut | 1.0000 | grup yok, bozulma yok |

`a/d` yalnızca grafik kutu oranına bağlı: kutu genişledikçe 1.0'a yaklaşıyor ama
a/d=1.0 için kutunun ~2.4:1 gibi aşırı geniş olması gerekir (kabul edilemez, grafiği yeniden şekillendirir).

## Sebep OLMAYANLAR (hepsi test edildi, a/d değişmedi)

- **Grafiği saran grup şeklinin orantısız ölçeği** (f1'de grpSp scaleX=0.863). Grubu
  düzleştirmek (flatten) a/d'yi değiştirmedi — LibreOffice nihai kutuyu çözüp ona göre diziyor;
  grup ölçeği "absorbe" ediliyor, compound olmuyor.
- **LibreOffice sürümü:** 26.2.4.2, 26.8.0.0-alpha ve stabil **25.8.7.3** — üçü de aynı a/d.
  Sürüme özel regresyon DEĞİL, eski/süregelen davranış.
- **Value axis'teki `rot="-60000000"`** (anormal değer), `bodyPr` autofit/`noAutofit`,
  `kern`, `gapWidth`/`overlap`, `spcFirstLastPara`, `anchorCtr`, veri etiketi pozisyonu
  (outEnd/inEnd), `dLblPos` — hiçbiri etkilemiyor.
- **barDir bar→col:** 0.921→0.983 (yatay bar en kötü durum ama col da tam düzelmiyor).

## Denenip YETERSİZ kalanlar

- **plotArea `manualLayout` (saf XML):** f1'i sadece 0.921→~0.935 iyileştiriyor; **f3'te
  manualLayout yok, hiç etkilemiyor.** Tutarsız ve marjinal → shipping edilmedi.
- **UNO makro — chart2 diagram `RelativeSize(1,1)`:** en iyi sonuç 0.921→**0.950** (görsel
  temiz), ama hâlâ %5 ezik + `soffice --convert-to` yerine makro-tabanlı dönüşüm gerektirir
  (Mac+Windows helper'da bakım yükü). Public UNO API'sinde metin-scale/referans-boyut
  toggle'ı YOK (özellikler: `RelativeSize`, `PosSizeExcludeAxes`, `TextUserDefinedAttributes`).
- **PDF post-process (Tm a→d):** işe yaramaz; grafiğin tamamı (kutular/barlar dahil) uniform
  eziyor, un-squish kutuyu taşırır.
- Not: bu ortamda `python-uno` macOS tarafından SIGKILL ediliyor; UNO testleri LibreOffice'in
  kendi Basic makrosuyla yapıldı (`vnd.sun.star.script:...`).

## Locale (virgül→nokta) — çözümü VAR ama uygulanmadı

Kaynak: chartSpace'te `<c:lang val="en-US"/>`. Çalışmayanlar: `c:lang`'ı tr-TR yapmak,
`soffice`'i `LANG/LC_ALL=tr_TR` ile çalıştırmak. **Tek çalışan:** veri etiketi format koduna
Türkçe LCID prefix'i — `<c:numFmt formatCode="[$-41F]0.00%" sourceLinked="0"/>` → `46,50%`.
(Kaynak format kodu numCache'ten alınıp `[$-41F]` ile prefixlenmeli; etiket-özel.)

## Neden düzeltme yapılmadı

Squish, LibreOffice chart motorunun sınırlaması; saf-XML ile anlamlı düzelmiyor, UNO yolu
ağır + kısmi. Düzgün, ücretsiz, self-host, Office'siz bir drop-in alternatif yok:
- **LibreOffice**: tek olgun ücretsiz seçenek, bu bug'ı var.
- **Collabora**: LibreOffice tabanlı = aynı bug.
- **OnlyOffice Document Server**: farklı motor, farklı çizebilir ama çözeceği garanti değil, ağır servis.
- **Gerçek PowerPoint otomasyonu** (Mac AppleScript/`osascript` export): grafiği birebir doğru
  çizer (squish + virgül biter) ama Office gerekli ve **sadece local**; public web için olmaz.
- **Aspose.Slides**: yüksek sadakat ama **ticari/ücretli**.
- **MS Graph / Google Slides API**: bulut, hesap/API + dosyayı dışarı yollar.

İleride revize edilecekse: local kişisel kullanım için PowerPoint otomasyonu en temiz;
squish'i tam çözmek isteniyorsa UNO `RelativeSize` prototipi (0.95) veya OnlyOffice denemesi.
