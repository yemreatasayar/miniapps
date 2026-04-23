export type BackendHealth = {
  ok: boolean;
  ffmpegInstalled: boolean;
  ffmpegBin: string;
  pythonInstalled: boolean;
  pythonBin: string;
  model: string;
  warmup: {
    status: "pending" | "running" | "ready" | "error";
    message: string;
  };
  install: {
    helperVersion: string | null;
    platform: string;
    configPath: string;
    baseDir: string;
    allowedOrigins: string[];
  };
};

export type JobStatus = {
  id: string;
  status: "processing" | "done" | "error";
  error: string | null;
  fileName: string;
  progress: number;
  progressMessage: string | null;
  downloads: {
    vocals: string;
    instrumental: string;
  } | null;
};

type ApiErrorPayload = {
  error?: string;
  allowedOrigins?: string[];
};

export class ApiError extends Error {
  status: number | null;
  payload: ApiErrorPayload | null;
  isNetworkError: boolean;

  constructor(message: string, options: { status?: number | null; payload?: ApiErrorPayload | null; isNetworkError?: boolean } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? null;
    this.payload = options.payload ?? null;
    this.isNetworkError = options.isNetworkError ?? false;
  }
}

const API_BASE = import.meta.env.VITE_STEM_SPLITTER_API_BASE || "http://127.0.0.1:4195";

async function parseJson<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json() as Promise<T>;
}

async function apiRequest<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${input}`, init);
  } catch {
    throw new ApiError("Local helper erişilemedi. Helper kurulu değil, kapalı olabilir veya bu origin için izin verilmemiş olabilir.", {
      isNetworkError: true,
    });
  }

  const payload = await parseJson<T & ApiErrorPayload>(response);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "İstek tamamlanamadı.";

    throw new ApiError(message, {
      status: response.status,
      payload: (payload as ApiErrorPayload | null) ?? null,
    });
  }

  return payload as T;
}

export async function fetchBackendHealth(): Promise<BackendHealth> {
  return apiRequest<BackendHealth>("/api/health");
}

export async function startSplitJob(file: File): Promise<{ jobId: string }> {
  const body = new FormData();
  body.append("file", file);

  return apiRequest<{ jobId: string }>("/api/split", {
    method: "POST",
    body,
  });
}

export async function fetchJob(jobId: string): Promise<JobStatus> {
  return apiRequest<JobStatus>(`/api/jobs/${jobId}`);
}

export async function cancelSplitJob(jobId: string): Promise<void> {
  try {
    await apiRequest<{ ok: boolean }>(`/api/jobs/${jobId}/cancel`, {
      method: "POST",
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return;
    }
    throw error;
  }
}

export function cancelSplitJobOnUnload(jobId: string): void {
  void fetch(`${API_BASE}/api/jobs/${jobId}/cancel`, {
    method: "POST",
    keepalive: true,
  }).catch(() => {});
}

export function resolveDownloadUrl(relativeUrl: string): string {
  return `${API_BASE}${relativeUrl}`;
}
