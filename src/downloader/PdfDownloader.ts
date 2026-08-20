import fs from "fs";
import path from "path";
import { HttpClient } from "../http/HttpClient";
import { StateManager } from "../storage/StateManager";
import { DocumentRecord } from "../types";
import { config } from "../config";
import { logger } from "../utils/logger";
import { sanitizeFilename } from "../utils/delay";

/** Descarga los PDFs de una lista de documentos, valida el header %PDF- y registra los fallos para reintentar. */
export class PdfDownloader {
  constructor(private http: HttpClient, private state: StateManager) {}

  private buildFileName(doc: DocumentRecord): string {
    return sanitizeFilename(`${doc.expediente}_${doc.titulo}_${doc.fecha}`) + ".pdf";
  }

  private isValidPdf(filePath: string): boolean {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(5);
    fs.readSync(fd, buffer, 0, 5, 0);
    fs.closeSync(fd);
    return buffer.toString("ascii") === "%PDF-";
  }

  async downloadOne(doc: DocumentRecord): Promise<void> {
    if (!doc.pdfUrl) return;

    const fileName = this.buildFileName(doc);
    const destPath = path.join(config.paths.pdfsDir, fileName);

    if (fs.existsSync(destPath)) {
      logger.info(`PDF ya existe, se omite: ${fileName}`);
      this.state.markDownloadOk(doc.id, destPath);
      return;
    }

    try {
      await this.http.downloadFile(doc.pdfUrl, destPath);
      if (!this.isValidPdf(destPath)) {
        fs.unlinkSync(destPath);
        throw new Error("El archivo descargado no tiene header %PDF- válido");
      }
      logger.info(`PDF descargado: ${fileName}`);
      this.state.markDownloadOk(doc.id, destPath);
    } catch (err) {
      logger.error(`Falló la descarga de ${fileName}`, { error: (err as Error).message });
      this.state.markDownloadFailed({
        documentId: doc.id,
        pdfUrl: doc.pdfUrl,
        fileName,
        attempts: 1,
        lastError: (err as Error).message,
      });
    }
  }

  async downloadAll(documents: DocumentRecord[]): Promise<void> {
    const pending = documents.filter((d) => d.pdfUrl && !d.pdfPath);
    for (let i = 0; i < pending.length; i++) {
      logger.progress(i + 1, pending.length, "Descarga de PDFs");
      await this.downloadOne(pending[i]);
    }
  }

  async retryFailed(): Promise<void> {
    const failed = [...this.state.failedDownloads];
    for (const task of failed) {
      const destPath = path.join(config.paths.pdfsDir, task.fileName);
      try {
        await this.http.downloadFile(task.pdfUrl, destPath);
        if (!this.isValidPdf(destPath)) {
          fs.unlinkSync(destPath);
          throw new Error("El archivo descargado no tiene header %PDF- válido");
        }
        this.state.markDownloadOk(task.documentId, destPath);
        logger.info(`Reintento OK: ${task.fileName}`);
      } catch (err) {
        this.state.markDownloadFailed({ ...task, attempts: task.attempts + 1, lastError: (err as Error).message });
        logger.error(`Reintento falló: ${task.fileName}`, { error: (err as Error).message });
      }
    }
  }
}
