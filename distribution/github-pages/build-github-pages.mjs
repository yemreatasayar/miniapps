import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const outputRoot = path.join(__dirname, "site");
const legacyEnglishBuildRoot = path.join(__dirname, "legacy-en-build");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const apps = [
  { id: "pdf-toolkit", dir: "pdf-toolkit", script: "build" },
  { id: "csv-toolkit", dir: "csv-toolkit", script: "build" },
  { id: "qr-generator", dir: "qr-generator", script: "build" },
  { id: "image-toolkit", dir: "image-toolkit", script: "build" },
  { id: "exif-cleaner", dir: "exif-cleaner", script: "build" },
  { id: "image-format-converter", dir: "image-format-converter", script: "build" },
  { id: "bg-remover", dir: "bg-remover", script: "build" },
  { id: "video-to-audio", dir: "video-to-audio", script: "build" },
  { id: "audio-editor", dir: "audio-editor", script: "build" },
  { id: "stem-splitter", dir: "stem-splitter", script: "build" },
  { id: "dev-toolkit", dir: "dev-toolkit", script: "build" },
  { id: "video-compressor", dir: "video-compressor", script: "build" },
];

const distributionConfig = {
  packLabel: "miniapps pack",
  packVersion: "2026.2.0",
  authorLabel: "by y.e.a.",
  visibleAppIds: [
    "pdf-toolkit",
    "csv-toolkit",
    "qr-generator",
    "image-toolkit",
    "exif-cleaner",
    "image-format-converter",
    "bg-remover",
    "video-to-audio",
    "video-compressor",
    "audio-editor",
    "stem-splitter",
    "dev-toolkit",
  ],
  hiddenAppIds: ["weekly-bulletin"],
  launchUrlOverrides: Object.fromEntries(apps.map((app) => [app.id, `./apps/${app.id}/`])),
};

const SITE_BASE_URL = "https://miniapps.tr";

const seoMeta = new Map([
  [
    "pdf-toolkit",
    {
      tr: {
        title: "PDF Toolkit: Ücretsiz PDF Sıkıştırıcı, Düzenleyici ve Dönüştürücü",
        description: "PDF dosyalarını tarayıcınızda sıkıştırın, bölün, birleştirin, döndürün ve filigran ekleyin. Hiçbir dosya sunucuya gönderilmez. Ücretsiz ve kayıt gerektirmez.",
      },
      en: {
        title: "PDF Toolkit: Free PDF Compressor, Editor & Converter",
        description: "Compress, split, merge, rotate, watermark and extract text from PDFs in your browser. No file uploads. Free, no account required.",
      },
    },
  ],
  [
    "csv-toolkit",
    {
      tr: {
        title: "CSV Toolkit: Ücretsiz Online CSV Düzenleyici ve Temizleyici",
        description: "CSV dosyalarınızı tarayıcınızda filtreleyin, temizleyin, tekilleştirin ve düzenleyin. Sunucuya dosya gönderilmez.",
      },
      en: {
        title: "CSV Toolkit: Free Online CSV Editor & Cleaner",
        description: "Filter, clean, deduplicate and edit CSV files directly in your browser. No file uploads, no account needed.",
      },
    },
  ],
  [
    "qr-generator",
    {
      tr: {
        title: "QR Generator: Ücretsiz QR Kod Oluşturucu",
        description: "URL, metin, e-posta ve Wi-Fi için QR kod oluşturun. PNG veya PDF olarak indirin. Ücretsiz ve kayıt gerektirmez.",
      },
      en: {
        title: "QR Generator: Free QR Code Creator",
        description: "Generate QR codes for URLs, text, email and Wi-Fi. Download as PNG or PDF. Free, no account needed.",
      },
    },
  ],
  [
    "image-toolkit",
    {
      tr: {
        title: "Image Toolkit: Ücretsiz Online Görsel Düzenleyici",
        description: "Görselleri tarayıcınızda yeniden boyutlandırın, kırpın, sıkıştırın ve düzenleyin. Sunucuya yükleme yok, hesap gerekmez.",
      },
      en: {
        title: "Image Toolkit: Free Online Image Editor",
        description: "Resize, crop, compress and edit images in your browser. No server upload, no account required.",
      },
    },
  ],
  [
    "exif-cleaner",
    {
      tr: {
        title: "EXIF Temizleyici: Görsel Metaverisini Ücretsiz Sil",
        description: "JPG, PNG ve HEIC fotoğraflarından EXIF metaverisini tarayıcınızda temizleyin. Gizliliğinizi koruyun, dosya yüklemeyin.",
      },
      en: {
        title: "EXIF Cleaner: Remove Image Metadata Online Free",
        description: "Strip EXIF metadata from JPG, PNG and HEIC photos directly in your browser. Protect your privacy without uploading files.",
      },
    },
  ],
  [
    "image-format-converter",
    {
      tr: {
        title: "Görsel Dönüştürücü: JPG, PNG, WebP, HEIC Ücretsiz Çevir",
        description: "JPG, PNG, WebP, GIF, BMP ve HEIC/HEIF formatları arasında toplu dönüştürme. Tarayıcıda çalışır, sunucuya dosya gönderilmez.",
      },
      en: {
        title: "Image Converter: Free JPG PNG WebP HEIC Converter",
        description: "Convert between JPG, PNG, WebP, GIF, BMP and HEIC/HEIF formats in your browser. Batch conversion, no server upload.",
      },
    },
  ],
  [
    "bg-remover",
    {
      tr: {
        title: "Arka Plan Kaldırıcı: Ücretsiz AI ile Arka Plan Silme",
        description: "Görsellerden arka planı yapay zeka ile tarayıcıda kaldırın. Hiçbir dosya sunucuya gönderilmez. İlk yüklemeden sonra çevrimdışı çalışır.",
      },
      en: {
        title: "Background Remover: Free AI Background Removal",
        description: "Remove image backgrounds using AI, directly in your browser. No file is sent to any server. Works offline after first load.",
      },
    },
  ],
  [
    "video-to-audio",
    {
      tr: {
        title: "Video to Audio: Ücretsiz MP3 ve WAV Çıkarıcı",
        description: "MP4, MKV, AVI, MOV ve diğer video formatlarından ses çıkarın. MP3, WAV veya orijinal ses akışına dönüştürün. Tarayıcıda çalışır.",
      },
      en: {
        title: "Video to Audio: Free MP3 & WAV Extractor",
        description: "Extract audio from MP4, MKV, AVI, MOV and other video files. Convert to MP3, WAV or the original audio stream. All processing in-browser.",
      },
    },
  ],
  [
    "audio-editor",
    {
      tr: {
        title: "Ses Editörü: Ücretsiz Online Ses Kesici ve Düzenleyici",
        description: "MP3, WAV, FLAC ve diğer ses dosyalarını tarayıcınızda kesin ve düzenleyin. FFmpeg WASM ile çalışır, sunucuya yükleme yok.",
      },
      en: {
        title: "Audio Editor: Free Online Audio Cutter & Trimmer",
        description: "Trim, cut and edit MP3, WAV, FLAC and other audio files in your browser. Powered by FFmpeg WASM, no server upload.",
      },
    },
  ],
  [
    "stem-splitter",
    {
      tr: {
        title: "Stem Splitter: Ücretsiz Vokal ve Enstrüman Ayırıcı",
        description: "Müziği vokal, davul, bas ve diğer parçalara AI ile ayırın. Ücretsiz online stem ayrıştırıcı.",
      },
      en: {
        title: "Stem Splitter: Free Vocal & Instrument Separator",
        description: "Separate music into vocals, drums, bass and other stems using AI. Free online stem splitter.",
      },
    },
  ],
  [
    "dev-toolkit",
    {
      tr: {
        title: "Dev Toolkit: Ücretsiz Online Geliştirici Araçları",
        description: "JSON formatlama, Base64, JWT decoder, kod minimize etme ve daha fazlası. Tüm araçlar tarayıcınızda çalışır.",
      },
      en: {
        title: "Dev Toolkit: Free Online Developer Tools",
        description: "JSON formatter, Base64 encoder/decoder, JWT decoder, code minifier and more. All developer tools run in your browser.",
      },
    },
  ],
  [
    "video-compressor",
    {
      tr: {
        title: "Video Compressor: Ücretsiz Online Video Sıkıştırıcı",
        description: "Videoları tarayıcınızda sıkıştırın, dönüştürün ve kırpın. MP4, WebM, MOV, AVI, MKV desteği. Sunucuya yükleme yok, hesap gerekmez.",
      },
      en: {
        title: "Video Compressor: Free Online Video Compressor",
        description: "Compress, convert and trim videos in your browser. Supports MP4, WebM, MOV, AVI, MKV. No server upload, no account required.",
      },
    },
  ],
]);

const analyticsSnippet = `<!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-W21Y6X5KBH"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-W21Y6X5KBH');
    </script>`;

const manifestoContent = {
  tr: {
    lang: "tr",
    title: "manifesto",
    homeLabel: "Ana Sayfa",
    sections: [
      {
        heading: "miniapps nedir?",
        paragraphs: [
          "miniapps, küçük ama zaman kaybettiren işleri hızlıca çözmek için oluşturulmuş tarayıcı tabanlı mini uygulamalardır. Tek platformda birleşen bu uygulamalar, genel kullanım için gereken temel özelliklere sahiptir ve tamamen ücretsiz erişilebilir.",
          "Çoğu miniapp, herhangi bir kurulum gerektirmeden çalışır ve mümkün olan durumlarda işlemler doğrudan kullanıcının kendi cihazında gerçekleştirilir. Belge ve verileriniz cihazınızda işlendiği için hem gizli kalır hem de işlem süresi kısalır.",
        ],
      },
      {
        heading: "neden var?",
        paragraphs: [
          "Bugün son derece basit işler için bile hesap açmak, veri yüklemek, farklı ekranlar arasında kaybolmak ve çoğu zaman ücret ödemek sıradan hale gelmiş durumda.",
          "Oysa teknolojinin, hayatın birçok alanını daha erişilebilir kılması ve verimliliği artırırken kullanıcıyı gereksiz yüklerden kurtarması beklenir. Ancak internetteki pek çok uygulama bunun tam tersi çalışır; hem yavaştır hem de sizden ücret talep eder.",
          "Yalnızca ihtiyaca odaklanan, yapılması artık çok kolay olan uygulamalara ücret istemeyen ve gizliliğinizi garanti altına almaya çalışan miniapps işte bu nedenle ortaya çıktı.",
        ],
      },
      {
        heading: "temel prensipler",
        principles: [
          {
            title: "gizlilik",
            body: "Kullanıcı verisi toplamamak ve mümkün olan her durumda işlemleri cihaz üzerinde gerçekleştirmek önceliğimiz.",
          },
          {
            title: "hız",
            body: "Uygulamaların hızlı açılması ve kullanıcıyı bekletmeden işi bitirmesi asıl hedefimiz.",
          },
          {
            title: "açıklık",
            body: "miniapps'teki her uygulamanın sade ve anlaşılır olması en büyük arzumuz.",
          },
          {
            title: "küçük araçlar",
            body: "Büyük ve karmaşık bir platform kurmak yerine, tek bir işe odaklanan küçük uygulamalar üretmek felsefemiz.",
          },
          {
            title: "local-first yaklaşım",
            body: "Mümkün olan her durumda işlem gücü olarak kullanıcının kendi cihazını tercih etmek en büyük avantajımız.",
          },
        ],
      },
      {
        heading: "ne değil?",
        listIntro: "miniapps:",
        listItems: [
          "ücretli ve karmaşık bir platform değil.",
          "kullanıcı verisi üzerine kurulu bir sistem değil.",
          "gereksiz özelliklerle büyütülmüş bir ürün değil.",
          "onlarca özelliği bir uygulamaya eklediğimiz süslü araçlar değil.",
        ],
      },
      {
        heading: "gelecek",
        paragraphs: [
          "miniapps zamanla yeni araçlarla genişleyecek ancak **küçük fakat zaman kaybettiren işleri çözen pratik bir yardımcı olmaya devam edecek.**",
        ],
      },
    ],
  },
  en: {
    lang: "en",
    title: "manifesto",
    homeLabel: "Home",
    sections: [
      {
        heading: "what is miniapps?",
        paragraphs: [
          "miniapps are browser-based mini applications designed to quickly solve small but time-consuming tasks.",
          "These tools come together in a single place, offering the essential features needed for everyday use and they are completely free to access.",
          "Most miniapps work without any installation, and whenever possible, all processes run directly on the user’s own device. Since your documents and data are handled locally, they remain private while also reducing processing time.",
        ],
      },
      {
        heading: "why does it exist?",
        paragraphs: [
          "Today, even the simplest tasks often require creating an account, uploading data, navigating through multiple screens, and in many cases, paying for access.",
          "Yet technology is supposed to make things more accessible, improving efficiency while removing unnecessary friction. Instead, many tools on the internet do the opposite: they are slow and often come with a price tag.",
          "miniapps was created for this reason to focus only on real needs, offer tools that are already simple to build and use without charging for them, and to protect your privacy whenever possible.",
        ],
      },
      {
        heading: "core principles",
        principles: [
          {
            title: "privacy",
            body: "Not collecting user data and performing tasks on the user’s device whenever possible is our priority.",
          },
          {
            title: "speed",
            body: "Our goal is to make sure applications load quickly and allow users to complete their tasks without delay.",
          },
          {
            title: "clarity",
            body: "We aim for every miniapp to be simple, clear, and easy to understand.",
          },
          {
            title: "small tools",
            body: "Instead of building a large and complex platform, our philosophy is to create small tools that focus on doing one thing well.",
          },
          {
            title: "local-first approach",
            body: "Whenever possible, processing is handled on the user’s own device and this is one of our biggest advantages.",
          },
        ],
      },
      {
        heading: "what it is not",
        listIntro: "miniapps is not:",
        listItems: [
          "a paid and complex platform",
          "a system built on user data",
          "a product overloaded with unnecessary features",
          "a collection of bloated tools trying to do everything at once",
        ],
      },
      {
        heading: "future",
        paragraphs: [
          "miniapps will continue to grow with new tools over time. However, **it will remain a simple, practical helper focused on solving small but time-consuming tasks.**",
        ],
      },
    ],
  },
};

function renderManifestoInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

const enLocalizationReplacements = new Map([
  [
    "pdf-toolkit",
    [
      ['"Ghostscript ile PDF sıkıştırma"', '"PDF compression with Ghostscript"'],
      ['"Küçük dosya, düşük kalite"', '"Smaller file, lower quality"'],
      ['"Dengeli sıkıştırma"', '"Balanced compression"'],
      ['"Agresif sıkıştırma, kalite düşebilir"', '"Aggressive compression, quality may drop"'],
      ['"Sıkıştırılıyor..."', '"Compressing..."'],
      ['"PDF\'i Sıkıştır"', '"Compress PDF"'],
      ['"% küçüldü)"', '"% reduced)"'],
      ['"İndir"', '"Download"'],
      ['"Sonuç PDF içeriğine bağlıdır."', '"Results depend on the PDF content."'],
      ['"PDF yükleniyor..."', '"Loading PDF..."'],
      ['"Tek PDF yükleyebilir, sonra sayfaları bölebilir, birleştirebilir, silebilir veya döndürebilirsin."', '"You can load one PDF, then split, merge, delete, or rotate its pages."'],
      ['"Seç"', '"Choose"'],
      ['"CSV İndir"', '"Download CSV"'],
      ['"Excel İndir"', '"Download Excel"'],
      ['"Satır"', '"Rows"'],
      ['"Maks. Sütun"', '"Max columns"'],
      ['"Bu PDF içinde tabloya dönüştürülebilecek belirgin bir metin ızgarası bulunamadı."', '"No clear text grid that could be converted into a table was found in this PDF."'],
      ['"Taranmış PDF sayfalarını OCR ile okuyup düzenlenebilir DOCX çıktısına dönüştürür. İlk kullanımda dil modeli indirilebilir."', '"Reads scanned PDF pages with OCR and converts them into an editable DOCX output. A language model may be downloaded on first use."'],
      ['"PDF içindeki metin katmanını çıkarır, başlık, alt başlık ve paragraf olarak gruplar; ardından sade bir DOCX belgesi olarak kaydeder."', '"Extracts the text layer inside the PDF, groups it as headings, subheadings, and paragraphs, then saves it as a clean DOCX document."'],
      ['"Metin çıkarma modu"', '"Text extraction mode"'],
      ['"Metin Katmanı"', '"Text Layer"'],
      ['"İşleniyor..."', '"Processing..."'],
      ['"OCR ile DOCX Oluştur"', '"Create DOCX with OCR"'],
      ['"DOCX Oluştur ve İndir"', '"Create and Download DOCX"'],
      ['"Bu sayfada çıkarılabilir metin bulunamadı."', '"No extractable text was found on this page."'],
      ['"Yeni PDF Yükle"', '"Load New PDF"'],
      ['"Görsel formatı"', '"Image format"'],
      ['"Farklı Kaydet"', '"Save As"'],
      ['"Acrobat uyumluluğu için Ghostscript ile PDF yapısını onar"', '"Repair the PDF structure with Ghostscript for Acrobat compatibility"'],
      ['"Canvas context alınamadı."', '"Canvas context could not be created."'],
      ['"Görsel oluşturulamadı."', '"Image could not be generated."'],
      ['"OCR motoru hazırlanıyor. İlk kullanımda dil modeli indirilebilir."', '"Preparing OCR engine. A language model may be downloaded on first use."'],
      ['"OCR tamamlandı."', '"OCR completed."'],
      ['"Tablo analizi tamamlandı."', '"Table analysis completed."'],
      ['"PDF yüklenince önizleme burada görünür."', '"The preview will appear here after the PDF is loaded."'],
      ['"Önizleme"', '"Preview"'],
      ['"Tüm sayfalar"', '"All pages"'],
      ['"Metin veya logo filigranı ekle"', '"Add a text or logo watermark"'],
      ['"Logo / Görsel"', '"Logo / Image"'],
      ['"Dosya Seç"', '"Choose File"'],
      ['"Seçili logo"', '"Selected logo"'],
      ['"Boyut (sayfa genişliğine oranı)"', '"Size (relative to page width)"'],
      ['"Uygulanıyor..."', '"Applying..."'],
      ['"Uygula ve İndir"', '"Apply and Download"'],
      ['"Çıkarılabilir metin bulunamadı."', '"No extractable text found."'],
      ['"Lütfen bir PDF dosyası seç."', '"Please select a PDF file."'],
      ['"PDF yüklenemedi."', '"Failed to load PDF."'],
      ['"Lütfen bir PDF dosyası bırak."', '"Please drop a PDF file."'],
      ['"Sayfa sırası güncellendi."', '"Page order updated."'],
      ['"Sayfa sırası güncellenemedi."', '"Failed to update page order."'],
      ['"Bölme tamamlandı."', '"Split completed."'],
      ['"Bölme işlemi başarısız."', '"Split failed."'],
      ['"Birleştirme işlemi başarısız."', '"Merge failed."'],
      ['"PDF\'ler birleştirildi."', '"PDFs merged."'],
      ['"Geri alındı."', '"Undone."'],
      ['"Yeniden yapıldı."', '"Redone."'],
      ['"Seçili sayfalar indirildi."', '"Selected pages downloaded."'],
      ['"Extract işlemi başarısız."', '"Extract failed."'],
      ['"Tüm sayfalar kaldırıldı."', '"All pages removed."'],
      ['"Seçili sayfalar kaldırıldı."', '"Selected pages removed."'],
      ['"Silme işlemi başarısız."', '"Delete failed."'],
      ['"Görsel export işlemi başarısız."', '"Image export failed."'],
      ['"Rotasyon uygulanamadı."', '"Failed to apply rotation."'],
      ['"Onarım başarısız."', '"Repair failed."'],
      ['"Onarım tamamlandı: Acrobat uyumlu PDF indirildi."', '"Repair completed: Acrobat-compatible PDF downloaded."'],
      ['"OCR hazırlanıyor. İlk kullanım biraz sürebilir."', '"Preparing OCR. First use may take a while."'],
      ['"Metin katmanı okunuyor."', '"Reading text layer."'],
      ['"Metin çıkarma tamamlandı."', '"Text extraction completed."'],
      ['"OCR ile DOCX hazırlandı ve indirildi."', '"DOCX created with OCR and downloaded."'],
      ['"DOCX hazırlandı ve indirildi."', '"DOCX created and downloaded."'],
      ['"Metin çıkarma başarısız."', '"Text extraction failed."'],
      ['"Tablo yapısı analiz ediliyor."', '"Analyzing table structure."'],
      ['"Tablo bulunamadı."', '"No table found."'],
      ['"Tablo çıkarma başarısız."', '"Table extraction failed."'],
      ['"CSV indirildi."', '"CSV downloaded."'],
      ['"CSV dosyaları ZIP olarak indirildi."', '"CSV files downloaded as ZIP."'],
      ['"Excel dosyası indirildi."', '"Excel file downloaded."'],
      ['"Geri"', '"Back"'],
      ['"PDF Yükle"', '"Load PDF"'],
      ['"PDF işleniyor..."', '"Processing PDF..."'],
      ['"PDF eklemek ve birleştirmek için dosyayı buraya bırak"', '"Drop a PDF here to add and merge it."'],
      ['children:"Böl"', 'children:"Split"'],
      ['children:"Birleştir"', 'children:"Merge"'],
      ['children:"Geri Al"', 'children:"Undo"'],
      ['children:"İleri Al"', 'children:"Redo"'],
      ['children:"Dışarı Aktar"', 'children:"Export"'],
      ['children:"Acrobat Onar"', 'children:"Repair for Acrobat"'],
      ['"Dışa aktarma formatı"', '"Export format"'],
      ['"DOCX / Metin Katmanı"', '"DOCX / Text Layer"'],
      ['"Rotasyon PDF\'e yazıldı."', '"Rotation applied and PDF downloaded."'],
      ['"Compress motoru kontrol ediliyor..."', '"Checking Compress engine..."'],
      ['"Compress motoru çalışmıyor. `pdf-compress-server` açık ve Ghostscript hazır olmalı."', '"Compress engine not running. `pdf-compress-server` must be open and Ghostscript ready."'],
      [' yüklendi.`', ' loaded.`'],
      [' sayfada tablo çıkarıldı.`', ' tables extracted.`'],
      [' olarak indirilmeye hazırlandı.`', ' prepared for download.`'],
      [' seçili sayfa`', ' selected pages`'],
      [' sayfanın tamamı`', ' pages total`'],
      ['`OCR çalışıyor: sayfa ', '`OCR running: page '],
      ['`Watermark önizleme sayfa ', '`Watermark preview page '],
      ['`Seçili (', '`Selected ('],
      ['children:"Geri"', 'children:"Back"'],
      ['t?"Geri":"Load PDF"', 't?"Back":"Load PDF"'],
      ['children:"Rotasyonu Uygula"', 'children:"Apply Rotation"'],
      ['children:"Tabloyu Analiz Et"', 'children:"Analyze Table"'],
      ['a?"Analiz ediliyor...":"Tabloyu Analiz Et"', 'a?"Analyzing...":"Analyze Table"'],
      ['d==="text"?"Metin":"Logo / Image"', 'd==="text"?"Text":"Logo / Image"'],
      ['placeholder:"GIZLI, TASLAK, KOPYA..."', 'placeholder:"CONFIDENTIAL, DRAFT, COPY..."'],
      ['children:"Font Boyutu"', 'children:"Font Size"'],
      ['children:"Renk"', 'children:"Color"'],
      ['children:"Metin"', 'children:"Text"'],
      ['children:"Tip"', 'children:"Type"'],
      ['children:"Sil"', 'children:"Delete"'],
      ['alt:`Sayfa ${r.pageIndex+1}`', 'alt:`Page ${r.pageIndex+1}`'],
      ['["Sayfa ",h+1]', '["Page ",h+1]'],
      ['children:"Sayfa"', 'children:"Pages"'],
      ['["Sayfa ",h.pageNumber]', '["Page ",h.pageNumber]'],
      ['["Sayfa ",u.pageNumber]', '["Page ",u.pageNumber]'],
      ['`Sayfa ${n.pageNumber}`', '`Page ${n.pageNumber}`'],
      ['["Sayfa ",o+1]', '["Page ",o+1]'],
      ['children:"Blok"', 'children:"Blocks"'],
      ['{value:"gray",label:"Gri"}', '{value:"gray",label:"Gray"}'],
      ['{value:"black",label:"Siyah"}', '{value:"black",label:"Black"}'],
      ['{value:"white",label:"Beyaz"}', '{value:"white",label:"White"}'],
      ['-secili-sayfa-', '-selected-page-'],
      ['-sayfa-', '-page-'],
      ['-watermark-secili', '-watermark-selected'],
      ['`${ve.length} sayfa ${c.toUpperCase()} prepared for download.`', '`${ve.length} pages ${c.toUpperCase()} prepared for download.`'],
      ['"Uygulanacak rotasyon yok."', '"No rotation changes to apply."'],
      ['"Watermark eklendi, PDF indirildi."', '"Watermark added and PDF downloaded."'],
      ['"Watermark eklenemedi."', '"Failed to add watermark."'],
      ['"pdf-ciktilari"', '"pdf-outputs"'],
      ['"pdf-gorselleri"', '"pdf-images"'],
      ['`-sayfa-${String(mt+1).padStart(2,"0")}`', '`-page-${String(mt+1).padStart(2,"0")}`'],
      ['`-sayfa-${String(et.pageNumber).padStart(2,"0")}.csv`', '`-page-${String(et.pageNumber).padStart(2,"0")}.csv`'],
    ],
  ],
  [
    "csv-toolkit",
    [
      ['children:"Yeni Dosya"', 'children:"New File"'],
      ['["clean","Temizle"]', '["clean","Clean"]'],
      ['label:"Windows-1254 (Turkish Excel)"', 'label:"Windows-1254"'],
      ['"For Turkish Excel outputs, `Windows-1254` is usually the safest choice."', '""'],
      ['"Bul & Değiştir"', '"Find & Replace"'],
      ['"Bu işlem ana veriyi kalıcı olarak günceller. Geri alma yok."', '"This action permanently updates the source data. It cannot be undone."'],
      ['"Tüm sütunlar"', '"All columns"'],
      ['"Büyük/küçük harf duyarlı"', '"Case sensitive"'],
      ['"Tam hücre eşleşmesi"', '"Exact cell match"'],
      ['"Tekilleştir"', '"Deduplicate"'],
      ['"İlk satır korunur, tekrarlılar silinir. Geri alma yok."', '"The first row is kept and duplicates are removed. This cannot be undone."'],
      ['"Henüz çalıştırılmadı."', '"Not run yet."'],
      ['"Sütunlar"', '"Columns"'],
      ['"Görünürlük, isim ve sıra kontrolü."', '"Control visibility, naming, and order."'],
      ['"Tümünü Seç"', '"Select All"'],
      ['"Hiçbirini Seçme"', '"Select None"'],
      ['"Windows-1254 (Türkçe Excel)"', '"Windows-1254"'],
      ['"CSV dosyanı bırak, temizle, filtrele ve tekrar indir."', '"Drop your CSV, clean it, filter it, and export it again."'],
      ['"Daha sakin bir çalışma alanı: sütun düzenleme, filtreleme, bul-değiştir, tekilleştirme ve birleştirme aynı ekranda."', '"A calmer workspace: column editing, filtering, find-and-replace, deduplication, and merging in one screen."'],
      ['"CSV dosyasını buraya sürükle veya seç"', '"Drag your CSV here or choose a file"'],
      ['"CSV, TSV ve delimiter’lı text dosyaları desteklenir."', '"CSV, TSV, and delimiter-based text files are supported."'],
      ['"Türkçe Excel çıktıları için çoğu zaman `Windows-1254` en güvenli seçimdir."', '""'],
      ['"İçerir"', '"Contains"'],
      ['"İçermez"', '"Does not contain"'],
      ['"Eşittir"', '"Equals"'],
      ['"Eşit değildir"', '"Does not equal"'],
      ['"İle başlar"', '"Starts with"'],
      ['"İle biter"', '"Ends with"'],
      ['"Boştur"', '"Is empty"'],
      ['"Boş değildir"', '"Is not empty"'],
      ['"Kuralları VE / VEYA mantığıyla uygula."', '"Apply rules with AND / OR logic."'],
      ['"Tüm kurallar eşleşmeli"', '"All rules must match"'],
      ['"Değer"', '"Value"'],
      ['" satırdan "', '" of rows, "'],
      ['" tanesi eşleşiyor"', '" match"'],
      ['"JSON Önizleme"', '"JSON Preview"'],
      ['"Alias ve görünür sütunlara göre üretilen çıktı"', '"Output generated from aliases and visible columns"'],
      ['" kayıt"', '" records"'],
      ['"İkinci dosya okunamadı."', '"The second file could not be read."'],
      ['"İkinci Dosya"', '"Second File"'],
    ],
  ],
  [
    "qr-generator",
    [
      ['"Ağ bilgisi"', '"Wi-Fi details"'],
      ['"Kişi kartı"', '"Contact card"'],
      ['"E-posta"', '"Email"'],
      ['"Mail oluştur"', '"Compose email"'],
      ['"Düz içerik"', '"Plain content"'],
      ['"İstanbul"', '"Istanbul"'],
      ['"Miniapps QR Generator lokal çalışan bir araçtır."', '"Miniapps QR Generator runs locally."'],
      ['"İletişim Kartı"', '"Contact card"'],
      ['"QR foreground ve background renkleri birbirine fazla yakın; tarama zorlaşabilir."', '"QR foreground and background colors are too close; scanning may be harder."'],
      ['"Şeffaf arka plan bazı yüzeylerde okunabilirliği düşürebilir."', '"A transparent background may reduce readability on some surfaces."'],
      ['"Margin çok düşük; bazı okuyucular QR kodu çerçevesiz okumakta zorlanabilir."', '"The margin is very low; some scanners may struggle without a border."'],
      ['"Logo eklerken hata düzeltme seviyesini Q veya H yapmak daha güvenlidir."', '"When adding a logo, using Q or H error correction is safer."'],
      ['"Logo boyutu yüksek; QR taranabilirliğini bozabilir."', '"The logo is quite large and may reduce scan reliability."'],
      ['"Telefon"', '"Phone"'],
      ['"Görsel yüklenemedi."', '"Image could not be loaded."'],
      ['"Bağımsız kullanım"', '"Standalone use"'],
      ['"Logo okunamadı."', '"Logo could not be read."'],
      ['"Ağ adı"', '"Network name"'],
      ['"Şifre"', '"Password"'],
      ['"Güvenlik"', '"Security"'],
      ['"Şifresiz"', '"No password"'],
      ['"Gizli ağ"', '"Hidden network"'],
      ['"Şirket"', '"Company"'],
      ['"Telefon Numarası"', '"Phone Number"'],
      ['"Hazır Mesaj"', '"Preset Message"'],
      ['"Alıcı"', '"Recipient"'],
      ['"Mail gövdesi"', '"Email body"'],
      ['"Konum Türü"', '"Location type"'],
      ['"Harita Araması"', '"Map Search"'],
      ['"Düz metin"', '"Plain text"'],
      ['"QR Oluşturucu"', '"QR Generator"'],
      ['"QR Türü"', '"QR Type"'],
      ['"Tasarım Adı"', '"Design Name"'],
      ['"QR adı"', '"QR name"'],
      ['"Stil Ayarları"', '"Style Settings"'],
      ['"Renk, margin, boyut ve export güvenliği"', '"Color, margin, size, and export safety"'],
      ['"Hata Düzeltme"', '"Error Correction"'],
      ['"Şeffaf Arka Plan"', '"Transparent Background"'],
      ['"Logoyu Kaldır"', '"Remove Logo"'],
      ['"Geçmiş Tasarımlar"', '"Saved Designs"'],
      ['"Geçmişi Temizle"', '"Clear History"'],
      ['"Henüz kayıt yok."', '"No records yet."'],
      ['"Eski tasarımlarını bu alandan görebilirsin."', '"You can view your past designs from this section."'],
      ['"Aç"', '"Open"'],
      ['"Canlı Preview"', '"Live Preview"'],
      ['"İndir"', '"Download"'],
      ['"QR hazırlanıyor..."', '"Preparing QR..."'],
      ['"Tür"', '"Type"'],
      ['"İçerik"', '"Content"'],
      ['||"Genel"', '||""'],
      ['||"Standalone use"', '||""'],
      ['new Intl.DateTimeFormat("tr-TR"', 'new Intl.DateTimeFormat("en-US"'],
      ['label:"Telefon"', 'label:"Phone"'],
      ['hint:"Ara"', 'hint:"Call"'],
      ['hint:"Harita / geo"', 'hint:"Map / geo"'],
      ['"Web adresi"', '"Web address"'],
      ['"Mesaj linki"', '"Message link"'],
      ['"Konum"', '"Location"'],
      ['children:"Ad"', 'children:"First Name"'],
      ['placeholder:"Ad"', 'placeholder:"First name"'],
      ['children:"Soyad"', 'children:"Last Name"'],
      ['placeholder:"Soyad"', 'placeholder:"Last name"'],
      ['children:"Unvan"', 'children:"Title"'],
      ['placeholder:"Unvan"', 'placeholder:"Title"'],
      ['children:"Telefon"', 'children:"Phone"'],
      ['children:"Adres"', 'children:"Address"'],
      ['placeholder:"Adres"', 'placeholder:"Address"'],
      ['children:"Not"', 'children:"Note"'],
      ['placeholder:"Ek not"', 'placeholder:"Extra note"'],
      ['placeholder:"Mesaj"', 'placeholder:"Message"'],
      ['children:"Konu"', 'children:"Subject"'],
      ['placeholder:"Konu"', 'placeholder:"Subject"'],
      ['children:"Koordinat"', 'children:"Coordinates"'],
      ['children:"Adres / Harita Linki"', 'children:"Address / Map Link"'],
      ['placeholder:"Adres veya arama terimi"', 'placeholder:"Address or search term"'],
      ['children:"Metin"', 'children:"Text"'],
      ['children:"Mesaj"', 'children:"Message"'],
      ['children:"Yeni QR"', 'children:"New QR"'],
      ['children:"Kaydet"', 'children:"Save"'],
      ['children:"Temizle"', 'children:"Clear"'],
      ['children:"QR Rengi"', 'children:"QR Color"'],
      ['children:"Arka Plan"', 'children:"Background"'],
      ['children:"Boyut"', 'children:"Size"'],
      ['children:"Logo Boyutu %"', 'children:"Logo Size %"'],
      ['children:"Logo Ekle"', 'children:"Add Logo"'],
      ['children:"Sil"', 'children:"Delete"'],
      ['children:"Harita"', 'children:"Map"'],
      ['children:"Telefon"', 'children:"Phone"'],
      ['children:"Konum"', 'children:"Location"'],
      ['children:"Metin"', 'children:"Text"'],
      ['children:"Şirket"', 'children:"Company"'],
      ['children:"E-posta"', 'children:"Email"'],
      ['children:"Telefon Numarası"', 'children:"Phone Number"'],
      ['children:"Ağ adı"', 'children:"Network Name"'],
      ['children:"Şifre"', 'children:"Password"'],
      ['children:"Güvenlik"', 'children:"Security"'],
      ['children:"Şifresiz"', 'children:"No password"'],
      ['children:"Gizli ağ"', 'children:"Hidden network"'],
      ['children:"Konum Türü"', 'children:"Location Type"'],
      ['children:"Harita Araması"', 'children:"Map Search"'],
      ['children:"Düz metin"', 'children:"Plain text"'],
      ['children:"QR Türü"', 'children:"QR Type"'],
      ['children:"Tasarım Adı"', 'children:"Design Name"'],
      ['children:"Stil Ayarları"', 'children:"Style Settings"'],
      ['children:"Hata Düzeltme"', 'children:"Error Correction"'],
      ['children:"Şeffaf Arka Plan"', 'children:"Transparent Background"'],
      ['children:"Logoyu Kaldır"', 'children:"Remove Logo"'],
      ['children:"Geçmiş Tasarımlar"', 'children:"Saved Designs"'],
      ['children:"Geçmişi Temizle"', 'children:"Clear History"'],
      ['children:"Canlı Preview"', 'children:"Live Preview"'],
      ['children:"Tür"', 'children:"Type"'],
      ['children:"İçerik"', 'children:"Content"'],
      ['return{url:"Link",wifi:"Wi-Fi",vcard:"vCard",whatsapp:"WhatsApp",email:"Email",phone:"Telefon",location:"Location",text:"Metin"}[e]', 'return{url:"Link",wifi:"Wi-Fi",vcard:"vCard",whatsapp:"WhatsApp",email:"Email",phone:"Phone",location:"Location",text:"Text"}[e]'],
      ['url:{url:"https://www.mmo.org.tr"}', 'url:{url:"https://example.com"}'],
      ['wifi:{ssid:"MMO-Guest",password:"",security:"WPA",hidden:!1}', 'wifi:{ssid:"Guest Wi-Fi",password:"",security:"WPA",hidden:!1}'],
      ['vcard:{firstName:"Yusuf Emre",lastName:"Atasayar",company:"miniapps",title:"Kurucu",phone:"+905551112233",email:"hello@example.com",website:"https://example.com",address:"Istanbul, Turkey",note:"Quick contact card via QR"}', 'vcard:{firstName:"Alex",lastName:"Morgan",company:"Example Co",title:"Founder",phone:"+12025550123",email:"hello@example.com",website:"https://example.com",address:"London, UK",note:"Quick contact card via QR"}'],
      ['phone:{phone:"+902122223344"}', 'phone:{phone:"+12025550123"}'],
      ['name:"MMO Link QR"', 'name:"Example Link QR"'],
      ['name:"Misafir Wi-Fi"', 'name:"Guest Wi-Fi"'],
      ['qh(e){return e.type==="url"&&e.name==="Link QR"&&e.fields.url.url==="https://www.mmo.org.tr"&&e.fields.wifi.ssid==="MMO-Guest"&&e.fields.vcard.firstName==="Yusuf Emre"}', 'qh(e){return e.type==="url"&&e.name==="Link QR"&&e.fields.url.url==="https://example.com"&&e.fields.wifi.ssid==="Guest Wi-Fi"&&e.fields.vcard.firstName==="Alex"}'],
      ['"İstanbul, Türkiye"', '"London, UK"'],
      ['"QR ile hızlı iletişim kartı"', '"Quick contact card via QR"'],
      ['"Merhaba, QR üzerinden ulaşıyorum."', '"Hello, I am reaching out via QR."'],
      ['"QR Üzerinden Mesaj"', '"Message via QR"'],
      ['"Merhaba, bu e-postayı QR kod üzerinden başlatıyorum."', '"Hello, I am starting this email from a QR code."'],
    ],
  ],
  [
    "image-toolkit",
    [
      ['children:"Rotasyonu Uygula"', 'children:"Apply Rotation"'],
      ['"Canvas context alınamadı."', '"Canvas context could not be created."'],
      ['"Görsel blob oluşturulamadı."', '"Image blob could not be created."'],
      ['"Thumbnail data URL üretilemedi."', '"Thumbnail data URL could not be generated."'],
      ['"Görsel boyutu tarayıcı canvas limitini aşıyor."', '"Image dimensions exceed the browser canvas limit."'],
      ['"Görseller yükleniyor..."', '"Loading images..."'],
      ['"Görselleri seç veya sürükle."', '"Choose or drag images."'],
      ['"Boyutlandır, sıkıştır, kırp ve indir."', '"Resize, compress, crop, and download."'],
      ['"Görselleri bırak, düzenle ve yeniden indir."', '"Drop images, edit them, and download again."'],
      ['"Toplu görsel düzenleme, yeniden boyutlandırma ve sıkıştırma işlemlerini tek ekrandan hızlıca yapabilirsin."', '"Handle batch image editing, resizing, and compression quickly from one screen."'],
      ['"Dosya yükleme"', '"File upload"'],
      ['"Yükle"', '"Upload"'],
      ['"İşleniyor..."', '"Processing..."'],
      ['"Görsel Seç"', '"Choose Image"'],
      ['"Sürükle bırak da çalışır. JPG, PNG, WebP, GIF, BMP ve HEIC desteklenir."', '"Drag and drop works too. JPG, PNG, WebP, GIF, BMP, and HEIC are supported."'],
      ['"Dosya adını koru"', '"Keep file name"'],
      ['aria-label:"Bilgi"', 'aria-label:"Info"'],
      ['"Seç"', '"Choose"'],
      ['"kaldır"', '"remove"'],
      ['"Genişliğe göre"', '"By width"'],
      ['"Kutuya sığdır"', '"Fit to box"'],
      ['"Genişlik"', '"Width"'],
      ['"Yükseklik"', '"Height"'],
      ['"Görsel bekleniyor"', '"Waiting for image"'],
      ['"Desteklenen görsel bulunamadı."', '"No supported image found."'],
      ['"görsel eklendi."', '"images added."'],
      ['"dosya atlandı."', '"files skipped."'],
      ['"GIF dosyaları ilk kare olarak işlenir."', '"GIF files are processed as the first frame."'],
      ['"Seçili görseller kaldırıldı."', '"Selected images removed."'],
      ['"Döndürme ve flip işlemleri uygulandı."', '"Rotation and flip changes were applied."'],
      ['"Görseller işlenemedi."', '"Images could not be processed."'],
      ['"Kaliteli görselleri daha fazla, düşük kalitelileri daha az sıkıştırır."', '"Compresses high-quality images more and low-quality images less."'],
      ['"Sıkıştırma yok"', '"No compression"'],
      ['"Maksimum eşitleme"', '"Maximum normalization"'],
      ['"PNG çıktısı kayıpsızdır; boyut küçülmesi sınırlı olabilir."', '"PNG output is lossless; size reduction may be limited."'],
      ['"Tümünü Sıkıştır ve İndir"', '"Compress All and Download"'],
      ['"Görsel Ekle"', '"Add Image"'],
      ['"Seçilileri Sil"', '"Delete Selected"'],
      ['"Seçilileri İndir"', '"Download Selected"'],
      ['"Seçilileri ZIP"', '"ZIP Selected"'],
      ['"Tümünü İndir"', '"Download All"'],
      ['"Tümünü ZIP"', '"ZIP All"'],
      ['"Boyut değiştirme yok"', '"No resize"'],
    ],
  ],
  [
    "exif-cleaner",
    [
      ['children:"Kamera"', 'children:"Camera"'],
      ['"EXIF bulundu"', '"EXIF found"'],
      ['"GPS yok"', '"No GPS"'],
      ['"Etiket: "', '"Tags: "'],
      ['"Temizlenecek"', '"Will be cleaned"'],
      ['"Yine de temiz kopya üretilecek"', '"A clean copy will still be generated"'],
      ['"Metadata okunamadi; temiz kopya yine de üretilebilir."', '"Metadata could not be read; a clean copy can still be created."'],
      ['"Canvas context alınamadı."', '"Canvas context could not be created."'],
      ['"Görsel blob oluşturulamadı."', '"Image blob could not be created."'],
      ['"Thumbnail oluşturulamadı."', '"Thumbnail could not be generated."'],
      ['"Görsel boyutu tarayıcı canvas limitini aşıyor."', '"Image dimensions exceed the browser canvas limit."'],
      ['"HEIC dosyasında çözümlenebilir görüntü bulunamadı."', '"No decodable image was found in the HEIC file."'],
      ['"HEIC piksel verisi oluşturulamadı."', '"HEIC pixel data could not be generated."'],
      ['"Dönüştürülen HEIC verisi okunamadı."', '"Converted HEIC data could not be read."'],
      ['"Birinci HEIC decoder başarısız oldu."', '"The primary HEIC decoder failed."'],
      ['"Tarayıcı HEIC dosyasını açamadı ve yerel dönüşüm başarısız oldu."', '"The browser could not open the HEIC file and local conversion failed."'],
      ['"Dosyalar hazırlanıyor..."', '"Preparing files..."'],
      ['"Daha fazla fotoğraf ekle"', '"Add more photos"'],
      ['"Fotoğrafları bırak, metadata temiz kopyalarını indir"', '"Drop photos and download metadata-free copies"'],
      ['"JPG, PNG, WebP ve HEIC dosyalarını aynı çalışma alanına ekleyebilirsin."', '"You can add JPG, PNG, WebP, and HEIC files to the same workspace."'],
      ['"EXIF, GPS ve benzeri gömülü alanlar tarayıcı içinde sıfırlanır. Dosyaların cihazından çıkmaz."', '"EXIF, GPS, and similar embedded fields are cleared in the browser. Your files never leave the device."'],
      ['"Bulunamadı"', '"Not found"'],
      ['"Çekim"', '"Captured"'],
      ['"Yön"', '"Orientation"'],
      ['"Sonuç"', '"Result"'],
      ['"Desteklenen dosya bulunamadı. JPG, PNG, WebP veya HEIC deneyin."', '"No supported file found. Try JPG, PNG, WebP, or HEIC."'],
      ['"Bazı dosyalar desteklenmediği için atlandı."', '"Some files were skipped because they are not supported."'],
      ['"Görseller hazırlanamadı."', '"Images could not be prepared."'],
      ['"görsel"', '"image"'],
      ['"Fotoğrafları yükle, görünmeyen metadata izlerini tek adımda temizle."', '"Upload photos and remove hidden metadata traces in one step."'],
      ['"Sosyal paylaşım, CV başvurusu, medya gönderimi veya müşteri teslimi öncesinde fotoğrafların içindeki GPS ve cihaz bilgisini ayıklayabilirsin."', '"Before social sharing, job applications, media submissions, or client delivery, you can strip GPS and device data from your photos."'],
      ['"için temiz kopya hazırlandı."', '"clean copy prepared for"'],
      ['"Temiz kopyaları hazırla ve indir."', '"Prepare clean copies and download."'],
      ['"Metadata yeni dosyaya taşınmaz. Çıktı formatını seç, sonra tüm dosyaları tek akışta dışa aktar."', '"Metadata is not carried over to the new file. Choose an output format, then export all files in one flow."'],
      ['"dosya hazır"', '"file ready"'],
      ['"çıktı formatı"', '"output format"'],
      ['"+ Fotoğraf Ekle"', '"+ Add Photo"'],
      ['"Çıktı formatı"', '"Output format"'],
      ['"Temiz kopyalar hazırlanıyor..."', '"Preparing clean copies..."'],
      ['"İndir"', '"Download"'],
    ],
  ],
  [
    "image-format-converter",
    [
      ['children:"Boyut"', 'children:"Size"'],
      ['"Canvas context alınamadı."', '"Canvas context could not be created."'],
      ['"Görsel blob oluşturulamadı."', '"Image blob could not be created."'],
      ['"Thumbnail oluşturulamadı."', '"Thumbnail could not be generated."'],
      ['"Görsel boyutu tarayıcı canvas limitini aşıyor."', '"Image dimensions exceed the browser canvas limit."'],
      ['"HEIC dosyasında çözümlenebilir görüntü bulunamadı."', '"No decodable image was found in the HEIC file."'],
      ['"HEIC piksel verisi oluşturulamadı."', '"HEIC pixel data could not be generated."'],
      ['"Dönüştürülen HEIC verisi okunamadı."', '"Converted HEIC data could not be read."'],
      ['"Birinci HEIC decoder başarısız oldu."', '"The primary HEIC decoder failed."'],
      ['"Tarayıcı HEIC dosyasını açamadı ve yerel dönüşüm başarısız oldu."', '"The browser could not open the HEIC file and local conversion failed."'],
      ['"Dosyalar hazırlanıyor..."', '"Preparing files..."'],
      ['"Daha fazla görsel ekle"', '"Add more images"'],
      ['"Görselleri bırak, farklı formata dönüştür"', '"Drop images and convert them to another format"'],
      ['"JPG, PNG, WebP, GIF, BMP ve HEIC/HEIF dosyalarını aynı çalışma alanına ekleyebilirsin."', '"You can add JPG, PNG, WebP, GIF, BMP, and HEIC/HEIF files to the same workspace."'],
      ['"Toplu dönüştürme tarayıcı içinde çalışır. Tek dosyayı doğrudan, çoklu dosyayı zip olarak dışa aktarabilirsin."', '"Batch conversion runs in the browser. Export a single file directly or multiple files as a zip."'],
      ['"Ölçü"', '"Dimensions"'],
      ['"Desteklenen dosya bulunamadı. JPG, PNG, WebP, GIF, BMP veya HEIC deneyin."', '"No supported file found. Try JPG, PNG, WebP, GIF, BMP, or HEIC."'],
      ['"Bazı dosyalar desteklenmediği için atlandı."', '"Some files were skipped because they are not supported."'],
      ['"Görseller hazırlanamadı."', '"Images could not be prepared."'],
      ['"görsel"', '"image"'],
      ['"Dönüştürme tamamlanamadı."', '"Conversion could not be completed."'],
      ['"Görselleri yükle, istediğin formata tek akışta dönüştür."', '"Upload images and convert them to the format you want in one flow."'],
      ['"Ürün görselleri, ekran görüntüleri, HEIC fotoğrafları veya kampanya asset’leri için hızlı yerel dönüştürme."', '"Fast local conversion for product images, screenshots, HEIC photos, or campaign assets."'],
      ['"Dönüştür ve dışa aktar."', '"Convert and export."'],
      ['"Çıktı formatını seç, sonra tüm dosyaları tek seferde indir. Çoklu dosyalar zip olarak hazırlanır."', '"Choose an output format, then download all files at once. Multiple files are prepared as a zip."'],
      ['"dosya hazır"', '"file ready"'],
      ['"olarak hazırlandı."', '"prepared as"'],
      ['"çıktı formatı"', '"output format"'],
      ['"+ Görsel Ekle"', '"+ Add Image"'],
      ['"Çıktı formatı"', '"Output format"'],
      ['"Dönüştürülüyor..."', '"Converting..."'],
      ['"İndir"', '"Download"'],
    ],
  ],
  [
    "bg-remover",
    [
      ['children:"Bilgi"', 'children:"Info"'],
      ['"Görsel yüklemek için tıkla veya sürükle bırak"', '"Click to upload an image or drag and drop"'],
      ['"İşleniyor…"','"Processing…"'],
      ['"Görselleri seç veya sürükle"', '"Choose or drag images"'],
      ['"PNG, JPG, WebP ve diğer görsel formatları."', '"PNG, JPG, WebP, and other image formats."'],
      ['"Görselleri buraya bırak"', '"Drop images here"'],
      ['"PNG, JPG, WEBP ve diğer görsel formatlarını tek seferde ekleyebilirsin."', '"You can add PNG, JPG, WEBP, and other image formats in one go."'],
      ['"Dosya Seç"', '"Choose File"'],
      ['"veya sürükle bırak"', '"or drag and drop"'],
      ['"veya çoklu sürükle bırak"', '"or drag and drop multiple files"'],
      ['"AI modeli çalışıyor"', '"AI model is running"'],
      ['"WASM hazırlanıyor"', '"Preparing WASM"'],
      ['"Varlıklar yükleniyor"', '"Loading assets"'],
      ['"İşleniyor"', '"Processing"'],
      ['"Çıktı hazırlanıyor"', '"Preparing output"'],
      ['"Lütfen bekleyin…"','"Please wait…"'],
      ['"Son dosya hazırlanıyor…"','"Preparing final file…"'],
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
      ['"Arka planı kaldır."', '"Remove the background."'],
      ['"Nesneyi temiz çıkar, şeffaf PNG olarak indir."', '"Keep the subject clean and download a transparent PNG."'],
      ['"AI destekli"', '"AI powered"'],
      ['"Tarayıcıda işler"', '"Runs in the browser"'],
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
      ['"İlk kullanım"', '"First Use"'],
      ['"Sonraki kullanımlar"', '"Subsequent Uses"'],
      ['"Gizlilik"', '"Privacy"'],
      ['"Model kaynağı"', '"Model source"'],
      ['"Bu araç ilk açılışta model dosyalarını internetten indirir; ilk kurulum tamamlanmadan offline çalışmaz."', '"This tool downloads model files from the internet on first launch; it cannot run offline until the initial setup is complete."'],
      ['"Model bir kez cache\'e alındıktan sonra aynı cihazda bağlantı olmadan tekrar çalışabilir."', '"Once the model is cached, it can run again on the same device without a connection."'],
      ['"Görsel hiçbir sunucuya gönderilmez, tüm işlem cihazında gerçekleşir."', '"No image is sent to any server; all processing happens on your device."'],
      ['"Şu an model verisi IMG.LY CDN üzerinden indirilir; işlem yine de tarayıcı içinde yapılır."', '"Model data is currently downloaded from the IMG.LY CDN; processing still happens inside the browser."'],
    ],
  ],
  [
    "video-to-audio",
    [
      ['children:"Kaynak dosya"', 'children:"Source file"'],
      ['children:"Kaynak"', 'children:"Source"'],
      ['children:"Kalite"', 'children:"Quality"'],
      ['children:"Tip"', 'children:"Type"'],
      [':"Otomatik"', ':"Automatic"'],
      ['"Orijinal · encode etmeden kopyala"', '"Original · copy without re-encoding"'],
      ['children:"Orijinal"', 'children:"Original"'],
      ['children:"Evrensel uyumluluk"', 'children:"Universal compatibility"'],
      ['children:"Drag & drop da desteklenir"', 'children:"Drag and drop is also supported"'],
      ['"Ses Ayarları"', '"Audio Settings"'],
      ['"Çıktı formatını ve MP3 kalite seviyesini seç."', '"Choose the output format and MP3 quality level."'],
      ['"Hızlı, encode yok"', '"Fast, no encoding"'],
      ['"Kayıpsız, büyük dosya"', '"Lossless, larger file"'],
      ['"Video yükleniyor..."', '"Loading video..."'],
      ['"Videonu buraya bırak veya dosya seç"', '"Drop your video here or choose a file"'],
      ['"MP4, MKV, AVI, MOV, WebM, FLV, TS ve benzeri video formatlarını tek adımda işleyebilirsin."', '"You can process MP4, MKV, AVI, MOV, WebM, FLV, TS, and similar video formats in one step."'],
      ['"Yükleniyor..."', '"Loading..."'],
      ['"Video Seç"', '"Choose Video"'],
      ['"Dönüştürme motoru hazırlanıyor"', '"Preparing conversion engine"'],
      ['"İşleniyor..."', '"Processing..."'],
      ['"WebAssembly modülü indiriliyor ve derleniyor. İlk açılışta 15–30 saniye sürebilir; sonraki kullanımlarda tarayıcı önbelleğinden anlık yüklenir."', '"The WebAssembly module is downloading and compiling. The first launch may take 15–30 seconds; later launches load instantly from browser cache."'],
      ['"Ses akışı çıkarılıyor. Bu sırada sayfayı açık bırakman yeterli."', '"Extracting the audio stream. Just keep the page open while it runs."'],
      ['"Büyük dosyalar birkaç dakika alabilir."', '"Large files may take a few minutes."'],
      ['"Hazır"', '"Ready"'],
      ['"Ses dosyası üretildi."', '"Audio file created."'],
      ['"İndir"', '"Download"'],
      ['"FFmpeg henüz yüklenmedi."', '"FFmpeg is not loaded yet."'],
      ['"Orijinal ses akışı çıkarılamadı. MP3 veya WAV seçin."', '"The original audio stream could not be extracted. Choose MP3 or WAV."'],
      ['"Ses çıkarma başarısız."', '"Audio extraction failed."'],
      ['"WAV · kayıpsız çıktı"', '"WAV · lossless output"'],
      ['"Lütfen bir video dosyası seç."', '"Please choose a video file."'],
      ['"Dönüştürme başarısız."', '"Conversion failed."'],
      ['"Başka Video Seç"', '"Choose Another Video"'],
      ['"Sesi Çıkar"', '"Extract Audio"'],
      ['"Çıktı modu"', '"Output mode"'],
      ['"Özet"', '"Summary"'],
      ['"İpucu"', '"Tip"'],
      ['"En pratik seçimler"', '"Most practical choices"'],
      ['"Genel paylaşım ve uyumluluk için en güvenli seçenek."', '"The safest option for general sharing and compatibility."'],
      ['"Düzenleme ve arşiv için daha temiz ama daha büyük çıktı."', '"Cleaner but larger output for editing and archiving."'],
      ['"Encode etmeden hızlı ses ayırmak istediğinde kullan."', '"Use this when you want fast audio extraction without re-encoding."'],
      ['"Videoyu bırak, sesi temiz ve hızlı biçimde dışa aktar."', '"Drop a video and export its audio quickly and cleanly."'],
      ['"Video dosyanı yerelde MP3, WAV veya orijinal ses akışına dönüştür. Dosyaların tarayıcı dışına çıkmaz."', '"Convert your local video file to MP3, WAV, or the original audio stream. Files never leave the browser."'],
      ['"Yerelde işlem"', '"Processed locally"'],
      ['"Sunucuya yükleme yok"', '"No server upload"'],
      ['"Hızlı başlangıç"', '"Quick start"'],
    ],
  ],
  [
    "audio-editor",
    [
      ['aria-label:"Ses dosyası yükle"', 'aria-label:"Upload audio file"'],
      ['"İşleniyor..."', '"Processing..."'],
      ['"Ses dosyasını buraya bırak"', '"Drop your audio file here"'],
      ['"MP3, WAV, M4A, OGG, FLAC ve diğer ses formatları"', '"MP3, WAV, M4A, OGG, FLAC and other audio formats"'],
      ['"Dosya Seç"', '"Choose File"'],
      ['"veya sürükle bırak"', '"or drag and drop"'],
      ['"Lütfen bir ses dosyası seç."', '"Please choose an audio file."'],
      ['"Ses dosyası okunamadı."', '"Audio file could not be read."'],
      ["`MP3'e dönüştürülüyor (${settings.mp3Bitrate} kbps)`", '`Converting to MP3 (${settings.mp3Bitrate} kbps)`'],
      ["`WAV'e dönüştürülüyor (${settings.wavBitDepth}-bit PCM)`", '`Converting to WAV (${settings.wavBitDepth}-bit PCM)`'],
      ['"Dönüştürme başarısız."', '"Conversion failed."'],
      ['"`WAV · ${settings.wavBitDepth}-bit PCM · Kayıpsız`"', '"`WAV · ${settings.wavBitDepth}-bit PCM · Lossless`"'],
      ['"Ses formatını dönüştür."', '"Convert audio format."'],
      ['"MP3 ve WAV arasında dönüşüm yap, kalite ya da bit derinliğini seçerek dosyayı dışa aktar."', '"Convert between MP3 and WAV, then export with your preferred quality or bit depth."'],
      ['children:"Başka Dosya"', 'children:"Another File"'],
      ['children:"Dönüştür"', 'children:"Convert"'],
      ['children:"Çıktı"', 'children:"Output"'],
      ['children:"Çıktı Formatı"', 'children:"Output Format"'],
      ['children:"Sıkıştırılmış · Küçük dosya"', 'children:"Compressed · Smaller file"'],
      ['children:"PCM · Kayıpsız"', 'children:"PCM · Lossless"'],
      ['children:"Bit Derinliği"', 'children:"Bit Depth"'],
      ['"CD kalitesi"', '"CD quality"'],
      ['"Stüdyo kalitesi"', '"Studio quality"'],
      ['"Ses dosyasını kes ve kırp."', '"Trim and cut your audio."'],
      ['"Dalga formu üzerinde başlangıç ve bitiş noktasını sürükle, istediğin bölümü tek tıkla dışa aktar."', '"Drag the waveform start and end points, then export the exact section you want in one click."'],
      ['"Seçim: "', '"Selection: "'],
      ['children:"Önizle"', 'children:"Preview"'],
      ['children:"Toplam Süre"', 'children:"Total Duration"'],
      ['children:"Seçim Süresi"', 'children:"Selection Duration"'],
      ['"Başlangıç ve bitiş noktalarını sürükle veya aşağıdaki alanlardan gir."', '"Drag the start and end points, or enter them below."'],
      ['children:"Başlangıç"', 'children:"Start"'],
      ['children:"Bitiş"', 'children:"End"'],
      ['"Seçim en az 0.1 saniye olmalı."', '"Selection must be at least 0.1 seconds."'],
      ['"Kesme işlemi başarısız."', '"Trimming failed."'],
      ['"Önizleme başlatılamadı."', '"Preview could not be started."'],
      ['"Ses dosyası yükle"', '"Upload audio file"'],
      ['"FFmpeg hazırlanıyor"', '"Preparing FFmpeg"'],
      ['"Lütfen bekleyin..."', '"Please wait..."'],
      ['"küçük"', '"smaller"'],
      ['"büyük"', '"larger"'],
      ['"Ses önizleme dalga formu"', '"Audio preview waveform"'],
      ['"FFmpeg henüz yüklenmedi."', '"FFmpeg is not loaded yet."'],
      ['"MP3\'e dönüştürülüyor ("', '"Converting to MP3 ("'],
      ['"WAV\'e dönüştürülüyor ("', '"Converting to WAV ("'],
      ['"Kayıpsız"', '"Lossless"'],
      ['"Yüksek"', '"High"'],
      ['" · Seçim: "', '" · Selection: "'],
      ['children:"Dalga Formu"', 'children:"Waveform"'],
      ['children:"Durdur"', 'children:"Stop"'],
      ['children:"Kes"', 'children:"Trim"'],
      ['children:"Kırp"', 'children:"Trim"'],
      ['children:"Kaynak"', 'children:"Source"'],
      ['children:"Ses seviyesini normalize et."', 'children:"Normalize your audio level."'],
      ['children:"Ses Seviyesi"', 'children:"Audio Level"'],
      ['children:"Ses seviyesi"', 'children:"Audio level"'],
      ['children:"Yeni Dosya"', 'children:"New File"'],
      ['children:"Yeni Video"', 'children:"New Video"'],
      ['children:"Normalize Et"', 'children:"Normalize"'],
      ['children:"Mod"', 'children:"Mode"'],
      ['children:"Hedef"', 'children:"Target"'],
      ['children:"Dengeli"', 'children:"Balanced"'],
      ['children:"Maksimum"', 'children:"Maximum"'],
      ['children:"Kesiliyor..."', 'children:"Trimming..."'],
      ['children:"Pik"', 'children:"Peak"'],
      ['desc:"Ses Seviyesi"', 'desc:"Audio Level"'],
      ['`Pik normalizasyonu (${r.targetDbFs} dBFS)`', '`Peak normalization (${r.targetDbFs} dBFS)`'],
      ['`Loudness normalizasyonu (${r.targetLufs} LUFS)`', '`Loudness normalization (${r.targetLufs} LUFS)`'],
      ['"Hedef LUFS: "', '"Target LUFS: "'],
      ['"Hedef Peak: "', '"Target Peak: "'],
      ['"Standart"', '"Standard"'],
      ['"Dengeli"', '"Balanced"'],
      ['"Maksimum"', '"Maximum"'],
      ['"Kesiliyor..."', '"Trimming..."'],
      ['"Ses seviyesini normalize et."', '"Normalize the audio level."'],
      ['"Pik veya loudness normalizasyonu ile ses seviyesini hedef değere getir. Yayın ve streaming işleri için -14 LUFS iyi bir başlangıç noktasıdır."', '"Bring your audio to a target level with peak or loudness normalization. For broadcast and streaming work, -14 LUFS is a good starting point."'],
      ['"Normalizasyon başarısız."', '"Normalization failed."'],
      ['children:"Normalizasyon Ayarları"', 'children:"Normalization Settings"'],
      ['children:"LUFS hedefine göre"', 'children:"Based on LUFS target"'],
      ['children:"Pik dBFS değerine göre"', 'children:"Based on peak dBFS"'],
      ['"Çok yüksek"', '"Very high"'],
      ['"Güvenli"', '"Safe"'],
      ['children:"Tamamlandı"', 'children:"Done"'],
      ['children:"Çıktı boyutu"', 'children:"Output size"'],
      ['children:"Boyut farkı"', 'children:"Size difference"'],
      ['children:"İndir"', 'children:"Download"'],
      ['children:"sn"', 'children:"sec"'],
      ['children:"Total Duration"', 'children:"TOTAL DURATION"'],
      ['children:"Selection Duration"', 'children:"SELECTION DURATION"'],
      ['"küçük"', '"smaller"'],
      ['"büyük"', '"larger"'],
      ['"Kes & Kırp"', '"Trim & Cut"'],
      ['"Format Dönüştür"', '"Format Convert"'],
    ],
  ],
  [
    "stem-splitter",
    [
      ['"Vocals ve instrumental stem\'lerini yerelde ayır."', '"Split vocals and instrumental stems locally."'],
      ['"Yerel worker gerçek model tabanlı `Demucs` akışını kullanır. İlk kurulumdan sonra model warm-up ile hazır tutulur, split işlemi cihazında çalışır."', '"The local worker runs a real `Demucs` model flow. After the first install, the model stays warmed up and splitting runs on your device."'],
      ['"Vocal Remover hazır değil"', '"Stem Splitter is not ready"'],
      ['"Bu araç local helper ile çalışır. Ses dosyan cihazında işlenir; server\'a yüklenmez."', '"This tool works with a local helper. Your audio is processed on-device and is not uploaded to a server."'],
      ['"Local helper kontrol ediliyor"', '"Checking local helper"'],
      ['"Cihazındaki stem engine aranıyor. Bu işlem birkaç saniye sürebilir."', '"Looking for the stem engine on your device. This may take a few seconds."'],
      ['"Python runtime hazır değil"', '"Python runtime is not ready"'],
      ['"Helper çalışıyor ama paketlenmiş veya yapılandırılmış Python runtime bulunamadı."', '"The helper is running, but the packaged or configured Python runtime could not be found."'],
      ['"FFmpeg runtime hazır değil"', '"FFmpeg runtime is not ready"'],
      ['"Helper çalışıyor ama ses işleme için gereken ffmpeg binary\'si bulunamadı."', '"The helper is running, but the ffmpeg binary required for audio processing could not be found."'],
      ['"Local helper çalışıyor ama hazır değil"', '"Local helper is running but not ready"'],
      ['"Model warm-up tamamlanamadı. Runtime path\'leri veya model kurulumu kontrol edilmeli."', '"Model warm-up could not complete. The runtime paths or model installation should be checked."'],
      ['"Model hazırlanıyor"', '"Preparing model"'],
      ['"İlk açılışta helper modeli ısıtıyor. Bu sırada track seçebilirsin; split hazır olduğunda başlayacak."', '"On first launch, the helper is warming up the model. You can pick a track now; splitting can start once it is ready."'],
      ['"Local helper hazır"', '"Local helper is ready"'],
      ['"Dosyan cihazında kalır, split işlemi local helper üzerinden yürür."', '"Your file stays on the device and the split runs through the local helper."'],
      ['"Kurulum tanısı bekleniyor"', '"Waiting for installation diagnostics"'],
      ['return"Hazır"', 'return"Ready"'],
      ['return"Isınıyor"', 'return"Warming up"'],
      ['return"Aranıyor"', 'return"Checking"'],
      ['return"Yok"', 'return"Offline"'],
      ['return"Hata"', 'return"Issue"'],
      ['"Model hazırlanıyor..."', '"Preparing model..."'],
      ['"Ses katmanları ayrılıyor..."', '"Separating audio stems..."'],
      ['"Stem dosyaları işleniyor..."', '"Processing stem files..."'],
      ['"Çıktılar hazırlanıyor..."', '"Preparing outputs..."'],
      ['"Beklenmeyen bir hata oluştu."', '"An unexpected error occurred."'],
      ['"Local helper erişilemedi. Helper kurulu değil, kapalı olabilir veya bu origin için izin verilmemiş olabilir."', '"The local helper could not be reached. It may not be installed, may be closed, or this origin may not be allowed."'],
      ['"İstek tamamlanamadı."', '"The request could not be completed."'],
      ['"Tarayıcı Web Audio API desteklemiyor."', '"This browser does not support the Web Audio API."'],
      ['"Track analiz ediliyor..."', '"Analyzing track..."'],
      ['"Stem separation çalışıyor..."', '"Stem separation is running..."'],
      ['"Model hazırlanıyor, track seçebilirsin"', '"The model is preparing, you can choose a track"'],
      ['"Audio dosyasını bırak"', '"Drop an audio file"'],
      ['"MP3, WAV, M4A, AAC, OGG veya FLAC yükleyebilirsin."', '"You can upload MP3, WAV, M4A, AAC, OGG, or FLAC files."'],
      ['"Dosya Seç"', '"Choose File"'],
      ['"helper hazır olunca split başlayabilir"', '"split can start once the helper is ready"'],
      ['"veya sürükle bırak"', '"or drag and drop"'],
      ['"İzinli origin\'ler"', '"Allowed origins"'],
      ['"macOS için indir"', '"Download for macOS"'],
      ['"Windows yakında"', '"Windows coming soon"'],
      ['"Tekrar Dene"', '"Try Again"'],
      ['"Track hazır, stem separation başlat."', '"Your track is ready, start stem separation."'],
      ['"Güvenli worker akışı dosyayı temp klasörde işler, `Demucs` ile iki stem üretir ve indirme sonrası otomatik temizler."', '"The secure worker flow processes the file in a temp directory, creates two stems with `Demucs`, and cleans up automatically after download."'],
      ['"süre"', '"duration"'],
      ['"kanal"', '"channels"'],
      ['"backend"', '"backend"'],
      ['"+ Yeni Track"', '"+ New Track"'],
      ['"Hazırlanıyor..."', '"Preparing..."'],
      ['"Warm-up Bekleniyor"', '"Waiting for warm-up"'],
      ['"Stem Ayır"', '"Split Stems"'],
      ['"İşleniyor"', '"Processing"'],
      ['"% tamamlandı"', '"% complete"'],
      ['"Track bilgisi"', '"Track info"'],
      ['"Boyut"', '"Size"'],
      ['"Süre"', '"Duration"'],
      ['"Format"', '"Format"'],
      ['"Engine"', '"Engine"'],
      ['"Helper"', '"Helper"'],
      ['"Warm-up"', '"Warm-up"'],
      ['"Çıktılar"', '"Outputs"'],
      ['"Stem dosyaları hazır."', '"Stem files are ready."'],
      ['"Stem separation henüz başlatılmadı."', '"Stem separation has not started yet."'],
      ['"Ayrılmış vokal stem\'i"', '"Separated vocal stem"'],
      ['"Vokalsiz stem çıktısı"', '"Instrumental stem output"'],
      ['children:"İndir"', 'children:"Download"'],
      ['"Yeni Başla"', '"Start Over"'],
      ['"Stem separation başarısız oldu."', '"Stem separation failed."'],
      ['"Stem separation başlatmak için local helper\'ın hazır olması gerekiyor."', '"The local helper must be ready before starting stem separation."'],
      ['"Stem separation başlatıldı."', '"Stem separation started."'],
      ['"Ses dosyası çözümlenemedi."', '"The audio file could not be decoded."'],
      ['"Bekleniyor"', '"Waiting"'],
      ['"İşlem birkaç saniye sürebilir."', '"This may take a few seconds."'],
    ],
  ],
  [
    "dev-toolkit",
    [
      ['"Web Crypto bu ortamda desteklenmiyor."', '"Web Crypto is not supported in this environment."'],
      ['toLocaleString("tr-TR")', 'toLocaleString("en-US")'],
      ['blurb:"Encode ve decode et."', 'blurb:"Encode and decode."'],
      ['DEFAULT_AES_TEXT="Bu metin yerelde AES-GCM ile şifrelenir."', 'DEFAULT_AES_TEXT="This text is encrypted locally with AES-GCM."'],
      ['"Merhaba miniapps"', '"Hello miniapps"'],
      ['children:"Kaynak JS"', 'children:"Source JS"'],
      ['children:"Base64 Kopyala"', 'children:"Copy Base64"'],
      ['children:"Algoritma"', 'children:"Algorithm"'],
      ['children:"Hex Kopyala"', 'children:"Copy Hex"'],
      ['children:"Payload Kopyala"', 'children:"Copy Payload"'],
      ['children:"Hash Kopyala"', 'children:"Copy Hash"'],
      ['children:"SQL Kopyala"', 'children:"Copy SQL"'],
      ['children:"Obfuscated JS"', 'children:"Obfuscated JS"'],
      ['const message = "Merhaba " + name;', 'const message = "Hello " + name;'],
      ['"JWT üç parçadan oluşmalı: header.payload.signature"', '"JWT must contain three parts: header.payload.signature"'],
      ['"JWT çözümlenemedi."', '"JWT could not be decoded."'],
      ['"Şifre alanı boş bırakılamaz."', '"Password field cannot be empty."'],
      ['"Payload biçimi geçersiz. Beklenen biçim: salt.iv.ciphertext"', '"Payload format is invalid. Expected format: salt.iv.ciphertext"'],
      ['"Şifre yanlış ya da payload bozuk."', '"Password is incorrect or payload is corrupted."'],
      ['blurb:"Header ve payload\'ı yerelde çöz."', 'blurb:"Decode header and payload locally."'],
      ['blurb:"SHA digest üret."', 'blurb:"Generate SHA digest."'],
      ['blurb:"Şifreyle encrypt / decrypt et."', 'blurb:"Encrypt / decrypt with a passphrase."'],
      ['blurb:"Hash üret ve doğrula."', 'blurb:"Generate and verify hashes."'],
      ['blurb:"JavaScript kodunu karmaşıklaştır."', 'blurb:"Obfuscate JavaScript code."'],
      ['blurb:"Sorguyu okunur biçimde düzenle."', 'blurb:"Format SQL into a readable layout."'],
      ['"JSON çözümlenemedi."', '"JSON could not be parsed."'],
      ['"JSON örneğinden tip çıkar."', '"Infer types from a JSON sample."'],
      ['"Base64 çözümlenemedi."', '"Base64 could not be decoded."'],
      ['"Base64 çıktısı"', '"Base64 output"'],
      ['"AES payload hazır."', '"AES payload ready."'],
      ['"Şifreleme tamamlanamadı."', '"Encryption could not be completed."'],
      ['"AES payload çözüldü."', '"AES payload decrypted."'],
      ['"AES payload çözülemedi."', '"AES payload could not be decrypted."'],
      ['"Bcrypt hash hazır."', '"Bcrypt hash ready."'],
      ['"Hash ile eşleşiyor."', '"Matches the hash."'],
      ['"Hash ile eşleşmiyor."', '"Does not match the hash."'],
      ['"Obfuscation tamamlandı."', '"Obfuscation completed."'],
      ['"Kod karmaşıklaştırılamadı."', '"Code could not be obfuscated."'],
      ['"Metin, token, şema ve sorgu işlemlerini tek panelde topla."', '"Collect text, token, schema, and query tools in one panel."'],
      ['"JSON örneğini parse edip kullanılabilir TS tiplerine çevirir."', '"Parses a JSON sample and converts it to usable TypeScript types."'],
      ['children:"Root type adı"', 'children:"Root type name"'],
      ['children:"TypeScript çıktısı"', 'children:"TypeScript output"'],
      ['"TypeScript çıktısı"', '"TypeScript output"'],
      ['children:"Çıktıyı Kopyala"', 'children:"Copy Output"'],
      ['"Token imzasını doğrulamaz; header ve payload\'ı tarayıcı içinde çözümler."', '"Does not verify the token signature; decodes the header and payload inside the browser."'],
      ['"Unicode destekli encode ve decode akışı."', '"Unicode-safe encode and decode flow."'],
      ['children:"Base64 çıktısı"', 'children:"Base64 output"'],
      ['children:"Düz metin"', 'children:"Plain text"'],
      ['"Web Crypto ile SHA tabanlı digest üretir."', '"Generates SHA-based digests with Web Crypto."'],
      ['"Passphrase tabanlı AES-GCM şifreleme ve çözme akışı."', '"Passphrase-based AES-GCM encrypt/decrypt flow."'],
      ['children:"Şifre"', 'children:"Password"'],
      ['"Hash üretir ve mevcut hash ile düz metni doğrular."', '"Generates hashes and verifies plain text against an existing hash."'],
      ['children:"Hash Üret"', 'children:"Generate Hash"'],
      ['children:"Doğrula"', 'children:"Verify"'],
      ['children:"Doğrulama input"', 'children:"Verification input"'],
      ['"Kaynak kodu yerelde karmaşıklaştırır; hızlı kopyalama için uygun çıktı üretir."', '"Obfuscates source code locally and produces output suitable for quick copying."'],
      ['"Sorguyu hızlı okunur hale getiren hafif bir yerel formatter."', '"A lightweight local formatter that makes SQL queries easier to read."'],
      ['children:"SQL çıktısı"', 'children:"SQL output"'],
      ['"SQL çıktısı"', '"SQL output"'],
      ['"Türkiye"', '"Turkey"'],
      ['"Comptoirs Français du Pacifique (CFP) Franc"', '"Comptoirs Francais du Pacifique (CFP) Franc"'],
    ],
  ],
]);

const enLocalizationCssTweaks = new Map([["qr-generator", [".customer-pill-row{display:none!important}"]]]);

function runBuild(cwd, script, outDir) {
  const env = {
    ...process.env,
    MINIAPPS_BASE: "./",
    MINIAPPS_OUT_DIR: outDir,
    VITE_MINIAPPS_WEB_DEPLOYMENT: "true",
    VITE_MINIAPPS_DISABLE_PDF_HELPER: "false",
  };

  if (path.basename(cwd) === "stem-splitter") {
    env.VITE_STEM_SPLITTER_HELPER_MAC_URL =
      process.env.VITE_STEM_SPLITTER_HELPER_MAC_URL ||
      "https://github.com/yemreatasayar/miniapps/releases/latest/download/stem-helper-macos.zip";
  }

  const result = spawnSync(npmCmd, ["run", script], {
    cwd,
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${path.basename(cwd)} build failed with exit code ${result.status ?? "unknown"}`);
  }
}

function runShellBuild(outDir) {
  const env = {
    ...process.env,
    MINIAPPS_BASE: "./",
    MINIAPPS_OUT_DIR: outDir,
    VITE_MINIAPPS_ENABLE_PWA: "true",
    VITE_MINIAPPS_WEB_DEPLOYMENT: "true",
    VITE_MINIAPPS_DISABLE_PDF_HELPER: "false",
  };

  const result = spawnSync(npmCmd, ["run", "build:distribution"], {
    cwd: path.join(repoRoot, "miniapps"),
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`miniapps shell build failed with exit code ${result.status ?? "unknown"}`);
  }
}

function collectFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

function toWebPath(filePath) {
  return path.relative(outputRoot, filePath).split(path.sep).join("/");
}

function build404Html() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#060606" />
    <meta name="robots" content="noindex, follow" />
    <title>404: miniapps</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Montserrat", "Inter", system-ui, sans-serif;
        color: #111111;
        background: #efefef;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        text-align: center;
        background:
          radial-gradient(circle at top, rgba(0,0,0,0.06), transparent 35%),
          linear-gradient(180deg, #f3f3f3 0%, #e9e9e9 100%);
      }

      h1 {
        font-size: 30vh;
        font-weight: 800;
        line-height: 1;
        color: #111;
        margin: 0;
        letter-spacing: -0.04em;
      }

      p {
        margin: 16px 0 28px;
        font-size: clamp(16px, 2vw, 22px);
        font-weight: 600;
        color: #111;
      }

      a {
        display: inline-block;
        padding: 10px 20px;
        background: #111;
        color: #fff;
        border-radius: 10px;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
      }

      a:hover { background: #333; }
    </style>
  </head>
  <body>
    <h1>404</h1>
    <p>Page not found</p>
    <a href="/">Go to miniapps</a>
  </body>
</html>
`;
}

function buildOfflineFallbackHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#060606" />
    <title>miniapps offline</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Montserrat", "Inter", system-ui, sans-serif;
        color: #111111;
        background: #efefef;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top, rgba(0, 0, 0, 0.06), transparent 35%),
          linear-gradient(180deg, #f3f3f3 0%, #e9e9e9 100%);
      }

      main {
        width: min(100%, 520px);
        padding: 28px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.08);
      }

      h1 {
        margin: 0 0 10px;
        font-size: 30px;
        line-height: 1;
      }

      p {
        margin: 0;
        color: #4d4d4d;
        line-height: 1.6;
        font-size: 15px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Offline for now</h1>
      <p>This miniapp has not been opened on this device yet, so the required files are not cached. Open it once while online, then it will be available again without a connection.</p>
    </main>
  </body>
</html>
`;
}

function buildManifest() {
  return {
    name: "miniapps",
    short_name: "miniapps",
    start_url: "./",
    scope: "./",
    display: "standalone",
    theme_color: "#060606",
    background_color: "#efefef",
    icons: [
      {
        src: "./assets/miniapps-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "./assets/miniapps-icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

function injectSeoMeta(htmlPath, { title, description, lang, canonicalUrl }) {
  if (!existsSync(htmlPath)) return;
  let html = readFileSync(htmlPath, "utf8");

  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const ogImage = `${SITE_BASE_URL}/assets/miniapps-og-card.png`;

  html = html.replace(/(<html\b[^>]*\blang=")[^"]*(")/i, `$1${lang}$2`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`);

  const canonical = canonicalUrl ?? "";
  const appName = title.split(":")[0].trim();
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    ...(canonical ? { "@id": `${canonical}#webapplication` } : {}),
    "name": appName,
    "url": canonical,
    "description": description,
    "applicationCategory": "UtilitiesApplication",
    "operatingSystem": "Web Browser",
    "inLanguage": lang,
    "isPartOf": { "@id": `${SITE_BASE_URL}/#webapplication` },
    "creator": { "@type": "Person", "name": "Yusuf Emre Atasayar", "url": "https://yemreatasayar.com" },
    "author": { "@type": "Person", "name": "Yusuf Emre Atasayar", "url": "https://yemreatasayar.com" },
    "image": ogImage,
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD", "availability": "https://schema.org/InStock" },
  });

  // English pages are generated from TR builds first; remove stale structured data
  // before injecting the language-specific JSON-LD block below.
  html = html.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");

  if (html.includes('name="description"')) {
    html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${d}">`);
  } else {
    const metaBlock = [
      `<meta name="description" content="${d}">`,
      `<meta property="og:site_name" content="miniapps">`,
      `<meta property="og:title" content="${t}">`,
      `<meta property="og:description" content="${d}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:image" content="${ogImage}">`,
      ...(canonical ? [`<meta property="og:url" content="${canonical}">`, `<link rel="canonical" href="${canonical}">`] : []),
      `<meta name="robots" content="index, follow">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${t}">`,
      `<meta name="twitter:description" content="${d}">`,
      `<meta name="twitter:image" content="${ogImage}">`,
      `<script type="application/ld+json">${jsonLd}</script>`,
    ].join("\n    ");
    html = html.replace("</head>", `    ${metaBlock}\n  </head>`);
  }

  if (canonical && !html.includes('rel="canonical"')) {
    html = html.replace("</head>", `    <link rel="canonical" href="${canonical}">\n  </head>`);
  }
  if (canonical && !html.includes('"og:url"')) {
    html = html.replace("</head>", `    <meta property="og:url" content="${canonical}">\n  </head>`);
  }
  if (!html.includes('ld+json')) {
    html = html.replace("</head>", `    <script type="application/ld+json">${jsonLd}</script>\n  </head>`);
  }

  if (html.includes('property="og:title"')) {
    html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${t}">`);
  }
  if (html.includes('property="og:description"')) {
    html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${d}">`);
  }
  if (html.includes('name="twitter:title"')) {
    html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${t}">`);
  }
  if (html.includes('name="twitter:description"')) {
    html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${d}">`);
  }

  if (html.includes("<noscript>")) {
    html = html.replace(/<noscript>[\s\S]*?<\/noscript>/, `<noscript><h1>${t}</h1><p>${d}</p></noscript>`);
  } else {
    html = html.replace("</body>", `  <noscript><h1>${t}</h1><p>${d}</p></noscript>\n  </body>`);
  }

  if (!html.includes("googletagmanager.com/gtag/js")) {
    html = html.replace("</head>", `    ${analyticsSnippet}\n  </head>`);
  }

  writeFileSync(htmlPath, html);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildManifestoPageHtml(language) {
  const copy = manifestoContent[language];
  const packLine = `${distributionConfig.packLabel} ${distributionConfig.packVersion}`;
  const authorLine = distributionConfig.authorLabel;
  const trHref = "../manifesto/";
  const enHref = "../manifesto-en/";

  const sectionsMarkup = copy.sections
    .map((section) => {
      const paragraphsMarkup = (section.paragraphs ?? [])
        .map((paragraph) => `<p>${renderManifestoInline(paragraph)}</p>`)
        .join("\n");

      const principlesMarkup = (section.principles ?? [])
        .map(
          (item) => `<div class="manifesto-principle">
                <h3>${escapeHtml(item.title)}</h3>
                <p>${renderManifestoInline(item.body)}</p>
              </div>`
        )
        .join("\n");

      const listMarkup =
        section.listItems && section.listItems.length
          ? `<div class="manifesto-list-block">
              ${section.listIntro ? `<p class="manifesto-list-intro">${renderManifestoInline(section.listIntro)}</p>` : ""}
              <ul class="manifesto-list">
                ${section.listItems.map((item) => `<li>${renderManifestoInline(item)}</li>`).join("\n")}
              </ul>
            </div>`
          : "";

      return `<section class="manifesto-section">
            <h2>${escapeHtml(section.heading)}</h2>
            ${paragraphsMarkup}
            ${principlesMarkup ? `<div class="manifesto-principles">${principlesMarkup}</div>` : ""}
            ${listMarkup}
          </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="${copy.lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#060606" />
    <link rel="icon" type="image/svg+xml" href="../assets/miniapps-icon.svg" />
    <title>miniapps manifesto</title>
    ${analyticsSnippet}
    <style>
      :root {
        color-scheme: light;
        font-family: "Montserrat", "Inter", system-ui, sans-serif;
        color: #111111;
        background: #efefef;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        min-height: 100%;
      }

      body {
        min-height: 100vh;
        background:
          radial-gradient(circle at top, rgba(0, 0, 0, 0.06), transparent 28%),
          linear-gradient(180deg, #f3f3f3 0%, #ececec 100%);
        color: #111111;
      }

      a {
        color: inherit;
      }

      .manifesto-shell {
        min-height: 100vh;
        padding: 30px 28px 140px;
      }

      .manifesto-card {
        width: min(100%, 940px);
        margin: 0 auto;
        border-radius: 36px;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(17, 17, 17, 0.06);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.08);
        padding: 40px 44px 44px;
      }

      .manifesto-section + .manifesto-section {
        margin-top: 34px;
        padding-top: 34px;
        border-top: 1px solid rgba(17, 17, 17, 0.08);
      }

      .manifesto-section h2 {
        margin: 0 0 16px;
        font-size: clamp(24px, 5vw, 34px);
        line-height: 1;
        letter-spacing: -0.05em;
        text-transform: lowercase;
      }

      .manifesto-section p,
      .manifesto-list li {
        margin: 0;
        color: #333333;
        font-size: 18px;
        line-height: 1.75;
      }

      .manifesto-section p + p {
        margin-top: 14px;
      }

      .manifesto-principles {
        display: grid;
        gap: 18px;
      }

      .manifesto-principle h3 {
        margin: 0 0 6px;
        font-size: 20px;
        line-height: 1.1;
        letter-spacing: -0.03em;
        text-transform: lowercase;
      }

      .manifesto-list-block {
        display: grid;
        gap: 12px;
      }

      .manifesto-list-intro {
        font-weight: 700;
        color: #111111;
      }

      .manifesto-list {
        margin: 0;
        padding-left: 24px;
        display: grid;
        gap: 10px;
      }

      :root {
        --distribution-footer-height: 104px;
      }

      .distribution-header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 20px;
        padding: 20px 28px;
        background: #060606;
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        min-height: var(--distribution-footer-height);
      }

      .distribution-brand {
        display: flex;
        align-items: center;
        justify-content: flex-start;
      }

      .distribution-brand .brand-logo {
        width: min(100%, 176px);
        height: auto;
        display: block;
      }

      .distribution-version {
        display: grid;
        justify-items: center;
        gap: 2px;
        color: rgba(255, 255, 255, 0.72);
        text-align: center;
      }

      .distribution-version span:first-child {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }

      .distribution-author-link {
        color: rgba(255, 255, 255, 0.56);
        text-decoration: none;
        font-size: 12px;
        font-weight: 500;
      }

      .distribution-author-link:hover {
        color: rgba(255, 255, 255, 0.56);
      }

      .distribution-controls {
        justify-self: end;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .distribution-language-group {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px;
        border-radius: 999px;
        background: #232323;
      }

      .distribution-link-button {
        min-height: 40px;
        padding: 0 16px;
        border-radius: 999px;
        background: #232323;
        color: rgba(255, 255, 255, 0.84);
        text-decoration: none;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.01em;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 140ms ease, color 140ms ease, transform 140ms ease;
      }

      .distribution-link-button:hover,
      .distribution-link-button:focus-visible {
        background: #2f2f2f;
        color: #ffffff;
        transform: translateY(-1px);
      }

      .language-switch-button {
        min-width: 68px;
        min-height: 40px;
        padding: 0 16px;
        border-radius: 999px;
        background: transparent;
        color: rgba(255, 255, 255, 0.68);
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.01em;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 140ms ease, color 140ms ease, transform 140ms ease;
      }

      .language-switch-button:hover {
        transform: translateY(-1px);
      }

      .language-switch-button.is-active {
        background: #f5f5f5;
        color: #111111;
      }

      @media (max-width: 980px) {
        :root {
          --distribution-footer-height: 148px;
        }

        .distribution-header {
          grid-template-columns: 1fr auto;
          align-items: center;
          grid-template-areas:
            "brand version"
            "controls controls";
          gap: 14px 18px;
          padding: 18px 20px;
        }

        .distribution-brand {
          grid-area: brand;
          justify-self: start;
        }

        .distribution-version {
          grid-area: version;
          justify-self: end;
          justify-items: end;
          text-align: right;
        }

        .distribution-controls {
          grid-area: controls;
          justify-self: stretch;
          width: 100%;
          justify-content: center;
          flex-wrap: wrap;
        }
      }

      @media (max-width: 760px) {
        :root {
          --distribution-footer-height: 96px;
        }

        .manifesto-shell {
          padding: 20px 16px 132px;
        }

        .manifesto-card {
          padding: 28px 22px 30px;
          border-radius: 28px;
        }

        .manifesto-section p,
        .manifesto-list li {
          font-size: 16px;
        }

        .distribution-version {
          display: none;
        }

        /* Sürüm metni gizli: footer'ı tek sütuna indir, logoyu ortala (controls altta, ortalı). */
        .distribution-header {
          grid-template-columns: 1fr;
          grid-template-areas:
            "brand"
            "controls";
        }

        .distribution-brand {
          justify-self: center;
          justify-content: center;
        }

        .distribution-link-button {
          min-height: 34px;
          padding: 0 12px;
          font-size: 13px;
        }

        .language-switch-button {
          min-width: 54px;
          min-height: 34px;
          padding: 0 10px;
          font-size: 13px;
        }

        .distribution-language-group {
          gap: 4px;
          padding: 4px;
        }
      }

      @media (max-width: 560px) {
        :root {
          --distribution-footer-height: 122px;
        }

        .manifesto-shell {
          padding: 20px 16px 158px;
        }

        .distribution-header {
          grid-template-columns: 1fr;
          grid-template-areas:
            "brand"
            "controls";
          justify-items: stretch;
          text-align: left;
          padding: 16px;
        }

        .distribution-brand {
          justify-self: center;
          justify-content: center;
          width: 100%;
        }

        .distribution-controls {
          justify-self: center;
          flex-wrap: wrap;
          justify-content: center;
          width: auto;
          max-width: 100%;
          gap: 10px;
        }

        .language-switch-button {
          min-width: 54px;
        }

        .distribution-link-button {
          min-width: 120px;
        }

        .distribution-language-group {
          width: auto;
          max-width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main class="manifesto-shell">
      <article class="manifesto-card">
        ${sectionsMarkup}
      </article>
    </main>
    <footer class="distribution-header">
      <a class="distribution-brand" href="../">
        <img class="brand-logo" src="../assets/miniapps-logo.svg" alt="miniapps" />
      </a>
      <div class="distribution-version">
        <span>${escapeHtml(packLine)}</span>
        <a class="distribution-author-link" href="https://yemreatasayar.com/" target="_blank" rel="noreferrer">${escapeHtml(authorLine)}</a>
      </div>
      <div class="distribution-controls">
        <a class="distribution-link-button" href="../">${escapeHtml(copy.homeLabel)}</a>
        <div class="distribution-language-group">
          <a class="language-switch-button ${language === "tr" ? "is-active" : ""}" href="${trHref}">TR</a>
          <a class="language-switch-button ${language === "en" ? "is-active" : ""}" href="${enHref}">ENG</a>
        </div>
      </div>
    </footer>
  </body>
</html>
`;
}

function buildServiceWorker({ version, shellPrecacheUrls, appEntryUrls }) {
  // Apps that require SharedArrayBuffer (FFmpeg WASM multi-threaded) → need COOP/COEP headers.
  // GitHub Pages cannot set HTTP headers, so the SW injects them for these specific apps.
  // Using require-corp (not credentialless) because these apps load no cross-origin resources.
  // NOTE: video-compressor uses @ffmpeg/core (single-threaded): does NOT need COOP/COEP.
  const crossOriginIsolatedEntryUrls = [
    "./apps/audio-editor/",
    "./apps-en/audio-editor/",
    "./apps/video-to-audio/",
    "./apps-en/video-to-audio/",
  ];

  return `const CACHE_VERSION = ${JSON.stringify(version)};
const CACHE_PREFIX = "miniapps-github-pages";
const SHELL_CACHE = \`\${CACHE_PREFIX}-shell-\${CACHE_VERSION}\`;
const APP_CACHE = \`\${CACHE_PREFIX}-apps-\${CACHE_VERSION}\`;
const RUNTIME_CACHE = \`\${CACHE_PREFIX}-runtime-\${CACHE_VERSION}\`;
const OFFLINE_FALLBACK_URL = "./offline.html";
const SHELL_PRECACHE_URLS = ${JSON.stringify(shellPrecacheUrls, null, 2)};
const APP_ENTRY_URLS = ${JSON.stringify(appEntryUrls, null, 2)};
const CROSS_ORIGIN_ISOLATED_ENTRY_URLS = ${JSON.stringify(crossOriginIsolatedEntryUrls, null, 2)};

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isAppRequest(url) {
  return APP_ENTRY_URLS.some((entryUrl) => url.pathname.startsWith(new URL(entryUrl, self.registration.scope).pathname));
}

function isCrossOriginIsolatedApp(url) {
  return CROSS_ORIGIN_ISOLATED_ENTRY_URLS.some(
    (entryUrl) => url.pathname.startsWith(new URL(entryUrl, self.registration.scope).pathname)
  );
}

function isExcludedRuntimeRequest(url) {
  return url.pathname.includes("/downloads/");
}

function addCrossOriginIsolationHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function navigationNetworkFirst(request, cacheName, isolate) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return isolate ? addCrossOriginIsolationHeaders(response) : response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      return isolate ? addCrossOriginIsolationHeaders(cached) : cached;
    }

    const fallback = await caches.match(OFFLINE_FALLBACK_URL, { ignoreSearch: true });
    if (fallback) {
      return fallback;
    }
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keepCaches = new Set([SHELL_CACHE, APP_CACHE, RUNTIME_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !keepCaches.has(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
      // SW just activated: notify open windows so they can reload to pick up
      // COOP/COEP headers (needed for FFmpeg WASM on audio-editor/video-to-audio).
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.postMessage({ type: "SW_ACTIVATED" });
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url) || url.pathname.endsWith("/service-worker.js")) {
    return;
  }

  if (isExcludedRuntimeRequest(url)) {
    return;
  }

  if (isNavigationRequest(request)) {
    const isolate = isCrossOriginIsolatedApp(url);
    event.respondWith(navigationNetworkFirst(request, isAppRequest(url) ? APP_CACHE : SHELL_CACHE, isolate));
    return;
  }

  if (isAppRequest(url)) {
    event.respondWith(cacheFirst(request, APP_CACHE));
    return;
  }

  event.respondWith(cacheFirst(request, RUNTIME_CACHE));
});
`;
}

function removeMacMetadata(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      removeMacMetadata(fullPath);
      continue;
    }
    if (entry === ".DS_Store") {
      rmSync(fullPath, { force: true });
    }
  }
}

function hardenFfmpegWorkerFallbacks(siteRoot) {
  const workerFiles = collectFiles(siteRoot).filter((filePath) => /\/apps(?:-en)?\/(?:audio-editor|video-to-audio|video-compressor)\/assets\/worker-.*\.js$/.test(filePath));
  const fallbackUrlPattern = /const ([A-Za-z_$][\w$]*)="https:\/\/unpkg\.com\/@ffmpeg\/core@0\.12\.9\/dist\/umd\/ffmpeg-core\.js";/;
  const fallbackLogicPattern =
    /try\{([A-Za-z_$][\w$]*)\|\|\(\1=([A-Za-z_$][\w$]*)\),importScripts\(\1\)\}catch\{if\(\(!\1\|\|\1===\2\)&&\(\1=\2\.replace\("\/umd\/","\/esm\/"\)\),self\.createFFmpegCore=\(await import\(\1\)\)\.default,!self\.createFFmpegCore\)throw ([A-Za-z_$][\w$]*)\}/;

  for (const workerFile of workerFiles) {
    const source = readFileSync(workerFile, "utf8");
    let updated = source;

    updated = updated.replace(fallbackUrlPattern, 'const $1="__MINIAPPS_LOCAL_FFMPEG_REQUIRED__";');
    updated = updated.replace(
      fallbackLogicPattern,
      'try{if(!$1)throw new Error("Local FFmpeg core URL is required.");importScripts($1)}catch{if(!$1)throw new Error("Local FFmpeg core URL is required.");self.createFFmpegCore=(await import($1)).default;if(!self.createFFmpegCore)throw $3}',
    );

    if (updated !== source) {
      writeFileSync(workerFile, updated);
    }
  }
}

function replaceAllTracked(content, replacements) {
  let next = content;

  for (const [from, to] of replacements) {
    next = next.split(from).join(to);
  }

  return next;
}

function normalizeLegacyEnglishAppFiles(appRoot) {
  for (const filePath of collectFiles(appRoot)) {
    if (
      !filePath.endsWith(".html") &&
      !filePath.endsWith(".js") &&
      !filePath.endsWith(".css") &&
      !filePath.endsWith(".mjs")
    ) {
      continue;
    }

    const original = readFileSync(filePath, "utf8");
    let updated = original;

    updated = updated
      .split('"/assets/')
      .join('"./assets/')
      .split("'/assets/")
      .join("'./assets/")
      .split('"/ffmpeg/')
      .join('"./ffmpeg/')
      .split("'/ffmpeg/")
      .join("'./ffmpeg/")
      .split('new URL("/assets/')
      .join('new URL("./assets/')
      .split('new URL("/ffmpeg/')
      .join('new URL("./ffmpeg/')
      .replace('<html lang="tr">', '<html lang="en">');

    if (updated !== original) {
      writeFileSync(filePath, updated);
    }
  }
}

function overlayLegacyEnglishBuilds(siteRoot) {
  if (!existsSync(legacyEnglishBuildRoot)) {
    return;
  }

  const enAppsRoot = path.join(siteRoot, "apps-en");
  for (const appId of distributionConfig.visibleAppIds) {
    const legacyAppRoot = path.join(legacyEnglishBuildRoot, appId);
    if (!existsSync(legacyAppRoot)) {
      continue;
    }

    const targetAppRoot = path.join(enAppsRoot, appId);
    rmSync(targetAppRoot, { recursive: true, force: true });
    cpSync(legacyAppRoot, targetAppRoot, { recursive: true });
    normalizeLegacyEnglishAppFiles(targetAppRoot);
  }
}

const MINIAPPS_FOOTER_STYLE = `.miniapps-footer{display:flex;justify-content:center;padding:24px 0;opacity:.35;transition:opacity .2s}.miniapps-footer:hover{opacity:.7}.miniapps-footer-logo{height:36px;width:auto;display:block}`;
const LIGHT_LOGO_APPS = new Set(["pdf-toolkit"]);

function addMiniappsLogoToLegacyEnApps(trAppsRoot, enAppsRoot) {
  for (const appId of distributionConfig.visibleAppIds) {
    const logoVariant = LIGHT_LOGO_APPS.has(appId) ? "light" : "dark";
    const logoFileName = `miniapps-logo-${logoVariant}.svg`;
    const enLogoPath = path.join(enAppsRoot, appId, "assets", logoFileName);

    if (existsSync(enLogoPath)) {
      continue; // Non-legacy app: React footer already handles the logo
    }

    const trLogoPath = path.join(trAppsRoot, appId, "assets", logoFileName);
    if (existsSync(trLogoPath)) {
      cpSync(trLogoPath, enLogoPath);
    }

    const htmlPath = path.join(enAppsRoot, appId, "index.html");
    if (!existsSync(htmlPath)) continue;

    let html = readFileSync(htmlPath, "utf8");
    if (html.includes("miniapps-footer")) continue;

    const footerHtml = `<style>${MINIAPPS_FOOTER_STYLE}</style><div class="miniapps-footer"><a href="https://miniapps.tr" aria-label="miniapps.tr"><img src="./assets/${logoFileName}" alt="miniapps.tr" class="miniapps-footer-logo"/></a></div>`;
    html = html.replace("</body>", `${footerHtml}</body>`);
    writeFileSync(htmlPath, html);
  }
}

const postOverlayTextFixes = new Map([
  [
    "pdf-toolkit",
    [
      ["PDF'ini buraya sürükle veya tıkla", "Drop your PDF here or click"],
    ],
  ],
]);

function applyPostOverlayTextFixes(enAppsRoot) {
  for (const [appId, fixes] of postOverlayTextFixes) {
    const appRoot = path.join(enAppsRoot, appId);
    if (!existsSync(appRoot)) continue;

    for (const filePath of collectFiles(appRoot)) {
      if (!filePath.endsWith(".js")) continue;

      const original = readFileSync(filePath, "utf8");
      let updated = original;
      for (const [from, to] of fixes) {
        updated = updated.split(from).join(to);
      }
      if (updated !== original) {
        writeFileSync(filePath, updated);
      }
    }
  }
}

function buildEnglishAppCopies(siteRoot) {
  const trAppsRoot = path.join(siteRoot, "apps");
  const enAppsRoot = path.join(siteRoot, "apps-en");

  rmSync(enAppsRoot, { recursive: true, force: true });
  cpSync(trAppsRoot, enAppsRoot, { recursive: true });

  for (const [appId, replacements] of enLocalizationReplacements) {
    const appRoot = path.join(enAppsRoot, appId);
    if (!existsSync(appRoot)) {
      continue;
    }

    for (const filePath of collectFiles(appRoot)) {
      if (!filePath.endsWith(".js") && !filePath.endsWith(".css")) {
        continue;
      }

      const original = readFileSync(filePath, "utf8");
      const updated = replaceAllTracked(original, replacements);
      if (updated !== original) {
        writeFileSync(filePath, updated);
      }
    }

    const cssTweaks = enLocalizationCssTweaks.get(appId) ?? [];
    for (const cssFile of collectFiles(appRoot).filter((filePath) => filePath.endsWith(".css"))) {
      const original = readFileSync(cssFile, "utf8");
      let updated = original;
      for (const tweak of cssTweaks) {
        if (!updated.includes(tweak)) {
          updated = `${updated}${tweak}`;
        }
      }
      if (updated !== original) {
        writeFileSync(cssFile, updated);
      }
    }
  }

  overlayLegacyEnglishBuilds(siteRoot);
  addMiniappsLogoToLegacyEnApps(trAppsRoot, enAppsRoot);
  applyPostOverlayTextFixes(enAppsRoot);

  for (const [appId, meta] of seoMeta) {
    const htmlPath = path.join(enAppsRoot, appId, "index.html");
    injectSeoMeta(htmlPath, { ...meta.en, lang: "en", canonicalUrl: `${SITE_BASE_URL}/apps-en/${appId}/` });
  }
}


rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(path.join(outputRoot, "apps"), { recursive: true });

runShellBuild(outputRoot);

const shellHtmlPath = path.join(outputRoot, "distribution.html");
if (existsSync(shellHtmlPath)) {
  renameSync(shellHtmlPath, path.join(outputRoot, "index.html"));
}

for (const app of apps) {
  runBuild(path.join(repoRoot, app.dir), app.script, path.join(outputRoot, "apps", app.id));
  const meta = seoMeta.get(app.id);
  if (meta) {
    injectSeoMeta(path.join(outputRoot, "apps", app.id, "index.html"), { ...meta.tr, lang: "tr", canonicalUrl: `${SITE_BASE_URL}/apps/${app.id}/` });
  }
}

writeFileSync(path.join(outputRoot, "distribution-config.json"), `${JSON.stringify(distributionConfig, null, 2)}\n`);
writeFileSync(path.join(outputRoot, "manifest.webmanifest"), `${JSON.stringify(buildManifest(), null, 2)}\n`);
writeFileSync(path.join(outputRoot, "offline.html"), buildOfflineFallbackHtml());
writeFileSync(path.join(outputRoot, "404.html"), build404Html());
mkdirSync(path.join(outputRoot, "manifesto"), { recursive: true });
writeFileSync(path.join(outputRoot, "manifesto", "index.html"), buildManifestoPageHtml("tr"));
mkdirSync(path.join(outputRoot, "manifesto-en"), { recursive: true });
writeFileSync(path.join(outputRoot, "manifesto-en", "index.html"), buildManifestoPageHtml("en"));

const rootFiles = collectFiles(outputRoot)
  .map((filePath) => toWebPath(filePath))
  .filter(
    (relativePath) =>
      !relativePath.startsWith("apps/") &&
      !relativePath.startsWith("downloads/") &&
      relativePath !== ".nojekyll" &&
      relativePath !== "manifest.webmanifest" &&
      relativePath !== "offline.html" &&
      relativePath !== "service-worker.js"
  );

const shellPrecacheUrls = [
  "./",
  "./index.html",
  "./distribution-config.json",
  "./manifest.webmanifest",
  "./offline.html",
  ...rootFiles.map((relativePath) => `./${relativePath}`),
];

const uniqueShellPrecacheUrls = [...new Set(shellPrecacheUrls)];
buildEnglishAppCopies(outputRoot);
const appEntryUrls = distributionConfig.visibleAppIds.flatMap((appId) => [`./apps/${appId}/`, `./apps-en/${appId}/`]);
writeFileSync(
  path.join(outputRoot, "service-worker.js"),
  buildServiceWorker({
    version: new Date().toISOString().replaceAll(/[^0-9TZ]/g, "").toLowerCase(),
    shellPrecacheUrls: uniqueShellPrecacheUrls,
    appEntryUrls,
  })
);
hardenFfmpegWorkerFallbacks(outputRoot);
writeFileSync(path.join(outputRoot, ".nojekyll"), "");
removeMacMetadata(outputRoot);

const sitemapUrls = [
  `${SITE_BASE_URL}/`,
  `${SITE_BASE_URL}/manifesto/`,
  `${SITE_BASE_URL}/manifesto-en/`,
  ...distributionConfig.visibleAppIds.flatMap((id) => [
    `${SITE_BASE_URL}/apps/${id}/`,
    `${SITE_BASE_URL}/apps-en/${id}/`,
  ]),
];
const today = new Date().toISOString().slice(0, 10);
const sitemapXml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sitemapUrls.map(
    (url) => `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`
  ),
  "</urlset>",
].join("\n");
writeFileSync(path.join(outputRoot, "sitemap.xml"), sitemapXml + "\n");

writeFileSync(
  path.join(outputRoot, "robots.txt"),
  `User-agent: *\nAllow: /\nSitemap: ${SITE_BASE_URL}/sitemap.xml\n`
);

const llmsAppList = distributionConfig.visibleAppIds.map((id) => {
  const en = seoMeta.get(id)?.en;
  const appTitle = en ? en.title.split(":")[0].trim() : id;
  return `- [${appTitle}](${SITE_BASE_URL}/apps/${id}/)`;
}).join("\n");

const llmsTxt = `# miniapps

> miniapps is a free collection of browser-based utilities for quick everyday digital tasks such as QR code generation, PDF editing, image resizing, image compression and file conversion.

## Product

miniapps brings small but useful digital tools together in one simple, fast and accessible browser-based platform. The product focuses on quick utility workflows, clean interfaces and practical everyday tasks without unnecessary complexity.

## Main Use Cases

- QR code generation
- PDF editing and compression
- Image resizing and compression
- Image format conversion (JPG, PNG, WebP, HEIC)
- Background removal with AI
- Video to audio conversion
- Audio editing and trimming
- Stem splitting (vocal and instrument separation)
- EXIF metadata cleaning
- CSV file editing
- Video compression
- Developer tools (JSON formatter, Base64, JWT decoder)

## Key Features

- Free browser-based tools
- Simple and fast interfaces
- No unnecessary complexity
- Local-first workflow where possible
- No account or sign-up required
- Privacy-focused: files stay on your device

## Audience

miniapps is designed for designers, developers, students, content creators and everyday users who need quick digital tools without complex software.

## Important Pages

- [Home](${SITE_BASE_URL}/)
${llmsAppList}

## Creator

miniapps was created by Yusuf Emre Atasayar, an art director and graphic designer working across digital tools, visual systems and AI-assisted product building.
`;
writeFileSync(path.join(outputRoot, "llms.txt"), llmsTxt);

console.log(`\nGitHub Pages bundle ready at ${outputRoot}`);
