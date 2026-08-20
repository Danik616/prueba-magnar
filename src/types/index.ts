export interface DocumentRecord {
  id: string;
  expediente: string;
  titulo: string;
  fecha: string;
  pdfUrl: string | null;
  pdfPath: string | null;
  fields: Record<string, string>;
}

export interface DownloadTask {
  documentId: string;
  pdfUrl: string;
  fileName: string;
  attempts: number;
  lastError: string | null;
}

export interface ScraperState {
  lastPage: number;
  documentIds: string[];
  failedDownloads: DownloadTask[];
}

export type RunMode = "scrape" | "download" | "retry" | "full";
