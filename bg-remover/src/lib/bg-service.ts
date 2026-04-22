import { preload, removeBackground, type Config } from "@imgly/background-removal";

export type RemoveProgressCallback = (stage: string, progress: number) => void;

const DEFAULT_REMOTE_PUBLIC_PATH = "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/";

function resolveBgAssetPublicPath(): string {
  const configuredPath = import.meta.env.VITE_MINIAPPS_BG_PUBLIC_PATH;
  return configuredPath && configuredPath.trim().length > 0 ? configuredPath : DEFAULT_REMOTE_PUBLIC_PATH;
}

const BASE_CONFIG: Config = {
  // Use a deterministic asset origin instead of relying on the library default.
  // This keeps the web build predictable and lets us override it later if we host the model package ourselves.
  publicPath: resolveBgAssetPublicPath(),
  model: "isnet",
  output: {
    format: "image/png",
    quality: 1,
  },
  progress: undefined,
};

let preloadPromise: Promise<void> | null = null;

export function preloadBgAssets(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = preload(BASE_CONFIG).then(() => undefined);
  }
  return preloadPromise;
}

export async function removeBg(file: File, onProgress: RemoveProgressCallback): Promise<Blob> {
  await preloadBgAssets();

  const config: Config = {
    ...BASE_CONFIG,
    progress: (key: string, current: number, total: number) => {
      const rawPct = total > 0 ? current / total : 0;
      const pct = rawPct >= 1 ? 0.98 : rawPct;
      onProgress(key, pct);
    },
  };

  return await removeBackground(file, config);
}
