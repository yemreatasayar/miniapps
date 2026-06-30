export type Lang = "tr" | "en";

const LANG_KEY = "video-compressor.lang";

export function readStoredLang(): Lang {
  try {
    const stored = window.localStorage.getItem(LANG_KEY);
    if (stored === "tr" || stored === "en") return stored;
  } catch { /* */ }
  // Auto-detect from URL: /apps-en/ paths default to English
  if (typeof window !== "undefined" && window.location.pathname.includes("/apps-en/")) return "en";
  return "tr";
}

export function saveStoredLang(lang: Lang): void {
  try { window.localStorage.setItem(LANG_KEY, lang); } catch { /* */ }
}

export type Strings = {
  // DropZone
  dropAriaLabel: string;
  dropTitle: string;
  dropLoading: string;
  dropDesc: string;
  dropButton: string;
  dropOr: string;
  // ProgressPanel
  progressLoading: string;
  progressWait: string;
  // ResultPanel
  resultDone: string;
  resultOutputSize: string;
  resultSizeDiff: string;
  resultSmaller: (pct: number) => string;
  resultLarger: (pct: number) => string;
  resultDownload: string;
  resultNewFile: string;
  // CompressPanel
  compressTitle: string;
  compressDesc: string;
  outputFormatLabel: string;
  fmtOriginalLabel: string;
  fmtOriginalDesc: string;
  fmtMp4Desc: string;
  fmtWebmDesc: string;
  fmtMovDesc: string;
  qualityLabel: (crf: number) => string;
  qualityHigh: string;
  qualitySmall: string;
  crfLossless: string;
  crfBalanced: string;
  crfSmall: string;
  crfVerySmall: string;
  qualityHint: string;
  audioLabel: string;
  audioOn: string;
  audioOff: string;
  audioRecommended: string;
  audioMuted: string;
  // CutPanel
  cutTitle: string;
  cutDescEdited: (n: number, dur: string) => string;
  cutDescIdle: string;
  cutUndo: string;
  cutRedo: string;
  cutSplit: string;
  cutDelete: string;
  cutReset: string;
  cutPlay: string;
  cutPause: string;
  cutHandleStart: string;
  cutHandleEnd: string;
  cutPlayheadTitle: string;
  // App hero
  waiting: string;
  heroTitle: string;
  heroDesc: string;
  stat1Title: string;
  stat1Desc: string;
  stat2Title: string;
  stat2Desc: string;
  stat3Title: string;
  stat3Desc: string;
  changeVideo: string;
  processBtn: string;
  sourceFileLabel: string;
  operationsLabel: string;
  summaryTitle: string;
  sizeLabel: string;
  durationLabel: string;
  outputFormatSummary: string;
  audioSummaryLabel: string;
  segmentLabel: string;
  fullVideo: string;
  pieceCount: (n: number) => string;
  tipsTitle: string;
  tipsBest: string;
  tip1Title: string;
  tip1Desc: string;
  tip2Title: string;
  tip2Desc: string;
  tip3Title: string;
  tip3Desc: string;
  // Errors / status
  notVideoFile: string;
  processFailed: string;
  processingSegments: string;
  processingVideo: string;
  memoryError: string;
};

export const strings: Record<Lang, Strings> = {
  tr: {
    dropAriaLabel: "Video dosyası yükle",
    dropTitle: "Video dosyasını buraya bırak",
    dropLoading: "İşleniyor...",
    dropDesc: "MP4, WebM, MOV, AVI, MKV ve diğer video formatları",
    dropButton: "Dosya Seç",
    dropOr: "veya sürükle bırak",

    progressLoading: "FFmpeg hazırlanıyor",
    progressWait: "Lütfen bekleyin...",

    resultDone: "Tamamlandı",
    resultOutputSize: "Çıktı boyutu",
    resultSizeDiff: "Boyut farkı",
    resultSmaller: (pct) => `%${pct} küçük`,
    resultLarger: (pct) => `%${pct} büyük`,
    resultDownload: "İndir",
    resultNewFile: "Yeni Dosya",

    compressTitle: "Sıkıştır & Dönüştür",
    compressDesc: "Çıktı formatı ve kalite tercihlerini seç",
    outputFormatLabel: "Çıktı Formatı",
    fmtOriginalLabel: "Orijinal Format",
    fmtOriginalDesc: "Aynı format, yeniden sıkıştır",
    fmtMp4Desc: "En geniş uyumluluk",
    fmtWebmDesc: "Web için optimize",
    fmtMovDesc: "Apple ekosistemi için",
    qualityLabel: (crf) => `Video Kalitesi — CRF ${crf}`,
    qualityHigh: "Yüksek Kalite",
    qualitySmall: "Küçük Dosya",
    crfLossless: "görsel kayıp yok",
    crfBalanced: "dengeli",
    crfSmall: "küçük dosya",
    crfVerySmall: "çok küçük dosya",
    qualityHint: "Düşük CRF = daha az sıkıştırma. Orijinal kaliteyi aşmak mümkün değildir; çok düşük CRF yalnızca dosya boyutunu artırır.",
    audioLabel: "Ses",
    audioOn: "Dahil",
    audioOff: "Sesiz",
    audioRecommended: " — Önerilen",
    audioMuted: "Ses kanalı çıktıya dahil edilmeyecek.",

    cutTitle: "Segment Yönetimi",
    cutDescEdited: (n, dur) => `${n} parça · ${dur} kalacak`,
    cutDescIdle: "Videoda kalacak bölgeleri belirleyin.",
    cutUndo: "Geri Al",
    cutRedo: "İleri Al",
    cutSplit: "Böl",
    cutDelete: "Sil",
    cutReset: "Sıfırla",
    cutPlay: "Oynat",
    cutPause: "Duraklat",
    cutHandleStart: "Başlangıcı kırp",
    cutHandleEnd: "Bitişi kırp",
    cutPlayheadTitle: "Oynatma konumunu sürükle",

    waiting: "Video bekleniyor",
    heroTitle: "Videoyu sıkıştır, dönüştür, kırp.",
    heroDesc: "Tek geçişte: format dönüştür, kalite ayarla, segment sil. Dosyaların tarayıcı dışına çıkmaz.",
    stat1Title: "Tek geçiş",
    stat1Desc: "Sıkıştır + Segment sil aynı anda",
    stat2Title: "Yerelde işlem",
    stat2Desc: "Sunucuya yükleme yok",
    stat3Title: "5 format",
    stat3Desc: "MP4, WebM, MOV, AVI, MKV",
    changeVideo: "Başka Video Seç",
    processBtn: "İşle",
    sourceFileLabel: "Kaynak dosya",
    operationsLabel: "İşlemler",
    summaryTitle: "Özet",
    sizeLabel: "Boyut",
    durationLabel: "Süre",
    outputFormatSummary: "Çıktı formatı",
    audioSummaryLabel: "Ses",
    segmentLabel: "Segment",
    fullVideo: "Tam video",
    pieceCount: (n) => `${n} parça`,
    tipsTitle: "İpucu",
    tipsBest: "En iyi sonuçlar için",
    tip1Title: "CRF 18–22",
    tip1Desc: "Görsel kayıp fark edilmez, boyut makul kalır.",
    tip2Title: "CRF 28–32",
    tip2Desc: "Sosyal medya paylaşımları için iyi denge.",
    tip3Title: "Segment kenarları",
    tip3Desc: "Timeline'daki mavi blokların kenarlarını sürükle.",
    notVideoFile: "Lütfen bir video dosyası seç.",
    processFailed: "İşlem başarısız.",
    processingSegments: "Segmentler işleniyor",
    processingVideo: "Video işleniyor",
    memoryError: "Tarayıcı belleği bu video için yetmedi. Daha küçük/daha kısa bir dosya deneyin veya daha yüksek CRF (daha fazla sıkıştırma) seçin.",
  },

  en: {
    dropAriaLabel: "Upload video file",
    dropTitle: "Drop your video file here",
    dropLoading: "Processing...",
    dropDesc: "MP4, WebM, MOV, AVI, MKV and other video formats",
    dropButton: "Choose File",
    dropOr: "or drag & drop",

    progressLoading: "Loading FFmpeg",
    progressWait: "Please wait...",

    resultDone: "Done",
    resultOutputSize: "Output size",
    resultSizeDiff: "Size difference",
    resultSmaller: (pct) => `${pct}% smaller`,
    resultLarger: (pct) => `${pct}% larger`,
    resultDownload: "Download",
    resultNewFile: "New File",

    compressTitle: "Compress & Convert",
    compressDesc: "Choose output format and quality settings",
    outputFormatLabel: "Output Format",
    fmtOriginalLabel: "Original Format",
    fmtOriginalDesc: "Same format, re-compress",
    fmtMp4Desc: "Widest compatibility",
    fmtWebmDesc: "Optimized for web",
    fmtMovDesc: "For Apple ecosystem",
    qualityLabel: (crf) => `Video Quality — CRF ${crf}`,
    qualityHigh: "High Quality",
    qualitySmall: "Small File",
    crfLossless: "visually lossless",
    crfBalanced: "balanced",
    crfSmall: "small file",
    crfVerySmall: "very small file",
    qualityHint: "Lower CRF = less compression. You can't exceed the original quality; a very low CRF only increases file size.",
    audioLabel: "Audio",
    audioOn: "Included",
    audioOff: "Muted",
    audioRecommended: " — Recommended",
    audioMuted: "Audio track will not be included in the output.",

    cutTitle: "Segment Editor",
    cutDescEdited: (n, dur) => `${n} segment${n > 1 ? "s" : ""} · ${dur} remaining`,
    cutDescIdle: "Define the regions to keep in the output.",
    cutUndo: "Undo",
    cutRedo: "Redo",
    cutSplit: "Split",
    cutDelete: "Delete",
    cutReset: "Reset",
    cutPlay: "Play",
    cutPause: "Pause",
    cutHandleStart: "Trim start",
    cutHandleEnd: "Trim end",
    cutPlayheadTitle: "Drag to seek",

    waiting: "Waiting for video",
    heroTitle: "Compress, convert, trim your video.",
    heroDesc: "All in one pass: convert format, adjust quality, remove segments. Files never leave your browser.",
    stat1Title: "Single pass",
    stat1Desc: "Compress + trim in one operation",
    stat2Title: "Local processing",
    stat2Desc: "No server upload",
    stat3Title: "5 formats",
    stat3Desc: "MP4, WebM, MOV, AVI, MKV",
    changeVideo: "Change Video",
    processBtn: "Process",
    sourceFileLabel: "Source file",
    operationsLabel: "Operations",
    summaryTitle: "Summary",
    sizeLabel: "Size",
    durationLabel: "Duration",
    outputFormatSummary: "Output format",
    audioSummaryLabel: "Audio",
    segmentLabel: "Segment",
    fullVideo: "Full video",
    pieceCount: (n) => `${n} segment${n > 1 ? "s" : ""}`,
    tipsTitle: "Tips",
    tipsBest: "For best results",
    tip1Title: "CRF 18–22",
    tip1Desc: "Visually lossless, reasonable file size.",
    tip2Title: "CRF 28–32",
    tip2Desc: "Good balance for social media sharing.",
    tip3Title: "Segment edges",
    tip3Desc: "Drag the edges of the blue blocks on the timeline.",
    notVideoFile: "Please select a video file.",
    processFailed: "Processing failed.",
    processingSegments: "Processing segments",
    processingVideo: "Processing video",
    memoryError: "Browser memory wasn't enough for this video. Try a smaller / shorter file or pick a higher CRF (more compression).",
  },
};
