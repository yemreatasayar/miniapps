import { useEffect, useMemo, useState } from "react";
import HistoryPanel from "../components/HistoryPanel";
import NewsItemEditor from "../components/NewsItemEditor";
import PreviewDocument from "../components/PreviewDocument";
import "../styles/weekly-bulletin-studio.css";
import { parseExcelFile } from "../lib/excel";
import { createBlankNewsItem, createDefaultDocument } from "../lib/defaultDocument";
import {
  reorderNewsItems,
  replaceUploadedImage,
  resolveImage,
  sanitizeLink,
  normalizeSummaryHtml,
  summaryTextToHtml,
  touchDocument,
  updateNewsItem,
} from "../lib/format";
import { optimizeImageFile } from "../lib/images";
import { buildBulletinLayout, createCanvasTextMeasurer } from "../lib/layout";
import { exportDocumentPdf } from "../lib/pdf";
import {
  deleteHistoryDocument,
  listHistoryDocuments,
  loadDraft,
  loadHistoryDocument,
  saveDraft,
  saveHistoryDocument,
} from "../lib/storage";
import { BulletinDocument, ExcelImportRow, NewsItem, StoredDocument } from "../lib/types";

function normalizeNewsItem(item: Partial<NewsItem>): NewsItem {
  return {
    id: item.id ?? crypto.randomUUID(),
    title: item.title ?? "",
    summary: item.summary ?? "",
    summaryHtml: normalizeSummaryHtml(item),
    summaryFontSize: item.summaryFontSize ?? 25,
    summaryBold: item.summaryBold ?? false,
    summaryItalic: item.summaryItalic ?? false,
    summaryAlign: item.summaryAlign ?? "left",
    linkLabel: item.linkLabel ?? "",
    source: item.source ?? "",
    author: item.author ?? "",
    date: item.date ?? "",
    link: item.link ?? "",
    imageName: item.imageName ?? "",
  };
}

function normalizeDocument(document: BulletinDocument): BulletinDocument {
  return {
    ...document,
    newsItems: document.newsItems.map((item) => normalizeNewsItem(item)),
    uploadedImages: document.uploadedImages ?? [],
  };
}

function buildNewsItemFromExcel(row: ExcelImportRow): NewsItem {
  return {
    id: crypto.randomUUID(),
    title: row.title,
    summary: row.summary,
    summaryHtml: summaryTextToHtml(row.summary),
    summaryFontSize: 25,
    summaryBold: false,
    summaryItalic: false,
    summaryAlign: "left",
    linkLabel: "",
    source: row.source,
    author: row.author,
    date: row.date,
    link: row.link,
    imageName: row.image_name,
  };
}

function countMissingImages(document: BulletinDocument): string[] {
  return document.newsItems
    .filter((item) => item.imageName && !resolveImage(document, item.imageName))
    .map((item) => item.imageName);
}

export default function WeeklyBulletinStudio() {
  const [documentState, setDocumentState] = useState<BulletinDocument>(createDefaultDocument());
  const [history, setHistory] = useState<StoredDocument[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [activeHistoryName, setActiveHistoryName] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [collapsedItemIds, setCollapsedItemIds] = useState<string[]>([]);
  const [booting, setBooting] = useState(true);
  const [isIntroEditing, setIsIntroEditing] = useState(false);
  const [introDraft, setIntroDraft] = useState("");
  const measure = useMemo(() => createCanvasTextMeasurer(), []);
  const layout = useMemo(() => buildBulletinLayout(documentState, measure), [documentState, measure]);
  const missingImages = useMemo(() => countMissingImages(documentState), [documentState]);
  const allCardsCollapsed =
    documentState.newsItems.length > 1 &&
    documentState.newsItems.every((item) => collapsedItemIds.includes(item.id));

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const [draft, savedHistory] = await Promise.all([loadDraft(), listHistoryDocuments()]);
      if (cancelled) return;
      const normalizedDraft = draft ? normalizeDocument(draft) : createDefaultDocument();
      const matchingHistory = draft ? savedHistory.find((entry) => entry.id === normalizedDraft.id) : null;

      setDocumentState(normalizedDraft);
      setHistory(savedHistory);
      setActiveHistoryId(matchingHistory?.id ?? null);
      setActiveHistoryName(matchingHistory?.document.name ?? null);
      setBooting(false);
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (booting) return;
    const timer = window.setTimeout(() => {
      void saveDraft(documentState);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [booting, documentState]);

  useEffect(() => {
    setIntroDraft(documentState.introText);
  }, [documentState.introText]);

  useEffect(() => {
    setCollapsedItemIds((current) =>
      current.filter((id) => documentState.newsItems.some((item) => item.id === id))
    );
  }, [documentState.newsItems]);

  async function refreshHistory(): Promise<void> {
    setHistory(await listHistoryDocuments());
  }

  function updateDocument(updater: (current: BulletinDocument) => BulletinDocument): void {
    setDocumentState((current) => updater(current));
  }

  function updateDocumentField(field: keyof Pick<BulletinDocument, "name" | "introText">, value: string): void {
    updateDocument((current) =>
      touchDocument({
        ...current,
        [field]: value,
      })
    );
  }

  function handleNewsFieldChange(itemId: string, field: keyof Omit<NewsItem, "id">, value: string | number | boolean): void {
    updateDocument((current) =>
      updateNewsItem(current, itemId, (item) => ({ ...item, [field]: value } as NewsItem))
    );
  }

  function handleDeleteNews(itemId: string): void {
    updateDocument((current) =>
      touchDocument({
        ...current,
        newsItems: current.newsItems.filter((item) => item.id !== itemId),
      })
    );
  }

  function handleAddNews(): void {
    updateDocument((current) =>
      touchDocument({
        ...current,
        newsItems: [...current.newsItems, createBlankNewsItem()],
      })
    );
  }

  function handleToggleNewsCollapse(itemId: string): void {
    setCollapsedItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  }

  function handleCollapseAll(): void {
    setCollapsedItemIds(documentState.newsItems.map((item) => item.id));
  }

  function handleExpandAll(): void {
    setCollapsedItemIds([]);
  }

  async function handleInlineImageUpload(itemId: string, file: File): Promise<void> {
    const asset = await optimizeImageFile(file);

    updateDocument((current) => {
      const withImage = replaceUploadedImage(current, asset);
      return updateNewsItem(withImage, itemId, (item) => ({ ...item, imageName: file.name }));
    });
  }

  function handleClearItemImage(itemId: string): void {
    updateDocument((current) => updateNewsItem(current, itemId, (item) => ({ ...item, imageName: "" })));
  }

  async function handleBulkImageUpload(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    const assets = await Promise.all(Array.from(files).map((file) => optimizeImageFile(file)));

    updateDocument((current) => {
      let next = current;
      for (const asset of assets) {
        next = replaceUploadedImage(next, asset);
      }
      return next;
    });
  }

  async function handleExcelImport(file: File | null): Promise<void> {
    if (!file) return;
    const rows = await parseExcelFile(file);
    const newsItems = rows.map(buildNewsItemFromExcel);
    const introText = rows.find((row) => row.intro_text?.trim())?.intro_text?.trim();

    updateDocument((current) =>
      touchDocument({
        ...current,
        introText: introText || current.introText,
        newsItems,
      })
    );
  }

  async function handleSaveHistory(): Promise<void> {
    const trimmedName = documentState.name.trim();
    const shouldOverwrite =
      Boolean(activeHistoryId) && trimmedName.length > 0 && trimmedName === (activeHistoryName ?? "").trim();
    const now = new Date().toISOString();
    const savedId = await saveHistoryDocument(documentState, shouldOverwrite ? activeHistoryId ?? undefined : undefined);

    setDocumentState((current) => ({
      ...current,
      id: savedId,
      updatedAt: now,
    }));
    setActiveHistoryId(savedId);
    setActiveHistoryName(documentState.name);
    await refreshHistory();
  }

  async function handleLoadHistory(id: string): Promise<void> {
    const record = await loadHistoryDocument(id);
    if (!record) return;
    setDocumentState(normalizeDocument(record.document));
    setActiveHistoryId(id);
    setActiveHistoryName(record.document.name);
    setIsIntroEditing(false);
    setCollapsedItemIds([]);
  }

  async function handleDeleteHistory(id: string): Promise<void> {
    await deleteHistoryDocument(id);
    if (activeHistoryId === id) {
      setActiveHistoryId(null);
      setActiveHistoryName(null);
    }
    await refreshHistory();
  }

  function handleClearCurrent(): void {
    setDocumentState((current) =>
      touchDocument({
        ...current,
        newsItems: [],
        uploadedImages: [],
      })
    );
    setActiveHistoryId(null);
    setActiveHistoryName(null);
    setIsIntroEditing(false);
    setCollapsedItemIds([]);
  }

  function handleSaveIntro(): void {
    updateDocumentField("introText", introDraft);
    setIsIntroEditing(false);
  }

  function handleCancelIntro(): void {
    setIntroDraft(documentState.introText);
    setIsIntroEditing(false);
  }

  async function handleExportPdf(): Promise<void> {
    try {
      const safeDocument = touchDocument({
        ...documentState,
        newsItems: documentState.newsItems.map((item) => ({
          ...item,
          link: sanitizeLink(item.link),
        })),
      });
      const blob = await exportDocumentPdf(safeDocument);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeDocument.name || "weekly-bulletin"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("PDF export failed:", message);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <section className="panel-section">
          <div className="section-heading">
            <div>
              <h1>Filtre Haftalık Bülten</h1>
              <p>Excel'den bülten üret, PDF olarak dışa aktar.</p>
            </div>
          </div>

          <div className="toolbar-grid">
            <button type="button" className="primary-button" onClick={() => void handleSaveHistory()}>
              Tasarımı Kaydet
            </button>
            <button type="button" className="primary-button alt" onClick={() => void handleExportPdf()}>
              PDF Dışa Aktar
            </button>
            <button type="button" className="ghost-button" onClick={() => { if (window.confirm("Tüm içerik silinecek. Emin misiniz?")) handleClearCurrent(); }}>
              Temizle
            </button>
            <button type="button" className="ghost-button" onClick={handleAddNews}>
              Yeni Haber
            </button>
          </div>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <div>
              <h3>Belge Ayarları</h3>
              <p>Sabit alanları düzenle.</p>
            </div>
          </div>

          <label className="field">
            <span>Tasarım Adı</span>
            <input value={documentState.name} onChange={(event) => updateDocumentField("name", event.target.value)} />
          </label>
          <div className="editor-block">
            <span className="field-label">Giriş Metni</span>
            {isIntroEditing ? (
              <>
                <label className="field">
                  <textarea rows={7} value={introDraft} onChange={(event) => setIntroDraft(event.target.value)} />
                </label>
                <div className="editor-inline-buttons">
                  <button type="button" className="secondary-button" onClick={handleSaveIntro}>
                    Kaydet
                  </button>
                  <button type="button" className="secondary-button secondary-button-muted" onClick={handleCancelIntro}>
                    İptal
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="readonly-box readonly-box-large">{documentState.introText || "Giriş metni girilmedi."}</div>
                <div className="editor-inline-buttons">
                  <button type="button" className="secondary-button" onClick={() => setIsIntroEditing(true)}>
                    Giriş Metnini Düzenle
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <div>
              <h3>Excel ve Görsel İçe Aktarım</h3>
              <p>Haberleri ve görselleri içe aktar.</p>
            </div>
          </div>

          <div className="toolbar-grid compact">
            <label className="ghost-button">
              Excel seç
              <input
                hidden
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => void handleExcelImport(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="ghost-button">
              Görselleri yükle
              <input
                hidden
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => void handleBulkImageUpload(event.target.files)}
              />
            </label>
          </div>

          <div className="info-box">
            <strong>Kütüphanedeki görsel sayısı:</strong> {documentState.uploadedImages.length}
          </div>

          <div className="warning-box">
            <strong>Eşleşmeyen Görsel:</strong>{" "}
            {missingImages.length > 0 ? Array.from(new Set(missingImages)).join(", ") : "Yok"}
          </div>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <div>
              <h3>Haberler</h3>
              <p>Düzenle, sırala ve görsel bağla.</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={allCardsCollapsed ? handleExpandAll : handleCollapseAll}
            >
              {allCardsCollapsed ? "Tümünü Aç" : "Tümünü Kapat"}
            </button>
          </div>

          <div className="editor-list">
            {documentState.newsItems.map((item) => (
              <NewsItemEditor
                key={item.id}
                item={item}
                isCollapsed={collapsedItemIds.includes(item.id)}
                dragEnabled={allCardsCollapsed}
                onChange={handleNewsFieldChange}
                onDelete={handleDeleteNews}
                onToggleCollapse={handleToggleNewsCollapse}
                onImageUpload={(itemId, file) => void handleInlineImageUpload(itemId, file)}
                onClearImage={handleClearItemImage}
                onDragStart={setDraggingId}
                onDropOn={(targetId, position) => {
                  if (!draggingId) return;
                  updateDocument((current) => reorderNewsItems(current, draggingId, targetId, position));
                  setDraggingId(null);
                }}
              />
            ))}
          </div>
        </section>

        <HistoryPanel history={history} activeId={activeHistoryId} onLoad={(id) => void handleLoadHistory(id)} onDelete={(id) => void handleDeleteHistory(id)} />
      </aside>

      <section className="preview-column">
        <PreviewDocument document={documentState} layout={layout} />
      </section>
    </main>
  );
}
