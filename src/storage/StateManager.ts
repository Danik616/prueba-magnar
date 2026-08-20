import fs from "fs";
import path from "path";
import { DocumentRecord, DownloadTask, ScraperState } from "../types";
import { config } from "../config";

/**
 * Persiste el progreso a disco: un JSONL con un documento por línea (append-only)
 * y un JSON de estado (última página, ids ya vistos, descargas fallidas) para
 * poder retomar el scraping donde quedó si el proceso se corta.
 */
export class StateManager {
  private state: ScraperState;

  constructor() {
    fs.mkdirSync(config.paths.pdfsDir, { recursive: true });
    fs.mkdirSync(path.dirname(config.paths.stateJson), { recursive: true });
    this.state = this.loadState();
  }

  private loadState(): ScraperState {
    if (!fs.existsSync(config.paths.stateJson)) {
      return { lastPage: 0, documentIds: [], failedDownloads: [] };
    }
    return JSON.parse(fs.readFileSync(config.paths.stateJson, "utf-8"));
  }

  private saveState() {
    fs.writeFileSync(config.paths.stateJson, JSON.stringify(this.state, null, 2));
  }

  get lastPage(): number {
    return this.state.lastPage;
  }

  hasDocument(id: string): boolean {
    return this.state.documentIds.includes(id);
  }

  /** Descarta documentos ya vistos, tanto de una corrida anterior como duplicados dentro del mismo lote. */
  appendDocuments(documents: DocumentRecord[]) {
    const seenInBatch = new Set<string>();
    const fresh = documents.filter((d) => {
      if (this.hasDocument(d.id) || seenInBatch.has(d.id)) return false;
      seenInBatch.add(d.id);
      return true;
    });
    if (fresh.length === 0) return;
    const lines = fresh.map((doc) => JSON.stringify(doc)).join("\n") + "\n";
    fs.appendFileSync(config.paths.documentsJsonl, lines);
    this.state.documentIds.push(...fresh.map((d) => d.id));
  }

  markPageDone(page: number) {
    this.state.lastPage = page;
    this.saveState();
  }

  loadAllDocuments(): DocumentRecord[] {
    if (!fs.existsSync(config.paths.documentsJsonl)) return [];
    return fs
      .readFileSync(config.paths.documentsJsonl, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as DocumentRecord);
  }

  markDownloadOk(documentId: string, pdfPath: string) {
    const docs = this.loadAllDocuments().map((d) => (d.id === documentId ? { ...d, pdfPath } : d));
    fs.writeFileSync(config.paths.documentsJsonl, docs.map((d) => JSON.stringify(d)).join("\n") + "\n");
    this.state.failedDownloads = this.state.failedDownloads.filter((f) => f.documentId !== documentId);
    this.saveState();
  }

  markDownloadFailed(task: DownloadTask) {
    const existing = this.state.failedDownloads.find((f) => f.documentId === task.documentId);
    if (existing) {
      existing.attempts = task.attempts;
      existing.lastError = task.lastError;
    } else {
      this.state.failedDownloads.push(task);
    }
    this.saveState();
  }

  get failedDownloads(): DownloadTask[] {
    return this.state.failedDownloads;
  }
}
