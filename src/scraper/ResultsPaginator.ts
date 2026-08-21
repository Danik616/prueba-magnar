import { HttpClient } from "../http/HttpClient";
import { PageParser, PaginationInfo } from "./PageParser";
import { config } from "../config";
import { logger } from "../utils/logger";

// GET inicio.xhtml -> POST simulando el click en "Buscar" (302) -> GET
// resultado.xhtml (página 1) -> POST con el form completo + página + IR

export interface PageState {
  html: string;
  pagination: PaginationInfo;
}

export class ResultsPaginator {
  constructor(private http: HttpClient) {}

  async openSession(): Promise<PageState> {
    const html = await this.submitInitialSearch();
    return { html, pagination: PageParser.extractPaginationInfo(html) };
  }

  // si falla (viewstate vencido, típicamente), reabre sesión y reintenta una vez
  async fetchPage(current: PageState, targetPage: number): Promise<PageState> {
    let html: string;
    try {
      html = await this.requestNextPage(current, targetPage);
    } catch (err) {
      logger.warn(`Falló pedir la página ${targetPage}, renovando sesión`, {
        error: (err as Error).message,
      });
      const fresh = await this.openSession();
      html = await this.requestNextPage(fresh, targetPage);
    }
    return { html, pagination: PageParser.extractPaginationInfo(html) };
  }

  private async submitInitialSearch(): Promise<string> {
    const { formId, anio } = config.target.category;
    const categoryUrl = `${config.target.baseUrl}${config.target.categoryPath}`;

    const categoryResponse = await this.http.get(categoryUrl);
    const categoryHtml = categoryResponse.data as string;
    const viewState = PageParser.extractViewState(categoryHtml);
    const trigger = PageParser.extractSearchTrigger(categoryHtml, formId);

    if (!trigger) {
      throw new Error('No se encontró el botón "Buscar" en la página de categoría, el sitio pudo haber cambiado.');
    }

    const snapshot = PageParser.extractFormSnapshot(categoryHtml, formId);
    snapshot["javax.faces.ViewState"] = viewState;
    if (anio) snapshot[`${formId}:buAnio`] = anio;
    // el sitio mete el placeholder por JS, cheerio no lo ejecuta, así que lo mandamos a mano
    snapshot[`${formId}:txtBusqueda`] = "Ingrese el texto a buscar";
    snapshot[`${formId}:buNroExpediente`] = "Ingrese Nro de Expediente XXXXXX";

    const searchBody = new URLSearchParams({ ...snapshot, ...trigger });

    // seguimos el redirect a mano, dejarlo automático rompe la búsqueda del lado del servidor
    const postResponse = await this.http.post(categoryUrl, searchBody.toString(), {
      maxRedirects: 0,
    });

    const location = postResponse.headers["location"] as string | undefined;
    if (!location) {
      throw new Error(`La búsqueda no redirigió como se esperaba (HTTP ${postResponse.status}).`);
    }

    const resultsUrl = location.replace(/^http:\/\//, "https://");
    const resultsResponse = await this.http.get(resultsUrl);
    return resultsResponse.data as string;
  }

  private async requestNextPage(current: PageState, targetPage: number): Promise<string> {
    const { pagination } = current;
    if (!pagination.spinnerField || !pagination.irButtonField) {
      throw new Error("La página actual no expone los controles de paginación (spinner/IR).");
    }

    const snapshot = PageParser.extractFormSnapshot(current.html, "formBuscador");
    snapshot[pagination.spinnerField] = String(targetPage);
    const body = new URLSearchParams({ ...snapshot, [pagination.irButtonField]: "IR" });

    const resultsUrl = `${config.target.baseUrl}${config.target.resultsPath}`;
    const response = await this.http.post(resultsUrl, body.toString());
    return response.data as string;
  }
}
