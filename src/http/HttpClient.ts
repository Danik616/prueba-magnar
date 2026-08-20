import axios, { AxiosRequestConfig } from "axios";
import fs from "fs";
import { config } from "../config";
import { logger } from "../utils/logger";
import { sleep, getBackoffDelay, parseRetryAfterMs } from "../utils/delay";

const RETRYABLE_STATUS = new Set([429, 403, 500, 502, 503, 504]);

// Set mínimo de headers de un navegador real — a propósito no se agregan
// más cabeceras de "fingerprint" que nunca se confirmó que hicieran falta.
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-419,es;q=0.9",
};

function parseProxy(url: string | null): AxiosRequestConfig["proxy"] {
  if (!url) return undefined;
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port),
    auth: u.username ? { username: u.username, password: u.password } : undefined,
    protocol: u.protocol.replace(":", ""),
  };
}

/**
 * Cliente HTTP con manejo de cookies de sesion (necesario para el ViewState de JSF),
 * retry con backoff exponencial ante 429/403/5xx, y proxy opcional.
 */
export class HttpClient {
  private cookies = new Map<string, string>();
  private lastRequestAt = 0;
  private proxy = parseProxy(config.httpProxyUrl);

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private storeCookies(setCookieHeaders: string[] | undefined) {
    if (!setCookieHeaders) return;
    for (const raw of setCookieHeaders) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private async throttle() {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < config.requestDelayMs) {
      await sleep(config.requestDelayMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  private async request(requestConfig: AxiosRequestConfig) {
    await this.throttle();

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const response = await axios({
          ...requestConfig,
          proxy: this.proxy,
          maxRedirects: requestConfig.maxRedirects ?? 5,
          timeout: config.requestTimeoutMs,
          validateStatus: () => true,
          headers: {
            ...DEFAULT_HEADERS,
            ...requestConfig.headers,
            Cookie: this.cookieHeader(),
          },
        });

        this.storeCookies(response.headers["set-cookie"]);

        if (!RETRYABLE_STATUS.has(response.status)) {
          return response;
        }

        if (attempt === config.maxRetries) {
          throw new Error(`HTTP ${response.status} tras ${attempt + 1} intentos en ${requestConfig.url}`);
        }

        const retryAfter = parseRetryAfterMs(response.headers["retry-after"]);
        const delay = retryAfter ?? getBackoffDelay(attempt, config.retryBaseDelayMs, config.retryMaxDelayMs);
        logger.warn(`HTTP ${response.status} en ${requestConfig.url}, reintento ${attempt + 1}/${config.maxRetries} en ${Math.round(delay)}ms`);
        await sleep(delay);
      } catch (err) {
        if (attempt === config.maxRetries) throw err;
        const delay = getBackoffDelay(attempt, config.retryBaseDelayMs, config.retryMaxDelayMs);
        logger.warn(`Error de red en ${requestConfig.url}, reintento ${attempt + 1}/${config.maxRetries} en ${Math.round(delay)}ms`, {
          error: (err as Error).message,
        });
        await sleep(delay);
      }
    }

    throw new Error(`No se pudo completar la request a ${requestConfig.url}`);
  }

  get(url: string, requestConfig: AxiosRequestConfig = {}) {
    return this.request({ ...requestConfig, method: "GET", url });
  }

  post(url: string, data: unknown, requestConfig: AxiosRequestConfig = {}) {
    return this.request({
      ...requestConfig,
      method: "POST",
      url,
      data,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...requestConfig.headers,
      },
    });
  }

  async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await this.request({ url, method: "GET", responseType: "stream" });

    if (response.status !== 200) {
      response.data?.destroy?.();
      throw new Error(`HTTP ${response.status} descargando ${url}`);
    }

    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(destPath);
      response.data.pipe(writer);
      response.data.on("error", reject);
      writer.on("error", reject);
      writer.on("finish", resolve);
    });
  }
}
