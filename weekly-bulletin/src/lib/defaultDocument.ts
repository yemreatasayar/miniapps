import { BulletinDocument, NewsItem } from "./types";

function createNewsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: crypto.randomUUID(),
    title: "",
    summary: "",
    summaryHtml: "",
    summaryFontSize: 25,
    summaryBold: false,
    summaryItalic: false,
    summaryAlign: "left",
    linkLabel: "",
    source: "",
    author: "",
    date: "",
    link: "",
    imageName: "",
    ...overrides,
  };
}

export function createBlankNewsItem(): NewsItem {
  return createNewsItem();
}

export function createDefaultDocument(): BulletinDocument {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name: "Yeni Bülten",
    issueLabel: "Haftalık Şube Bülteni",
    introText:
      "Ülke ve dünya gündemine dair derlenen haber, makale ve değerlendirmeleri tek parça, uzun bir bülten tasarımı içinde toparlamak için hazırlandı.",
    footerTitle: "Filtre / MMO",
    footerText: "",
    newsItems: [
      createNewsItem({
        title: "COP31'e Giderken: İklim Adaleti mi, Savaşın Enerji Rejimi mi?",
        summary:
          "Bu örnek kayıt sadece yerleşimi göstermek için eklendi. Başlık ve özet sınırsız uzar; belge boyu aşağı doğru otomatik genişler.",
        linkLabel: "",
        source: "BirGün",
        author: "Aziz Çelik",
        date: "10 Nisan 2026",
        link: "https://example.com/haber-1",
        imageName: "",
      }),
      createNewsItem({
        title: "Erdoğan'ın 15 Ayda Yapılacaklar Listesi",
        summary:
          "Excel içe aktarımı ile title, summary, source, author, date, link ve image_name alanları otomatik okunur. Görseller birebir dosya adı ile eşleştirilir.",
        linkLabel: "",
        source: "Evrensel",
        author: "Ümit Akçay",
        date: "9 Nisan 2026",
        link: "https://example.com/haber-2",
        imageName: "",
      }),
    ],
    uploadedImages: [],
    createdAt: now,
    updatedAt: now,
  };
}
