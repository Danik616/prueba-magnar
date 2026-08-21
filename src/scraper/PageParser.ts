import * as cheerio from "cheerio";
import { DocumentRecord } from "../types";
import { config } from "../config";
import { logger } from "../utils/logger";

// JSF/RichFaces, no hay api. "Buscar" es un input image con onclick a
// mojarra.jsfcljs (submit normal, no ajax). paginar = reenviar todo el
// form con el spinner + botón IR

export interface PaginationInfo {
  spinnerField: string | null;
  irButtonField: string | null;
  currentPage: number;
  totalPages: number | null;
}

export class PageParser {
  static extractViewState(html: string): string {
    const $ = cheerio.load(html);
    const viewState = $('input[name="javax.faces.ViewState"]').val() as string;
    if (!viewState) {
      logger.warn("No se encontró el ViewState, la sesión pudo haber expirado o el sitio cambió");
    }
    return viewState || "";
  }

  // si falta algún campo, RichFaces vacía la búsqueda sin avisar
  static extractFormSnapshot(html: string, formId: string): Record<string, string> {
    const $ = cheerio.load(html);
    const form = $(`form#${formId}`);
    const fields: Record<string, string> = {};

    form.find("input").each((_i, el) => {
      const $el = $(el);
      const name = $el.attr("name");
      if (!name) return;
      const type = ($el.attr("type") || "text").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        if ($el.attr("checked") !== undefined) fields[name] = $el.attr("value") || "on";
      } else if (["submit", "image", "button", "file"].includes(type)) {
        return; // el control "clickeado" se agrega a mano en el paso que corresponda
      } else {
        fields[name] = $el.attr("value") || "";
      }
    });

    form.find("select").each((_i, el) => {
      const $el = $(el);
      const name = $el.attr("name");
      if (!name) return;
      const selected = $el.find("option[selected]").attr("value");
      fields[name] = selected ?? ($el.find("option").first().attr("value") || "");
    });

    return fields;
  }

  // saca los params de mojarra.jsfcljs() del onclick en vez de hardcodear ids tipo j_idtNN
  static extractSearchTrigger(html: string, formId: string): Record<string, string> | null {
    const unescaped = html.replace(/\\'/g, "'");
    const re = new RegExp(`mojarra\\.jsfcljs\\(document\\.getElementById\\('${formId}'\\),\\{([^}]*)\\}`, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(unescaped)) !== null) {
      if (!/'forward':'buscar'/.test(match[1])) continue;

      const fields: Record<string, string> = {};
      const pairRe = /'([^']+)':'([^']*)'/g;
      let pairMatch: RegExpExecArray | null;
      while ((pairMatch = pairRe.exec(match[1])) !== null) {
        fields[pairMatch[1]] = pairMatch[2];
      }
      return Object.keys(fields).length ? fields : null;
    }
    return null;
  }

  static extractPaginationInfo(html: string): PaginationInfo {
    const spinnerMatch = html.match(/class="rf-insp-inp\s*"\s*name="([^"]+)"\s*size="\d+"\s*type="text"\s*value="(\d+)"/);
    const irMatch = html.match(/<input type="submit" name="([^"]+)" value="IR"/);
    const maxMatch = html.match(/maxValue:\s*(\d+)/);

    return {
      spinnerField: spinnerMatch ? spinnerMatch[1] : null,
      irButtonField: irMatch ? irMatch[1] : null,
      currentPage: spinnerMatch ? parseInt(spinnerMatch[2], 10) : 1,
      totalPages: maxMatch ? parseInt(maxMatch[1], 10) : null,
    };
  }

  static parseResultsPage(html: string, page: number): DocumentRecord[] {
    const $ = cheerio.load(html);
    const documents: DocumentRecord[] = [];

    $("div[id]").each((_i, el) => {
      const id = $(el).attr("id") || "";
      if (!/^formBuscador:repeat:\d+:j_idt\d+$/.test(id)) return;

      const $row = $(el);
      const spans = $row.find('table span[style*="font-weight:bold"]');
      const tipo = spans.eq(0).text().trim();
      const nroExpediente = spans.eq(1).text().trim();
      if (!nroExpediente) return;

      const fields: Record<string, string> = {};
      $row.find(".col-md-12.txtbold").each((_j, labelEl) => {
        const label = $(labelEl).text().replace(/:$/, "").trim();
        const value = $(labelEl).next(".col-md-12").text().trim();
        if (label) fields[label] = value;
      });

      const pdfHref = $row.find('a[href*="ServletDescarga"]').attr("href");
      const pdfUrl = pdfHref ? `${config.target.origin}${pdfHref}` : null;

      documents.push({
        id: nroExpediente,
        expediente: nroExpediente,
        titulo: tipo,
        fecha: fields["Fecha Resolución"] || "",
        pdfUrl,
        pdfPath: null,
        fields,
      });
    });

    logger.info(`Página ${page} parseada: ${documents.length} documentos encontrados`);
    return documents;
  }
}
