import * as cheerio from "cheerio";
import { DocumentRecord } from "../types";
import { config } from "../config";
import { logger } from "../utils/logger";

// ============================================================
// PageParser — parsing del sitio jurisprudencia.pj.gob.pe (RichFaces/Mojarra,
// no una API REST). El botón "Buscar" es un <input type="image"> conectado a
// mojarra.jsfcljs(...): hace un submit normal de formulario (no AJAX) agregando
// parámetros ocultos que identifican qué botón disparó el envío. La paginación
// es un spinner de RichFaces + botón "IR": saltar a la página N implica
// reenviar TODO el estado del formulario con ese número.
//
// NOTA: esta lógica sale de inspeccionar manualmente el HTML del sitio, pero
// no se pudo validar todavía en vivo (bloquea IPs fuera de Perú), así que
// hay que confirmarla en cuanto tengamos acceso con VPN.
// ============================================================

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
      logger.warn("No se encontró el ViewState — la sesión pudo haber expirado o el sitio cambió");
    }
    return viewState || "";
  }

  /**
   * Snapshot de todos los campos del formulario, para que el reenvío se
   * parezca al de un navegador real. RichFaces puede descartar en silencio
   * el estado de búsqueda si falta algún campo que espera recibir.
   */
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

  /**
   * Extrae los parámetros extra que mojarra.jsfcljs() agrega al disparar el
   * botón "Buscar", leyéndolos del JS del onclick en vez de hardcodear ids
   * autogenerados (j_idtNN) que cambian entre despliegues.
   */
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

  /** Cada resultado trae sus datos directo en el HTML: expediente, fecha, sala, sumilla, link al PDF. */
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
