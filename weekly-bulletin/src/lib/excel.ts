import * as XLSX from "xlsx";
import { ExcelImportRow } from "./types";

const REQUIRED_COLUMNS = ["title", "summary", "source", "author", "date", "link", "image_name"] as const;
const HEADER_ALIASES: Record<string, string[]> = {
  title: ["title", "başlık"],
  summary: [
    "summary",
    "özet",
    "özet haber metni",
    "özet (haber metni)",
    "ozet",
    "ozet haber metni",
    "ozet (haber metni)",
  ],
  source: ["source", "kaynak"],
  author: ["author", "yazar"],
  date: ["date", "tarih"],
  link: ["link", "haber linki"],
  image_name: ["image_name", "image name", "haber görseli", "haber gorseli", "haber görsel", "haber gorsel"],
  intro_text: ["footer açıklama metni", "footer aciklama metni", "giriş metni", "giris metni", "intro text"],
};

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const EN_MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  // Türkçe kısaltma ihtimaline karşı
  oca: 0, sub: 1, nis: 3, may_: 4, haz: 5, tem: 6, agu: 7, eyl: 8, eki: 9, kas: 10, ara: 11,
};

function formatTrDate(year: number, monthIndex: number, day: number): string {
  if (!year || day < 1 || day > 31 || monthIndex < 0 || monthIndex > 11) return "";
  return `${day} ${TR_MONTHS[monthIndex]} ${year}`;
}

// Excel seri numarasını (epoch 1899-12-30, 1900 artık-yıl bug'ı dahil) UTC tarihe çevirir.
function dateFromExcelSerial(serial: number): { y: number; m: number; d: number } | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

// Tarih hücresi ne formatta gelirse gelsin (Excel seri sayısı, "7.06.2026",
// "7-Jun-26", "2026-06-07" vb.) "7 Haziran 2026" biçimine çevirir. Tanınmazsa
// orijinali aynen bırakır (elle girilmiş özel metinleri bozmamak için).
export function normalizeNewsDate(value: unknown): string {
  if (value == null) return "";

  if (typeof value === "number") {
    const p = dateFromExcelSerial(value);
    return p ? formatTrDate(p.y, p.m, p.d) : "";
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatTrDate(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  const raw = String(value).trim();
  if (!raw) return "";

  // Zaten Türkçe ay adı içeriyorsa (ör. elle "7 Haziran 2026") dokunma.
  const lower = raw.toLocaleLowerCase("tr");
  if (TR_MONTHS.some((month) => lower.includes(month.toLocaleLowerCase("tr")))) {
    return raw;
  }

  // Metin olarak gelen seri sayı.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const p = dateFromExcelSerial(Number(raw));
    return p ? formatTrDate(p.y, p.m, p.d) : raw;
  }

  // ISO: yyyy-mm-dd
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return formatTrDate(Number(m[1]), Number(m[2]) - 1, Number(m[3])) || raw;

  // Gün-önce Avrupa biçimi: d.m.yyyy / d/m/yyyy / d-m-yy
  m = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return formatTrDate(year, Number(m[2]) - 1, Number(m[1])) || raw;
  }

  // d-Mon-yy (ör. 7-Jun-26)
  m = raw.match(/^(\d{1,2})[-\s]([A-Za-zçğıöşüÇĞİÖŞÜ]{3,})[-\s.]*(\d{2,4})$/);
  if (m) {
    const monthIndex = EN_MONTH_INDEX[m[2].slice(0, 3).toLocaleLowerCase("en")];
    if (monthIndex != null) {
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      return formatTrDate(year, monthIndex, Number(m[1])) || raw;
    }
  }

  return raw;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCanonicalHeader(key: string): string | null {
  const normalizedKey = normalizeHeader(key);

  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalizedKey)) {
      return canonical;
    }
  }

  return null;
}

export function getExpectedColumns(): readonly string[] {
  return REQUIRED_COLUMNS;
}

export async function parseExcelFile(file: File): Promise<ExcelImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("Excel icinde okunacak bir sayfa bulunamadi.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  // raw:true → tarih hücresi ham seri sayısı olarak gelir (Excel'in görüntü
  // formatına bağlı "7-Jun-26" metni değil); normalizeNewsDate güvenilir çevirir.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: true,
  });
  const normalizedRows = rows.map((row) => {
    const nextRow: Record<string, unknown> = {};

    Object.entries(row).forEach(([key, value]) => {
      const canonical = getCanonicalHeader(key);
      if (canonical) {
        nextRow[canonical] = value;
      }
    });

    return nextRow;
  });

  return normalizedRows
    .map((row) => ({
      title: String(row.title ?? "").trim(),
      summary: String(row.summary ?? "").trim(),
      source: String(row.source ?? "").trim(),
      author: String(row.author ?? "").trim(),
      date: normalizeNewsDate(row.date),
      // URL'de ham boşluk/newline geçersiz; Excel hücre sarması "\n" sokabiliyor.
      link: String(row.link ?? "").replace(/\s+/g, ""),
      image_name: String(row.image_name ?? "").trim(),
      intro_text: String(row.intro_text ?? "").trim(),
    }))
    .filter((row) => REQUIRED_COLUMNS.some((key) => row[key].trim().length > 0));
}
