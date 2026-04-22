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
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: false,
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
      date: String(row.date ?? "").trim(),
      link: String(row.link ?? "").trim(),
      image_name: String(row.image_name ?? "").trim(),
      intro_text: String(row.intro_text ?? "").trim(),
    }))
    .filter((row) => REQUIRED_COLUMNS.some((key) => row[key].trim().length > 0));
}
