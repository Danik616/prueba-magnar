import "dotenv/config";

const env = (key: string, fallback: string) => process.env[key] ?? fallback;
const envNum = (key: string, fallback: number) => Number(process.env[key] ?? fallback);

export const config = {
  target: {
    origin: "https://jurisprudencia.pj.gob.pe", // sin /jurisprudenciaweb, el href del pdf ya lo trae
    baseUrl: "https://jurisprudencia.pj.gob.pe/jurisprudenciaweb",
    categoryPath: "/faces/page/inicio.xhtml",
    resultsPath: "/faces/page/resultado.xhtml",
    category: {
      formId: "formBuscador",
      anio: env("SEARCH_ANIO", ""), // vacio = todos los anios
    },
  },
  requestDelayMs: envNum("REQUEST_DELAY_MS", 1500),
  requestTimeoutMs: envNum("REQUEST_TIMEOUT_MS", 30000),
  maxRetries: envNum("MAX_RETRIES", 5),
  retryBaseDelayMs: envNum("RETRY_BASE_DELAY_MS", 1000),
  retryMaxDelayMs: envNum("RETRY_MAX_DELAY_MS", 15000),
  maxPages: envNum("MAX_PAGES", 0),
  maxDocuments: envNum("MAX_DOCUMENTS", 0),
  httpProxyUrl: process.env.HTTP_PROXY_URL || null,
  paths: {
    documentsJsonl: "data/documents.jsonl",
    stateJson: "data/scraper-state.json",
    pdfsDir: "pdfs",
    logsDir: "logs",
  },
};
