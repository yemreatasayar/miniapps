import fs from "node:fs";
import path from "node:path";

const repoRoot = "/Users/yusufemreatasayar/miniapps";
const enRoot = path.join(repoRoot, "distribution", "miniapps-portable-en");
const reportFile = path.join(repoRoot, "distribution", "en-localization-audit.json");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAllTracked(content, file, replacements, missing) {
  let next = content;

  for (const [from, to] of replacements) {
    if (!next.includes(from)) {
      missing.push({ file, from });
      continue;
    }

    next = next.split(from).join(to);
  }

  return next;
}

const fileReplacements = new Map([
  [
    path.join(enRoot, "build", "pdf-toolkit", "assets", "index-Dd-GPBTW.js"),
    [
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
    path.join(enRoot, "build", "csv-toolkit", "assets", "index-DoTx5pW7.js"),
    [
      ['children:"Yeni Dosya"', 'children:"New File"'],
      ['["clean","Temizle"]', '["clean","Clean"]'],
      ['label:"Windows-1254 (Turkish Excel)"', 'label:"Windows-1254"'],
      ['"For Turkish Excel outputs, `Windows-1254` is usually the safest choice."', '""'],
    ],
  ],
  [
    path.join(enRoot, "build", "qr-generator", "assets", "index-CdMg6iuy.js"),
    [
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
      ['return{url:"Link",wifi:"Wi-Fi",vcard:"vCard",whatsapp:"WhatsApp",email:"Email",phone:"Telefon",location:"Location",text:"Metin"}[e]', 'return{url:"Link",wifi:"Wi-Fi",vcard:"vCard",whatsapp:"WhatsApp",email:"Email",phone:"Phone",location:"Location",text:"Text"}[e]'],
      ['url:{url:"https://www.mmo.org.tr"}', 'url:{url:"https://example.com"}'],
      ['wifi:{ssid:"MMO-Guest",password:"",security:"WPA",hidden:!1}', 'wifi:{ssid:"Guest Wi-Fi",password:"",security:"WPA",hidden:!1}'],
      ['vcard:{firstName:"Yusuf Emre",lastName:"Atasayar",company:"miniapps",title:"Kurucu",phone:"+905551112233",email:"hello@example.com",website:"https://example.com",address:"Istanbul, Turkey",note:"Quick contact card via QR"}', 'vcard:{firstName:"Alex",lastName:"Morgan",company:"Example Co",title:"Founder",phone:"+12025550123",email:"hello@example.com",website:"https://example.com",address:"London, UK",note:"Quick contact card via QR"}'],
      ['phone:{phone:"+902122223344"}', 'phone:{phone:"+12025550123"}'],
      ['text:{text:"Miniapps QR Generator runs locally."}', 'text:{text:"Miniapps QR Generator runs locally."}'],
      ['name:"MMO Link QR"', 'name:"Example Link QR"'],
      ['name:"Misafir Wi-Fi"', 'name:"Guest Wi-Fi"'],
      ['qh(e){return e.type==="url"&&e.name==="Link QR"&&e.fields.url.url==="https://www.mmo.org.tr"&&e.fields.wifi.ssid==="MMO-Guest"&&e.fields.vcard.firstName==="Yusuf Emre"}', 'qh(e){return e.type==="url"&&e.name==="Link QR"&&e.fields.url.url==="https://example.com"&&e.fields.wifi.ssid==="Guest Wi-Fi"&&e.fields.vcard.firstName==="Alex"}'],
    ],
  ],
  [
    path.join(enRoot, "build", "image-toolkit", "assets", "index-BwatE2Hh.js"),
    [
      ['children:"Rotasyonu Uygula"', 'children:"Apply Rotation"'],
    ],
  ],
  [
    path.join(enRoot, "build", "exif-cleaner", "assets", "index-CrnO1h_l.js"),
    [
      ['children:"Kamera"', 'children:"Camera"'],
      ['"EXIF bulundu"', '"EXIF found"'],
      ['"GPS yok"', '"No GPS"'],
      ['"Etiket: "', '"Tags: "'],
      ['"Temizlenecek"', '"Will be cleaned"'],
      ['"Yine de temiz kopya üretilecek"', '"A clean copy will still be generated"'],
    ],
  ],
  [
    path.join(enRoot, "build", "image-format-converter", "assets", "index-B1zEutKm.js"),
    [
      ['children:"Boyut"', 'children:"Size"'],
    ],
  ],
  [
    path.join(enRoot, "build", "bg-remover", "assets", "index-SvUVRWWc.js"),
    [
      ['children:"Bilgi"', 'children:"Info"'],
    ],
  ],
  [
    path.join(enRoot, "build", "video-to-audio", "assets", "index-DMEHmYXy.js"),
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
    ],
  ],
  [
    path.join(enRoot, "build", "audio-editor", "assets", "index-BNiHE-JP.js"),
    [
      ['children:"Dalga Formu"', 'children:"Waveform"'],
      ['children:"Durdur"', 'children:"Stop"'],
      ['children:"Kes"', 'children:"Trim"'],
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
      ['children:"sn"', 'children:"sec"'],
      ['children:"TOTAL DURATION"', 'children:"TOTAL DURATION"'],
      ['children:"SELECTION DURATION"', 'children:"SELECTION DURATION"'],
      ['children:"Total Duration"', 'children:"TOTAL DURATION"'],
      ['children:"Selection Duration"', 'children:"SELECTION DURATION"'],
    ],
  ],
  [
    path.join(enRoot, "build", "dev-toolkit", "assets", "index-Bq-C7bCT.js"),
    [
      ['"Web Crypto bu ortamda desteklenmiyor."', '"Web Crypto is not supported in this environment."'],
      ['toLocaleString("tr-TR")', 'toLocaleString("en-US")'],
      ['blurb:"Encode ve decode et."', 'blurb:"Encode and decode."'],
      ['DEFAULT_AES_TEXT="Bu metin yerelde AES-GCM ile şifrelenir."', 'DEFAULT_AES_TEXT="This text is encrypted locally with AES-GCM."'],
      ['greet("miniapps");', 'greet("miniapps");'],
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
    ],
  ],
]);

const cssTweaks = [
  {
    file: path.join(enRoot, "build", "qr-generator", "assets", "index-C4GScjVi.css"),
    append: ".customer-pill-row{display:none!important}",
  },
];

const missing = [];

for (const [file, replacements] of fileReplacements) {
  const original = read(file);
  const updated = replaceAllTracked(original, file, replacements, missing);
  if (updated !== original) {
    write(file, updated);
  }
}

for (const tweak of cssTweaks) {
  const original = read(tweak.file);
  if (!original.includes(tweak.append)) {
    write(tweak.file, `${original}${tweak.append}`);
  }
}

const scanPatterns = [
  'children:"Geri"',
  't?"Geri":"Load PDF"',
  'children:"Rotasyonu Uygula"',
  'children:"Tabloyu Analiz Et"',
  'a?"Analiz ediliyor...":"Tabloyu Analiz Et"',
  'placeholder:"GIZLI, TASLAK, KOPYA..."',
  'children:"Sil"',
  'alt:`Sayfa ${r.pageIndex+1}`',
  'children:"Renk"',
  'children:"Font Boyutu"',
  'd==="text"?"Metin":"Logo / Image"',
  'children:"Yeni Dosya"',
  '["clean","Temizle"]',
  '"For Turkish Excel outputs, `Windows-1254` is usually the safest choice."',
  'label:"Telefon"',
  'hint:"Ara"',
  'hint:"Harita / geo"',
  'children:"Mesaj"',
  'return{url:"Link",wifi:"Wi-Fi",vcard:"vCard",whatsapp:"WhatsApp",email:"Email",phone:"Telefon",location:"Location",text:"Metin"}[e]',
  'name:"MMO Link QR"',
  'name:"Misafir Wi-Fi"',
  'firstName:"Yusuf Emre"',
  'title:"Kurucu"',
  'children:"Kamera"',
  '"EXIF bulundu"',
  '"GPS yok"',
  '"Etiket: "',
  'children:"Bilgi"',
  'children:"Kaynak dosya"',
  'children:"Kalite"',
  ':"Otomatik"',
  'children:"Kaynak"',
  'desc:"Ses Seviyesi"',
  '`Pik normalizasyonu (${r.targetDbFs} dBFS)`',
  '`Loudness normalizasyonu (${r.targetLufs} LUFS)`',
  '"Hedef LUFS: "',
  '"Hedef Peak: "',
  '"Dengeli"',
  '"Maksimum"',
  '"Kesiliyor..."',
  'children:"Durdur"',
  'children:"Kes"',
  'children:"Dalga Formu"',
  'children:"Kaynak JS"',
  '"Merhaba miniapps"',
  'const message = "Merhaba " + name;',
];

const assetFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (fullPath.endsWith(".js") || fullPath.endsWith(".css")) {
      assetFiles.push(fullPath);
    }
  }
}

walk(path.join(enRoot, "build"));

const residuals = [];

for (const file of assetFiles) {
  const content = read(file);
  const matches = scanPatterns.filter((pattern) => new RegExp(escapeRegExp(pattern)).test(content));
  if (matches.length > 0) {
    residuals.push({
      file,
      matches,
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  missing,
  residuals,
};

write(reportFile, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  missingCount: missing.length,
  residualCount: residuals.length,
  reportFile,
}, null, 2));
