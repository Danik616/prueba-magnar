import "dotenv/config";

const env = (key: string, fallback: string) => process.env[key] ?? fallback;
const envNum = (key: string, fallback: number) => Number(process.env[key] ?? fallback);

export const config = {
  target: {
    // origin es el dominio pelado: PageParser lo usa para armar el link del
    // PDF, que ya viene con /jurisprudenciaweb incluido en el href.
    origin: "https://jurisprudencia.pj.gob.pe",
    // baseUrl vuelve a incluir jurisprudenciaweb: los paths de abajo son relativos a esto.
    baseUrl: "https://jurisprudencia.pj.gob.pe/jurisprudenciaweb",
    categoryPath: "/faces/page/inicio.xhtml",
    resultsPath: "/faces/page/resultado.xhtml",
    category: {
      formId: "formBuscador",
      // Vacio = "-- Todos --" (todos los anios).
      anio: env("SEARCH_ANIO", ""),
    },
  },
  requestDelayMs: envNum("REQUEST_DELAY_MS", 1500),
  requestTimeoutMs: envNum("REQUEST_TIMEOUT_MS", 30000),
  maxRetries: envNum("MAX_RETRIES", 5),
  retryBaseDelayMs: envNum("RETRY_BASE_DELAY_MS", 1000),
  retryMaxDelayMs: envNum("RETRY_MAX_DELAY_MS", 15000),
  maxPages: envNum("MAX_PAGES", 0),
  maxDocuments: envNum("MAX_DOCUMENTS", 0),
  // Proxy HTTP/HTTPS opcional para salir con IP peruana, ej: http://usuario:pass@host:puerto
  httpProxyUrl: process.env.HTTP_PROXY_URL || null,
  paths: {
    documentsJsonl: "data/documents.jsonl",
    stateJson: "data/scraper-state.json",
    pdfsDir: "pdfs",
    logsDir: "logs",
  },
};
