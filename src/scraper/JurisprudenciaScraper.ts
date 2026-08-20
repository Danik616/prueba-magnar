import { HttpClient } from "../http/HttpClient";
import { ResultsPaginator } from "./ResultsPaginator";
import { PageParser } from "./PageParser";
import { PdfDownloader } from "../downloader/PdfDownloader";
import { StateManager } from "../storage/StateManager";
import { config } from "../config";
import { logger } from "../utils/logger";

/** Orquestador secuencial: recorre toda la paginación, guarda checkpoints y descarga los PDFs. */
export class JurisprudenciaScraper {
  private http = new HttpClient();
  private paginator = new ResultsPaginator(this.http);
  private state = new StateManager();
  private downloader = new PdfDownloader(this.http, this.state);

  async scrape(): Promise<void> {
    let page = this.state.lastPage;
    let current = await this.paginator.openSession();

    while (true) {
      const targetPage = page + 1;
      if (targetPage > 1) {
        current = await this.paginator.fetchPage(current, targetPage);
      }

      const documents = PageParser.parseResultsPage(current.html, targetPage);
      this.state.appendDocuments(documents);
      this.state.markPageDone(targetPage);
      page = targetPage;

      const totalPages = current.pagination.totalPages;
      logger.progress(page, totalPages ?? page, "Páginas scrapeadas");

      const reachedConfigLimit = config.maxPages > 0 && page >= config.maxPages;
      const reachedLastPage = totalPages !== null && page >= totalPages;
      if (reachedConfigLimit || reachedLastPage) break;

      const docLimit = config.maxDocuments;
      if (docLimit > 0 && this.state.loadAllDocuments().length >= docLimit) break;
    }
  }

  async download(): Promise<void> {
    await this.downloader.downloadAll(this.state.loadAllDocuments());
  }

  async retry(): Promise<void> {
    await this.downloader.retryFailed();
  }

  async run(): Promise<void> {
    await this.scrape();
    await this.download();
    await this.retry();
  }
}
