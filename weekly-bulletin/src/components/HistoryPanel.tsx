import { StoredDocument } from "../lib/types";

type HistoryPanelProps = {
  history: StoredDocument[];
  activeId: string | null;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function HistoryPanel({ history, activeId, onLoad, onDelete }: HistoryPanelProps) {
  return (
    <section className="panel-section">
      <div className="section-heading">
        <div>
          <h3>Geçmiş Tasarımlar</h3>
          <p>Kaydedilen tasarımları yeniden açabilir veya silebilirsin.</p>
        </div>
      </div>

      <div className="history-list">
        {history.length === 0 ? (
          <div className="empty-box">Kaydedilmiş tasarım yok.</div>
        ) : (
          history.map((entry) => (
            <article key={entry.id} className={`history-item ${activeId === entry.id ? "active" : ""}`}>
              <div>
                <strong>{entry.document.name || "İsimsiz tasarım"}</strong>
                <p>{new Date(entry.updatedAt).toLocaleString("tr-TR")}</p>
              </div>
              <div className="inline-actions">
                <button type="button" className="ghost-button" onClick={() => onLoad(entry.id)}>
                  Aç
                </button>
                <button type="button" className="ghost-button danger" onClick={() => onDelete(entry.id)}>
                  Sil
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
