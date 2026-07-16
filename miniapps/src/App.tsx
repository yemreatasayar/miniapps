import { useEffect, useMemo, useState } from "react";

type Customer = {
  id: string;
  name: string;
  city: string;
};

type MiniApp = {
  id: string;
  name: string;
  launchUrl: string;
};

type CustomerAppMap = Record<string, string[]>;

function assetUrl(fileName: string): string {
  return `${import.meta.env.BASE_URL}assets/${fileName}`;
}

const STORAGE_NAMESPACE = "miniapps";
const CUSTOMERS_STORAGE_KEY = `${STORAGE_NAMESPACE}.customers`;
const APPS_STORAGE_KEY = `${STORAGE_NAMESPACE}.apps`;
const SELECTED_CUSTOMER_STORAGE_KEY = `${STORAGE_NAMESPACE}.selectedCustomerId`;
const CUSTOMER_APPS_STORAGE_KEY = `${STORAGE_NAMESPACE}.customerApps`;
const MIN_GRID_SLOT_COUNT = 10;
const WEEKLY_BULLETIN_URL = "http://127.0.0.1:4311/";
const QR_GENERATOR_URL = "http://127.0.0.1:4312/";
const PDF_TOOLKIT_URL = "http://127.0.0.1:4313/";
const IMAGE_TOOLKIT_URL = "http://127.0.0.1:4315/";
const VIDEO_TO_AUDIO_URL = "http://127.0.0.1:4316/";
const CSV_TOOLKIT_URL = "http://127.0.0.1:4317/";
const BG_REMOVER_URL = "http://127.0.0.1:4318/";
const AUDIO_EDITOR_URL = "http://127.0.0.1:4320/";
const EXIF_CLEANER_URL = "http://127.0.0.1:4321/";
const IMAGE_FORMAT_CONVERTER_URL = "http://127.0.0.1:4322/";
const DEV_TOOLKIT_URL = "http://127.0.0.1:4323/";
const STEM_SPLITTER_URL = "http://127.0.0.1:4194/";
const VIDEO_COMPRESSOR_URL = "http://127.0.0.1:4324/";
const GA_REPORT_BRIDGE_URL = "http://127.0.0.1:4326/";
const DEFAULT_PACK_LABEL = "miniapps pack";
const DEFAULT_PACK_VERSION = "2026.2.1";
const DEFAULT_AUTHOR_LABEL = "by y.e.a.";
const ADMIN_PIN_HASH = "c90ef8c5f8807ef4756af7a5f02be5fb0444e0ca51728181d4e1c864d2d2e759";
const SHARED_APP_DISPLAY_ORDER = [
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
  "ga-report-bridge",
  "dev-toolkit",
] as const;
const DEFAULT_AUTO_ATTACH_APP_IDS = [
  "qr-generator",
  "pdf-toolkit",
  "image-toolkit",
  "video-to-audio",
  "video-compressor",
  "csv-toolkit",
  "bg-remover",
  "audio-editor",
  "ga-report-bridge",
  "exif-cleaner",
  "image-format-converter",
  "dev-toolkit",
  "stem-splitter",
] as const;

const INTERNAL_CUSTOMERS: Customer[] = [
  { id: "mmo-istanbul", name: "MMO İstanbul Şubesi", city: "İstanbul" },
  { id: "filtre-editor", name: "Filtre Editör", city: "İstanbul" },
];

const INTERNAL_APPS: MiniApp[] = [
  { id: "weekly-bulletin", name: "Filtre", launchUrl: WEEKLY_BULLETIN_URL },
  { id: "pdf-toolkit", name: "PDF Toolkit", launchUrl: PDF_TOOLKIT_URL },
  { id: "csv-toolkit", name: "CSV Toolkit", launchUrl: CSV_TOOLKIT_URL },
  { id: "qr-generator", name: "QR Generator", launchUrl: QR_GENERATOR_URL },
  { id: "image-toolkit", name: "Image Toolkit", launchUrl: IMAGE_TOOLKIT_URL },
  { id: "exif-cleaner", name: "EXIF Cleaner", launchUrl: EXIF_CLEANER_URL },
  { id: "image-format-converter", name: "Format Converter", launchUrl: IMAGE_FORMAT_CONVERTER_URL },
  { id: "bg-remover", name: "BG Remover", launchUrl: BG_REMOVER_URL },
  { id: "video-to-audio", name: "Video to Audio", launchUrl: VIDEO_TO_AUDIO_URL },
  { id: "audio-editor", name: "Audio Editor", launchUrl: AUDIO_EDITOR_URL },
  { id: "stem-splitter", name: "Stem Splitter", launchUrl: STEM_SPLITTER_URL },
  { id: "dev-toolkit", name: "Dev Toolkit", launchUrl: DEV_TOOLKIT_URL },
  { id: "video-compressor", name: "Video Compressor", launchUrl: VIDEO_COMPRESSOR_URL },
  { id: "ga-report-bridge", name: "Analytica", launchUrl: GA_REPORT_BRIDGE_URL },
];

const initialCustomerApps: CustomerAppMap = {
  "mmo-istanbul": [
    "weekly-bulletin",
    "qr-generator",
    "pdf-toolkit",
    "image-toolkit",
    "video-to-audio",
    "video-compressor",
    "ga-report-bridge",
    "csv-toolkit",
    "bg-remover",
    "audio-editor",
    "exif-cleaner",
    "image-format-converter",
    "dev-toolkit",
    "stem-splitter",
  ],
  "filtre-editor": [
    "qr-generator",
    "pdf-toolkit",
    "image-toolkit",
    "video-to-audio",
    "video-compressor",
    "ga-report-bridge",
    "csv-toolkit",
    "bg-remover",
    "audio-editor",
    "exif-cleaner",
    "image-format-converter",
    "dev-toolkit",
    "stem-splitter",
  ],
};

type WorkspaceMode = "grid" | "danger";
type PendingDelete =
  | { kind: "customer"; id: string; name: string }
  | { kind: "app"; id: string; name: string }
  | null;

function trackMiniappsEvent(eventName: string, params: Record<string, string | number | boolean> = {}): void {
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) return;

  const gtag = (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag;
  gtag?.("event", eventName, params);
}

async function sha256Hex(value: string): Promise<string> {
  if (!window.crypto?.subtle) {
    throw new Error("Bu tarayıcı SHA-256 doğrulamasını desteklemiyor.");
  }

  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeApps(storedApps: MiniApp[]): MiniApp[] {
  const weeklyBulletin = storedApps.find((app) => app.id === "weekly-bulletin");
  const qrGenerator = storedApps.find((app) => app.id === "qr-generator");
  const pdfToolkit = storedApps.find((app) => app.id === "pdf-toolkit");
  const imageToolkit = storedApps.find((app) => app.id === "image-toolkit");
  const videoToAudio = storedApps.find((app) => app.id === "video-to-audio");
  const csvToolkit = storedApps.find((app) => app.id === "csv-toolkit");
  const bgRemover = storedApps.find((app) => app.id === "bg-remover");
  const audioEditor = storedApps.find((app) => app.id === "audio-editor");
  const exifCleaner = storedApps.find((app) => app.id === "exif-cleaner");
  const imageFormatConverter = storedApps.find((app) => app.id === "image-format-converter");
  const devToolkit = storedApps.find((app) => app.id === "dev-toolkit");
  const stemSplitter = storedApps.find((app) => app.id === "stem-splitter");
  const videoCompressor = storedApps.find((app) => app.id === "video-compressor");
  const gaReportBridge = storedApps.find((app) => app.id === "ga-report-bridge");

  if (
    !weeklyBulletin &&
    !qrGenerator &&
    !pdfToolkit &&
    !imageToolkit &&
    !videoToAudio &&
    !csvToolkit &&
    !bgRemover &&
    !audioEditor &&
    !exifCleaner &&
    !imageFormatConverter &&
    !devToolkit &&
    !stemSplitter &&
    !videoCompressor &&
    !gaReportBridge
  )
    return INTERNAL_APPS;

  const nextApps: MiniApp[] = [];

  if (weeklyBulletin) {
    nextApps.push({
      id: "weekly-bulletin",
      name: weeklyBulletin.name || "Filtre",
      launchUrl: weeklyBulletin.launchUrl || WEEKLY_BULLETIN_URL,
    });
  }

  nextApps.push({ id: "qr-generator", name: qrGenerator?.name || "QR Generator", launchUrl: qrGenerator?.launchUrl || QR_GENERATOR_URL });
  nextApps.push({ id: "pdf-toolkit", name: pdfToolkit?.name || "PDF Toolkit", launchUrl: pdfToolkit?.launchUrl || PDF_TOOLKIT_URL });
  nextApps.push({ id: "image-toolkit", name: imageToolkit?.name || "Image Toolkit", launchUrl: imageToolkit?.launchUrl || IMAGE_TOOLKIT_URL });
  nextApps.push({ id: "video-to-audio", name: videoToAudio?.name || "Video to Audio", launchUrl: videoToAudio?.launchUrl || VIDEO_TO_AUDIO_URL });
  nextApps.push({ id: "csv-toolkit", name: csvToolkit?.name || "CSV Toolkit", launchUrl: csvToolkit?.launchUrl || CSV_TOOLKIT_URL });
  nextApps.push({ id: "bg-remover", name: bgRemover?.name || "BG Remover", launchUrl: bgRemover?.launchUrl || BG_REMOVER_URL });
  nextApps.push({ id: "audio-editor", name: audioEditor?.name || "Audio Editor", launchUrl: audioEditor?.launchUrl || AUDIO_EDITOR_URL });
  nextApps.push({ id: "exif-cleaner", name: exifCleaner?.name || "EXIF Cleaner", launchUrl: exifCleaner?.launchUrl || EXIF_CLEANER_URL });
  nextApps.push({ id: "image-format-converter", name: imageFormatConverter?.name || "Format Converter", launchUrl: imageFormatConverter?.launchUrl || IMAGE_FORMAT_CONVERTER_URL });
  nextApps.push({ id: "dev-toolkit", name: devToolkit?.name || "Dev Toolkit", launchUrl: devToolkit?.launchUrl || DEV_TOOLKIT_URL });
  nextApps.push({ id: "stem-splitter", name: stemSplitter?.name || "Stem Splitter", launchUrl: stemSplitter?.launchUrl || STEM_SPLITTER_URL });
  nextApps.push({ id: "video-compressor", name: videoCompressor?.name || "Video Compressor", launchUrl: videoCompressor?.launchUrl || VIDEO_COMPRESSOR_URL });
  nextApps.push({ id: "ga-report-bridge", name: gaReportBridge?.name || "Analytica", launchUrl: gaReportBridge?.launchUrl || GA_REPORT_BRIDGE_URL });

  return nextApps;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isSharedAppId(appId: string): boolean {
  return DEFAULT_AUTO_ATTACH_APP_IDS.includes(appId as (typeof DEFAULT_AUTO_ATTACH_APP_IDS)[number]);
}

function orderAppIds(appIds: string[], availableApps: MiniApp[]): string[] {
  const availableAppIds = new Set(availableApps.map((app) => app.id));
  const uniqueAppIds = appIds.filter((appId, index) => availableAppIds.has(appId) && appIds.indexOf(appId) === index);
  const customerSpecificAppIds = uniqueAppIds.filter((appId) => !isSharedAppId(appId));
  const sharedOrderedAppIds = SHARED_APP_DISPLAY_ORDER.filter((appId) => uniqueAppIds.includes(appId));
  const sharedRemainderAppIds = uniqueAppIds.filter(
    (appId) => isSharedAppId(appId) && !SHARED_APP_DISPLAY_ORDER.includes(appId as (typeof SHARED_APP_DISPLAY_ORDER)[number])
  );

  return [...customerSpecificAppIds, ...sharedOrderedAppIds, ...sharedRemainderAppIds];
}

function buildAppLaunchUrl(app: MiniApp, customer: Customer | undefined): string {
  if (app.id !== "qr-generator" || !customer) {
    return app.launchUrl;
  }

  const url = new URL(app.launchUrl, window.location.href);
  url.searchParams.set("customerId", customer.id);
  url.searchParams.set("customerName", customer.name);
  url.searchParams.set("customerCity", customer.city);
  return url.toString();
}

export default function App() {
  const [customers, setCustomers] = useState<Customer[]>(() => readStoredValue(CUSTOMERS_STORAGE_KEY, INTERNAL_CUSTOMERS));
  const [apps, setApps] = useState<MiniApp[]>(() => normalizeApps(readStoredValue<MiniApp[]>(APPS_STORAGE_KEY, INTERNAL_APPS)));
  const [customerApps, setCustomerApps] = useState<CustomerAppMap>(() =>
    readStoredValue<CustomerAppMap>(CUSTOMER_APPS_STORAGE_KEY, initialCustomerApps)
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() =>
    readStoredValue(SELECTED_CUSTOMER_STORAGE_KEY, INTERNAL_CUSTOMERS[0]?.id ?? "")
  );
  const [customerName, setCustomerName] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerCity, setEditCustomerCity] = useState("");
  const [customerEditMessage, setCustomerEditMessage] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("grid");
  const [adminPin, setAdminPin] = useState("");
  const [adminVerified, setAdminVerified] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? customers[0],
    [customers, selectedCustomerId]
  );
  const selectedCustomerApps = useMemo(() => {
    if (!selectedCustomer) return [];

    const appIds = orderAppIds(customerApps[selectedCustomer.id] ?? [], apps);
    return appIds
      .map((appId) => apps.find((app) => app.id === appId))
      .filter((app): app is MiniApp => Boolean(app));
  }, [customerApps, apps, selectedCustomer]);
  const gridItems = useMemo(() => {
    const slotCount = Math.max(MIN_GRID_SLOT_COUNT, selectedCustomerApps.length);
    return Array.from({ length: slotCount }, (_, index) => ({
      app: selectedCustomerApps[index] ?? null,
      key: selectedCustomerApps[index]?.id ?? `placeholder-${selectedCustomer?.id ?? "empty"}-${index}`,
    }));
  }, [selectedCustomer, selectedCustomerApps]);

  useEffect(() => {
    window.localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    window.localStorage.setItem(APPS_STORAGE_KEY, JSON.stringify(apps));
  }, [apps]);

  useEffect(() => {
    window.localStorage.setItem(CUSTOMER_APPS_STORAGE_KEY, JSON.stringify(customerApps));
  }, [customerApps]);

  useEffect(() => {
    if (customers.length === 0) {
      setSelectedCustomerId("");
      window.localStorage.removeItem(SELECTED_CUSTOMER_STORAGE_KEY);
      return;
    }

    const selectedStillExists = customers.some((customer) => customer.id === selectedCustomerId);
    const nextSelectedCustomerId = selectedStillExists ? selectedCustomerId : customers[0].id;

    if (nextSelectedCustomerId !== selectedCustomerId) {
      setSelectedCustomerId(nextSelectedCustomerId);
      return;
    }

    window.localStorage.setItem(SELECTED_CUSTOMER_STORAGE_KEY, nextSelectedCustomerId);
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    setEditCustomerName(selectedCustomer?.name ?? "");
    setEditCustomerCity(selectedCustomer?.city ?? "");
    setCustomerEditMessage("");
  }, [selectedCustomer]);

  useEffect(() => {
    setCustomerApps((current) => {
      const availableAppIds = new Set(apps.map((app) => app.id));
      const autoAttachAppIds = DEFAULT_AUTO_ATTACH_APP_IDS.filter((appId) => availableAppIds.has(appId));
      const nextCustomerApps = Object.fromEntries(
        customers.map((customer) => {
          const currentAppIds = current[customer.id] ?? [];
          const filteredAppIds = currentAppIds.filter((appId) => availableAppIds.has(appId));
          const normalizedAppIds = [...filteredAppIds];
          autoAttachAppIds.forEach((appId) => {
            if (!normalizedAppIds.includes(appId)) {
              normalizedAppIds.push(appId);
            }
          });

          return [customer.id, orderAppIds(normalizedAppIds, apps)];
        })
      );

      const sameKeys =
        Object.keys(current).length === Object.keys(nextCustomerApps).length &&
        Object.keys(nextCustomerApps).every((customerId) => arraysEqual(current[customerId] ?? [], nextCustomerApps[customerId]));

      return sameKeys ? current : nextCustomerApps;
    });
  }, [apps, customers]);

  function handleCreateCustomer(): void {
    const trimmedName = customerName.trim();
    if (!trimmedName) return;

    const nextCustomer: Customer = {
      id: crypto.randomUUID(),
      name: trimmedName,
      city: customerCity.trim() || "Etiket yok",
    };

    setCustomers((current) => [...current, nextCustomer]);
    setCustomerApps((current) => ({
      ...current,
      [nextCustomer.id]: orderAppIds(
        apps.filter((app) => DEFAULT_AUTO_ATTACH_APP_IDS.includes(app.id as (typeof DEFAULT_AUTO_ATTACH_APP_IDS)[number])).map((app) => app.id),
        apps
      ),
    }));
    setSelectedCustomerId(nextCustomer.id);
    setCustomerName("");
    setCustomerCity("");
  }

  function openDangerZone(): void {
    setWorkspaceMode("danger");
    setAdminPin("");
    setAdminVerified(false);
    setAdminError("");
    setPendingDelete(null);
  }

  function closeDangerZone(): void {
    setWorkspaceMode("grid");
    setAdminPin("");
    setAdminVerified(false);
    setAdminError("");
    setPendingDelete(null);
  }

  async function handleVerifyPin(): Promise<void> {
    try {
      const digest = await sha256Hex(adminPin);
      if (digest === ADMIN_PIN_HASH) {
        setAdminVerified(true);
        setAdminError("");
        return;
      }

      setAdminVerified(false);
      setAdminError("PIN hatalı.");
    } catch (error) {
      setAdminVerified(false);
      setAdminError(error instanceof Error ? error.message : "PIN doğrulaması çalıştırılamadı.");
    }
  }

  function handleDeleteCustomer(customerId: string): void {
    const nextCustomers = customers.filter((customer) => customer.id !== customerId);
    setCustomers(nextCustomers);
    setCustomerApps((current) => {
      const nextCustomerApps = { ...current };
      delete nextCustomerApps[customerId];
      return nextCustomerApps;
    });
  }

  function handleDeleteApp(appId: string): void {
    setApps((current) => current.filter((app) => app.id !== appId));
    setCustomerApps((current) =>
      Object.fromEntries(
        Object.entries(current).map(([customerId, appIds]) => [customerId, appIds.filter((linkedAppId) => linkedAppId !== appId)])
      )
    );
  }

  function handleUpdateSelectedCustomer(): void {
    if (!selectedCustomer) return;

    const trimmedName = editCustomerName.trim();
    const trimmedCity = editCustomerCity.trim();
    if (!trimmedName) return;

    setCustomers((current) =>
      current.map((customer) =>
        customer.id === selectedCustomer.id
          ? { ...customer, name: trimmedName, city: trimmedCity || "Etiket yok" }
          : customer
      )
    );
    setCustomerEditMessage("Müşteri bilgileri güncellendi.");
  }

  function confirmPendingDelete(): void {
    if (!pendingDelete) return;

    if (pendingDelete.kind === "customer") {
      handleDeleteCustomer(pendingDelete.id);
    } else {
      handleDeleteApp(pendingDelete.id);
    }

    setPendingDelete(null);
  }

  function renderWorkspaceGrid() {
    return (
      <div className="app-grid">
        {gridItems.map(({ app, key }) => (
          <article key={key} className={`app-card ${app ? "is-primary" : "is-placeholder"}`}>
            {app ? (
              <a
                className="app-card-link"
                href={buildAppLaunchUrl(app, selectedCustomer)}
                target="_blank"
                rel="noreferrer"
                aria-label={`${app.name} uygulamasını yeni sekmede aç`}
                onClick={() => trackMiniappsEvent("tool_open", {
                  app_id: app.id,
                  app_version: DEFAULT_PACK_VERSION,
                  shell_version: DEFAULT_PACK_VERSION,
                  source: "home_grid",
                  page_language: "tr",
                  tool_id: app.id,
                  tool_name: app.name,
                  shell_variant: "local",
                  workspace_id: selectedCustomer?.id || "default",
                })}
              >
                {renderAppCard(app)}
              </a>
            ) : (
              <div className="placeholder-copy" aria-hidden="true" />
            )}
          </article>
        ))}
      </div>
    );
  }

  function renderDangerZone() {
    return (
      <section className="danger-zone">
        <div className="danger-zone-header">
          <div>
            <h2>Müşteri veya APP Düzenle</h2>
            <p>Bu alan müşteri düzenleme ve APP yönetimi için PIN korumalıdır.</p>
          </div>
          <button type="button" className="danger-zone-back" onClick={closeDangerZone}>
            Geri Dön
          </button>
        </div>

        {!adminVerified ? (
          <div className="danger-pin-card">
            <h3>PIN Doğrulama</h3>
            <p>Devam etmek için yönetici PIN'ini gir.</p>
            <input
              type="password"
              value={adminPin}
              onChange={(event) => setAdminPin(event.target.value)}
              placeholder="PIN"
            />
            {adminError ? <span className="danger-error">{adminError}</span> : null}
            <div className="danger-actions">
              <button type="button" className="danger-confirm" onClick={handleVerifyPin}>
                Doğrula
              </button>
              <button type="button" className="danger-cancel" onClick={closeDangerZone}>
                Vazgeç
              </button>
            </div>
          </div>
        ) : (
          <div className="danger-management">
            <article className="danger-panel">
              <h3>Seçili Müşteriyi Düzenle</h3>
              <p>Ad ve açıklama bilgisini bu alandan güncelleyebilirsin.</p>
              <label className="danger-field">
                <span>Müşteri Adı</span>
                <input
                  type="text"
                  value={editCustomerName}
                  onChange={(event) => {
                    setEditCustomerName(event.target.value);
                    setCustomerEditMessage("");
                  }}
                  placeholder="Müşteri adı"
                />
              </label>
              <label className="danger-field">
                <span>Açıklama / Etiket</span>
                <input
                  type="text"
                  value={editCustomerCity}
                  onChange={(event) => {
                    setEditCustomerCity(event.target.value);
                    setCustomerEditMessage("");
                  }}
                  placeholder="Şehir veya etiket"
                />
              </label>
              {customerEditMessage ? <span className="danger-success">{customerEditMessage}</span> : null}
              <button
                type="button"
                className="danger-confirm"
                onClick={handleUpdateSelectedCustomer}
                disabled={!selectedCustomer}
              >
                Müşteriyi Güncelle
              </button>
            </article>

            <article className="danger-panel">
              <h3>Seçili Müşteriyi Sil</h3>
              <p>{selectedCustomer?.name ?? "Müşteri yok"}</p>
              <button
                type="button"
                className="danger-delete"
                onClick={() =>
                  selectedCustomer
                    ? setPendingDelete({ kind: "customer", id: selectedCustomer.id, name: selectedCustomer.name })
                    : undefined
                }
                disabled={!selectedCustomer}
              >
                Müşteriyi Sil
              </button>
            </article>

            <article className="danger-panel danger-panel-wide">
              <h3>APP Listesi</h3>
              <div className="danger-app-list">
                {apps.length === 0 ? (
                  <p className="danger-empty">Silinecek APP kalmadı.</p>
                ) : (
                  apps.map((app) => (
                    <div key={app.id} className="danger-app-row">
                      <span>{app.name}</span>
                      <button
                        type="button"
                        className="danger-delete"
                        onClick={() => setPendingDelete({ kind: "app", id: app.id, name: app.name })}
                      >
                        APP Sil
                      </button>
                    </div>
                  ))
                )}
              </div>
            </article>
          </div>
        )}
      </section>
    );
  }

  function renderAppCard(app: MiniApp) {
    if (app.id === "weekly-bulletin") return <img className="app-card-art" src={assetUrl("filtre-card.svg")} alt="Filtre Kartı" />;
    if (app.id === "qr-generator") return <img className="app-card-art" src={assetUrl("qr-generator-card.svg")} alt="QR Generator Kartı" />;
    if (app.id === "pdf-toolkit") return <img className="app-card-art" src={assetUrl("pdf-toolkit-card.svg")} alt="PDF Toolkit Kartı" />;
    if (app.id === "image-toolkit") return <img className="app-card-art" src={assetUrl("image-toolkit-card.svg")} alt="Image Toolkit Kartı" />;
    if (app.id === "video-to-audio") return <img className="app-card-art" src={assetUrl("video-to-audio-card.svg")} alt="Video to Audio Kartı" />;
    if (app.id === "csv-toolkit") return <img className="app-card-art" src={assetUrl("csv-toolkit-card.svg")} alt="CSV Toolkit Kartı" />;
    if (app.id === "bg-remover") return <img className="app-card-art" src={assetUrl("bg-remover-card.svg")} alt="BG Remover Kartı" />;
    if (app.id === "audio-editor") return <img className="app-card-art" src={assetUrl("audio-editor-card.svg")} alt="Audio Editor Kartı" />;
    if (app.id === "exif-cleaner") return <img className="app-card-art" src={assetUrl("exif-cleaner-card.svg")} alt="EXIF Cleaner Kartı" />;
    if (app.id === "image-format-converter") return <img className="app-card-art" src={assetUrl("image-format-converter-card.svg")} alt="Image Format Converter Kartı" />;
    if (app.id === "dev-toolkit") return <img className="app-card-art" src={assetUrl("dev-toolkit-card.svg")} alt="Dev Toolkit Kartı" />;
    if (app.id === "stem-splitter") return <img className="app-card-art" src={assetUrl("stem-splitter-card.svg")} alt="Stem Splitter Kartı" />;
    if (app.id === "video-compressor") return <img className="app-card-art" src={assetUrl("video-compressor-card.svg")} alt="Video Compressor Kartı" />;
    if (app.id === "ga-report-bridge") return <img className="app-card-art" src={assetUrl("ga-report-bridge-card.svg")} alt="Analytica Kartı" />;

    return (
      <div className="app-card-fallback">
        <strong>{app.name}</strong>
        <span>Launch</span>
      </div>
    );
  }

  return (
    <main className="miniapps-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="brand-logo" src={assetUrl("miniapps-logo.svg")} alt="miniapps" />
        </div>

        <section className="customer-create-card">
          <label className="sidebar-field">
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Yeni Müşteri"
            />
          </label>
          <label className="sidebar-field">
            <input
              value={customerCity}
              onChange={(event) => setCustomerCity(event.target.value)}
              placeholder="Şehir veya Etiket"
            />
          </label>
          <button type="button" className="create-button" onClick={handleCreateCustomer}>
            Oluştur
          </button>
        </section>

        <section className="customer-list">
          {customers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              className={`customer-list-item ${customer.id === selectedCustomerId ? "is-active" : ""}`}
              onClick={() => setSelectedCustomerId(customer.id)}
            >
              <strong>{customer.name}</strong>
              <span>{customer.city}</span>
            </button>
          ))}
        </section>

        <button type="button" className="danger-entry" onClick={openDangerZone}>
          Müşteri veya APP Düzenle
        </button>

        <div className="sidebar-version" aria-label="Sürüm bilgisi">
          <span>{DEFAULT_PACK_LABEL} {DEFAULT_PACK_VERSION}</span>
          <span>{DEFAULT_AUTHOR_LABEL}</span>
        </div>
      </aside>

      <section className="workspace">
        {workspaceMode === "grid" ? renderWorkspaceGrid() : renderDangerZone()}
      </section>

      {pendingDelete ? (
        <div className="danger-modal-backdrop" role="presentation" onClick={() => setPendingDelete(null)}>
          <div className="danger-confirm-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>Emin misiniz?</h3>
            <p>
              {pendingDelete.kind === "customer"
                ? `"${pendingDelete.name}" müşterisi silinecek.`
                : `"${pendingDelete.name}" APP'i silinecek.`}
            </p>
            <div className="danger-actions">
              <button type="button" className="danger-delete" onClick={confirmPendingDelete}>
                Evet, Sil
              </button>
              <button type="button" className="danger-cancel" onClick={() => setPendingDelete(null)}>
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
