import { type MouseEvent, useEffect, useMemo, useState } from "react";

type MiniApp = {
  id: string;
  name: string;
  launchUrl: string;
};

type DistributionConfig = {
  packLabel?: string;
  packVersion?: string;
  authorLabel?: string;
  visibleAppIds?: string[];
  hiddenAppIds?: string[];
  launchUrlOverrides?: Record<string, string>;
};

type ShellLanguage = "tr" | "en";

function trackMiniappsEvent(eventName: string, params: Record<string, string | number | boolean> = {}): void {
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) return;

  const gtag = (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag;
  gtag?.("event", eventName, params);
}

function assetUrl(fileName: string): string {
  const url = `${import.meta.env.BASE_URL}assets/${fileName}`;
  return fileName.endsWith("-card.svg") ? `${url}?v=${DEFAULT_PACK_VERSION}` : url;
}

const OFFLINE_READY_APPS_STORAGE_KEY = "miniapps.distribution.offlineReadyApps";
const SHELL_LANGUAGE_STORAGE_KEY = "miniapps.distribution.language";
const DEFAULT_PACK_LABEL = "miniapps pack";
const DEFAULT_PACK_VERSION = "2026.2.0";
const DEFAULT_AUTHOR_LABEL = "by y.e.a.";

const defaultApps: MiniApp[] = [
  { id: "pdf-toolkit", name: "PDF Toolkit", launchUrl: "http://127.0.0.1:4313/" },
  { id: "csv-toolkit", name: "CSV Toolkit", launchUrl: "http://127.0.0.1:4317/" },
  { id: "qr-generator", name: "QR Generator", launchUrl: "http://127.0.0.1:4312/" },
  { id: "image-toolkit", name: "Image Toolkit", launchUrl: "http://127.0.0.1:4315/" },
  { id: "exif-cleaner", name: "EXIF Cleaner", launchUrl: "http://127.0.0.1:4321/" },
  { id: "image-format-converter", name: "Format Converter", launchUrl: "http://127.0.0.1:4322/" },
  { id: "bg-remover", name: "BG Remover", launchUrl: "http://127.0.0.1:4318/" },
  { id: "video-to-audio", name: "Video to Audio", launchUrl: "http://127.0.0.1:4316/" },
  { id: "audio-editor", name: "Audio Editor", launchUrl: "http://127.0.0.1:4320/" },
  { id: "stem-splitter", name: "Stem Splitter", launchUrl: "http://127.0.0.1:4194/" },
  { id: "dev-toolkit", name: "Dev Toolkit", launchUrl: "http://127.0.0.1:4323/" },
  { id: "video-compressor", name: "Video Compressor", launchUrl: "http://127.0.0.1:4324/" },
  { id: "ga-report-bridge", name: "Analytica", launchUrl: "http://127.0.0.1:4326/" },
];

const shellCopy = {
  tr: {
    appOpenSuffix: "uygulamasını yeni sekmede aç",
    languageLabel: "Dil",
    manifestoLabel: "Manifesto",
  },
  en: {
    appOpenSuffix: "app in a new tab",
    languageLabel: "Language",
    manifestoLabel: "Manifesto",
  },
} satisfies Record<ShellLanguage, { appOpenSuffix: string; languageLabel: string; manifestoLabel: string }>;

const appDescriptions = {
  tr: {
    "pdf-toolkit": "PDF sıkıştır, böl, birleştir ve düzenle.",
    "csv-toolkit": "CSV dosyalarını temizle, filtrele ve dışa aktar.",
    "qr-generator": "Link, Wi-Fi ve iletişim için QR kod oluştur.",
    "image-toolkit": "Görselleri yeniden boyutlandır ve optimize et.",
    "exif-cleaner": "Fotoğraflardaki EXIF verilerini temizle.",
    "image-format-converter": "Görselleri JPG, PNG ve WebP formatlarına çevir.",
    "bg-remover": "Görsel arka planlarını hızlıca kaldır.",
    "video-to-audio": "Videolardan ses dosyası çıkar.",
    "video-compressor": "Videoları sıkıştır, kes ve düzenle.",
    "audio-editor": "Ses dosyalarını kırp, dönüştür ve dışa aktar.",
    "stem-splitter": "Vokali ayır ve ses parçalarını çıkar.",
    "dev-toolkit": "Geliştirici araçlarını tek yerde kullan.",
    "ga-report-bridge": "GA4 raporlarını arşivle ve analiz et.",
  },
  en: {
    "pdf-toolkit": "Compress, split, merge and edit PDF files.",
    "csv-toolkit": "Clean, filter and export CSV files.",
    "qr-generator": "Create QR codes for links, Wi-Fi and contacts.",
    "image-toolkit": "Resize and optimize images in your browser.",
    "exif-cleaner": "Remove EXIF metadata from photos.",
    "image-format-converter": "Convert images to JPG, PNG and WebP.",
    "bg-remover": "Remove image backgrounds quickly.",
    "video-to-audio": "Extract audio files from videos.",
    "video-compressor": "Compress, trim and edit videos.",
    "audio-editor": "Trim, convert and export audio files.",
    "stem-splitter": "Separate vocals and extract audio stems.",
    "dev-toolkit": "Use developer utilities in one place.",
    "ga-report-bridge": "Archive and analyze GA4 reports.",
  },
} satisfies Record<ShellLanguage, Record<string, string>>;

function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readInitialOfflineState(): boolean {
  if (typeof navigator === "undefined") return false;
  return !navigator.onLine;
}

function applyDistributionConfig(apps: MiniApp[], config: DistributionConfig | null): MiniApp[] {
  if (!config?.launchUrlOverrides) return apps;

  return apps.map((app) => ({
    ...app,
    launchUrl: config.launchUrlOverrides?.[app.id] || app.launchUrl,
  }));
}

function getVisibleApps(apps: MiniApp[], config: DistributionConfig | null): MiniApp[] {
  const availableIds = new Set(apps.map((app) => app.id));
  const hiddenIds = new Set(config?.hiddenAppIds ?? []);
  const visibleIds =
    config?.visibleAppIds?.filter((appId) => availableIds.has(appId) && !hiddenIds.has(appId)) ??
    apps.filter((app) => !hiddenIds.has(app.id)).map((app) => app.id);

  return visibleIds
    .map((appId) => apps.find((app) => app.id === appId))
    .filter((app): app is MiniApp => Boolean(app));
}

function getLocalizedLaunchUrl(app: MiniApp, language: ShellLanguage): string {
  if (language !== "en") {
    return app.launchUrl;
  }

  if (app.launchUrl.startsWith("./apps/")) {
    return app.launchUrl.replace("./apps/", "./apps-en/");
  }

  return app.launchUrl;
}

function renderAppCardArt(app: MiniApp, language: ShellLanguage) {
  const suffix = language === "tr" ? "Kartı" : "Card";

  switch (app.id) {
    case "qr-generator":
      return <img className="app-card-art" src={assetUrl("qr-generator-card.svg")} alt={`QR Generator ${suffix}`} />;
    case "pdf-toolkit":
      return <img className="app-card-art" src={assetUrl("pdf-toolkit-card.svg")} alt={`PDF Toolkit ${suffix}`} />;
    case "image-toolkit":
      return <img className="app-card-art" src={assetUrl("image-toolkit-card.svg")} alt={`Image Toolkit ${suffix}`} />;
    case "video-to-audio":
      return <img className="app-card-art" src={assetUrl("video-to-audio-card.svg")} alt={`Video to Audio ${suffix}`} />;
    case "csv-toolkit":
      return <img className="app-card-art" src={assetUrl("csv-toolkit-card.svg")} alt={`CSV Toolkit ${suffix}`} />;
    case "bg-remover":
      return <img className="app-card-art" src={assetUrl("bg-remover-card.svg")} alt={`BG Remover ${suffix}`} />;
    case "audio-editor":
      return <img className="app-card-art" src={assetUrl("audio-editor-card.svg")} alt={`Audio Editor ${suffix}`} />;
    case "exif-cleaner":
      return <img className="app-card-art" src={assetUrl("exif-cleaner-card.svg")} alt={`EXIF Cleaner ${suffix}`} />;
    case "image-format-converter":
      return <img className="app-card-art" src={assetUrl("image-format-converter-card.svg")} alt={`Image Format Converter ${suffix}`} />;
    case "dev-toolkit":
      return <img className="app-card-art" src={assetUrl("dev-toolkit-card.svg")} alt={`Dev Toolkit ${suffix}`} />;
    case "stem-splitter":
      return <img className="app-card-art" src={assetUrl("stem-splitter-card.svg")} alt={`Stem Splitter ${suffix}`} />;
    case "video-compressor":
      return <img className="app-card-art" src={assetUrl("video-compressor-card.svg")} alt={`Video Compressor ${suffix}`} />;
    case "ga-report-bridge":
      return <img className="app-card-art" src={assetUrl("ga-report-bridge-card.svg")} alt={`Analytica ${suffix}`} />;
    default:
      return (
        <div className="app-card-fallback">
          <strong>{app.name}</strong>
          <span>Launch</span>
        </div>
      );
  }
}

export default function DistributionApp() {
  const [distributionConfig, setDistributionConfig] = useState<DistributionConfig | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(readInitialOfflineState);
  const [offlineReadyAppIds, setOfflineReadyAppIds] = useState<string[]>(() =>
    readStoredValue<string[]>(OFFLINE_READY_APPS_STORAGE_KEY, [])
  );
  const [shellLanguage, setShellLanguage] = useState<ShellLanguage>(() =>
    readStoredValue<ShellLanguage>(SHELL_LANGUAGE_STORAGE_KEY, "tr")
  );

  const copy = shellCopy[shellLanguage];
  const effectiveApps = useMemo(() => applyDistributionConfig(defaultApps, distributionConfig), [distributionConfig]);
  const distributionApps = useMemo(() => getVisibleApps(effectiveApps, distributionConfig), [distributionConfig, effectiveApps]);
  const offlineReadySet = useMemo(() => new Set(offlineReadyAppIds), [offlineReadyAppIds]);
  const distributionPackLine = useMemo(
    () => `${distributionConfig?.packLabel ?? DEFAULT_PACK_LABEL} ${distributionConfig?.packVersion ?? DEFAULT_PACK_VERSION}`,
    [distributionConfig]
  );
  const distributionAuthorLine = distributionConfig?.authorLabel ?? DEFAULT_AUTHOR_LABEL;
  const manifestoUrl = shellLanguage === "en" ? "./manifesto-en/" : "./manifesto/";
  const descriptions: Record<string, string> = appDescriptions[shellLanguage];

  useEffect(() => {
    let cancelled = false;

    fetch("./distribution-config.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Config unavailable: ${response.status}`);
        }
        return (await response.json()) as DistributionConfig;
      })
      .then((config) => {
        if (!cancelled) {
          setDistributionConfig(config);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDistributionConfig(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(OFFLINE_READY_APPS_STORAGE_KEY, JSON.stringify(offlineReadyAppIds));
  }, [offlineReadyAppIds]);

  useEffect(() => {
    window.localStorage.setItem(SHELL_LANGUAGE_STORAGE_KEY, JSON.stringify(shellLanguage));
    document.documentElement.lang = shellLanguage;
  }, [shellLanguage]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  function markAppOfflineReady(appId: string) {
    setOfflineReadyAppIds((current) => (current.includes(appId) ? current : [...current, appId]));
  }

  function handleLaunchApp(event: MouseEvent<HTMLAnchorElement>, app: MiniApp) {
    trackMiniappsEvent("tool_open", {
      app_id: app.id,
      app_version: distributionConfig?.packVersion ?? DEFAULT_PACK_VERSION,
      shell_version: distributionConfig?.packVersion ?? DEFAULT_PACK_VERSION,
      source: "home_grid",
      page_language: shellLanguage,
      tool_id: app.id,
      tool_name: app.name,
      shell_variant: "distribution",
      language: shellLanguage,
    });

    const isOfflineReady = offlineReadySet.has(app.id);

    if (isOffline && !isOfflineReady) {
      event.preventDefault();
      return;
    }

    if (!isOfflineReady) {
      markAppOfflineReady(app.id);
      return;
    }
  }

  function handleTooltipMove(event: MouseEvent<HTMLAnchorElement>) {
    const shouldOpenLeft = event.clientX > window.innerWidth - 280;

    event.currentTarget.style.setProperty("--tooltip-x", `${event.clientX}px`);
    event.currentTarget.style.setProperty("--tooltip-y", `${event.clientY}px`);
    event.currentTarget.style.setProperty("--tooltip-offset-x", shouldOpenLeft ? "calc(-100% - 14px)" : "14px");
  }

  return (
    <main className="miniapps-shell is-distribution">
      <section className="workspace distribution-workspace">
        <div className="app-grid">
          {distributionApps.map((app) => (
            <article key={app.id} className="app-card is-primary">
              <a
                className="app-card-link"
                href={getLocalizedLaunchUrl(app, shellLanguage)}
                target="_blank"
                rel="noreferrer"
                aria-label={`${app.name} ${copy.appOpenSuffix}`}
                data-tooltip={descriptions[app.id] ?? app.name}
                onMouseMove={handleTooltipMove}
                onClick={(event) => handleLaunchApp(event, app)}
              >
                {renderAppCardArt(app, shellLanguage)}
              </a>
            </article>
          ))}
        </div>
      </section>
      <footer className="distribution-header">
        <div className="distribution-brand">
          <img className="brand-logo" src={assetUrl("miniapps-logo.svg")} alt="miniapps" />
        </div>
        <div className="distribution-version" aria-label="Sürüm bilgisi">
          <span>{distributionPackLine}</span>
          <a
            className="distribution-author-link"
            href="https://yemreatasayar.com/"
            target="_blank"
            rel="noreferrer"
            aria-label="y.e.a. website"
          >
            {distributionAuthorLine}
          </a>
        </div>
        <div className="distribution-controls" aria-label={copy.languageLabel}>
          <a className="distribution-link-button" href={manifestoUrl}>
            {copy.manifestoLabel}
          </a>
          <div className="distribution-language-group">
            <button
              type="button"
              className={`language-switch-button ${shellLanguage === "tr" ? "is-active" : ""}`}
              onClick={() => setShellLanguage("tr")}
              aria-pressed={shellLanguage === "tr"}
            >
              TR
            </button>
            <button
              type="button"
              className={`language-switch-button ${shellLanguage === "en" ? "is-active" : ""}`}
              onClick={() => setShellLanguage("en")}
              aria-pressed={shellLanguage === "en"}
            >
              ENG
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
