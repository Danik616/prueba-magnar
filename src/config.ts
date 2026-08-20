import "dotenv/config";

const env = (key: string, fallback: string) => process.env[key] ?? fallback;
const envNum = (key: string, fallback: number) => Number(process.env[key] ?? fallback);

export const config = {
  baseUrl: "https://jurisprudencia.pj.gob.pe/jurisprudenciaweb",
  searchAnio: env("SEARCH_ANIO", "2024"),
  requestDelayMs: envNum("REQUEST_DELAY_MS", 1500),
  maxRetries: envNum("MAX_RETRIES", 5),
  retryBaseDelayMs: envNum("RETRY_BASE_DELAY_MS", 1000),
  retryMaxDelayMs: envNum("RETRY_MAX_DELAY_MS", 15000),
  maxPages: envNum("MAX_PAGES", 0),
  maxDocuments: envNum("MAX_DOCUMENTS", 0),
  paths: {
    documentsJsonl: "data/documents.jsonl",
    stateJson: "data/scraper-state.json",
    pdfsDir: "pdfs",
    logsDir: "logs",
  },
};
