export type BackendHealth = {
  ok: boolean;
  ffmpegInstalled: boolean;
  pythonBin: string;
  model: string;
  warmup: {
    status: "pending" | "running" | "ready" | "error";
    message: string;
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

const API_BASE = "http://127.0.0.1:4195";

export async function fetchBackendHealth(): Promise<BackendHealth> {
  const response = await fetch(`${API_BASE}/api/health`);
  if (!response.ok) {
    throw new Error("Backend sağlık kontrolü alınamadı.");
  }
  return response.json();
}

export async function startSplitJob(file: File): Promise<{ jobId: string }> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_BASE}/api/split`, {
    method: "POST",
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Split job başlatılamadı.");
  }

  return data;
}

export async function fetchJob(jobId: string): Promise<JobStatus> {
  const response = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Job durumu alınamadı.");
  }

  return data;
}

export async function cancelSplitJob(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/jobs/${jobId}/cancel`, {
    method: "POST",
  });

  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Job iptal edilemedi.");
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
