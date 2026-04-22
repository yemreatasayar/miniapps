import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.join(__dirname, "site");
const trRoot = path.join(siteRoot, "apps", "qr-generator");
const enRoot = path.join(siteRoot, "apps-en", "qr-generator");

const replacements = [
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
];

const cssTweaks = [".customer-pill-row{display:none!important}"];

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
  const isJs = filePath.endsWith(".js");
  const isCss = filePath.endsWith(".css");
  if (!isJs && !isCss) continue;

  const original = readFileSync(filePath, "utf8");
  let updated = original;

  for (const [from, to] of replacements) {
    updated = updated.split(from).join(to);
  }

  if (isCss) {
    for (const tweak of cssTweaks) {
      if (!updated.includes(tweak)) updated += tweak;
    }
  }

  if (updated !== original) writeFileSync(filePath, updated);
}

console.log("apps-en/qr-generator synced from TR build with EN localization applied.");
