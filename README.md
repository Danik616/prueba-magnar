# Prueba Magnar - Scraper Jurisprudencia PJ Perú

Scraper en TypeScript, sin automatización de navegador (nada de Puppeteer /
Playwright / Selenium), para el portal de
[Jurisprudencia Nacional Sistematizada](https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/resultado.xhtml)
del Poder Judicial del Perú. Todo se resuelve con `axios` + `cheerio`: peticiones
HTTP crudas y parsing de HTML.

El sitio es una aplicación JSF/RichFaces geobloqueada a IP peruana, así que
para correrlo contra el sitio real hace falta salir por una VPN o proxy con
salida en Perú.

## Instalación rápida

```bash
npm install
cp .env.example .env
```

## Correrlo

```bash
npm run dev                     # flujo completo: scrapea, descarga PDFs, reintenta fallos
npm run dev -- --mode=scrape    # solo recorre la paginación y guarda los documentos
npm run dev -- --mode=download  # descarga los PDFs de lo que ya está scrapeado
npm run dev -- --mode=retry     # reintenta únicamente las descargas que fallaron
```

Se puede cortar en cualquier momento (`Ctrl+C`) y volver a correr `npm run dev`:
retoma desde la última página guardada en vez de empezar de cero.

Recomendado para una primera corrida: setear `MAX_PAGES` y `MAX_DOCUMENTS` en
`.env` a un número chico, confirmar que los datos salen bien, y recién ahí
sacar el límite.

## Tests

```bash
npm test
```

No dependen de ningún sitio externo ni de VPN: `PageParser` se prueba contra
fixtures de HTML que replican el markup JSF/RichFaces real; `HttpClient` y
`PdfDownloader` se prueban contra un servidor HTTP local que simula un 429
con `Retry-After` y un archivo corrupto; `StateManager` se prueba con
aserciones sobre deduplicación de documentos.

## Variables de entorno

| Variable | Default | Qué hace |
|---|---|---|
| `SEARCH_ANIO` | vacío | Año de búsqueda. Vacío = todos los años. |
| `REQUEST_DELAY_MS` | `1500` | Piso de tiempo entre requests (rate limiting propio). |
| `REQUEST_TIMEOUT_MS` | `30000` | Timeout por request individual. |
| `MAX_RETRIES` | `5` | Reintentos ante 429/403/5xx antes de dar por perdido ese request. |
| `RETRY_BASE_DELAY_MS` | `1000` | Base del backoff exponencial (`1 → 2 → 4 → 8 → 15s`). |
| `RETRY_MAX_DELAY_MS` | `15000` | Techo del backoff. |
| `MAX_PAGES` / `MAX_DOCUMENTS` | `0` | Corte para pruebas cortas. `0` = sin límite. |
| `HTTP_PROXY_URL` | vacío | Proxy HTTP/HTTPS para salir con IP peruana, si no se usa VPN de sistema. |

## El problema que resuelve

El buscador no es una API, es una vista JSF/Mojarra con RichFaces que arrastra
estado de servidor (`javax.faces.ViewState`) entre requests. Buscar y pasar de
página son los dos un `POST` normal de formulario, nada de AJAX ni endpoints
JSON.

- El botón "Buscar" es un `<input type="image">` que dispara
  `mojarra.jsfcljs(...)` por `onclick`. Ese JS arma los parámetros ocultos que
  identifican qué botón se apretó, y `PageParser.extractSearchTrigger` los lee
  directo del HTML en vez de asumir ids autogenerados (`j_idtNN`), que cambian
  entre despliegues.
- Avanzar de página es reenviar el formulario **completo** (no solo el número
  de página) contra un spinner de RichFaces + botón "IR". Si falta algún campo
  que el servidor espera, la búsqueda se vacía sin ningún error visible, por
  eso `extractFormSnapshot` toma una foto de todos los inputs/selects antes de
  tocar nada.
- El sitio simula los placeholders de los inputs con JavaScript al cargar la
  página. Como `cheerio` nunca ejecuta ese script, el request tiene que mandar
  a mano el mismo texto que un navegador real terminaría enviando.

Sobre esa navegación corre el resto: rate limiting, reintentos y persistencia.

**Rate limiting.** Cada request pasa por un throttle mínimo entre llamadas y,
si el sitio responde 429/403/5xx, entra en backoff exponencial con jitter
(respetando `Retry-After` si el servidor lo manda). Si se agotan los
reintentos para un documento puntual, ese documento queda registrado como
fallido y el scraper sigue con el siguiente, no corta toda la corrida por un
solo PDF caído. Ya lo vimos disparar en una corrida real contra el sitio.

**Persistencia y resumibilidad.** Cada página scrapeada se apenda a
`data/documents.jsonl` y se marca en `data/scraper-state.json`. Los
documentos se deduplican por número de expediente, tanto dentro de un mismo
lote como contra lo ya guardado de corridas anteriores, así que reanudar
después de un corte no genera entradas repetidas.

**PDFs.** Se descargan a `pdfs/` con nombre `expediente_titulo_fecha.pdf`, y
se valida que el archivo tenga el header `%PDF-` real antes de darlo por
bueno (el sitio puede devolver una página de error HTML con status 200 en
vez del archivo). Lo que falla queda en cola para `--mode=retry`.

## Estructura

```
src/
├── index.ts                      # CLI (--mode=scrape|download|retry|full)
├── config.ts                     # toda la config, vía variables de entorno
├── types/index.ts                # tipos del dominio
├── scraper/
│   ├── JurisprudenciaScraper.ts  # orquesta scrape -> download -> retry
│   ├── ResultsPaginator.ts       # el flujo GET/POST contra el sitio
│   └── PageParser.ts             # todo el parsing de HTML con cheerio
├── http/HttpClient.ts            # cookies, retry/backoff, proxy, descarga
├── downloader/PdfDownloader.ts   # descarga + validación + cola de reintentos
├── storage/StateManager.ts       # checkpoints, dedup, JSONL append-only
└── utils/                        # delay/backoff/sanitización de nombres, logger
```

Es intencionalmente secuencial: sin lanes paralelos, sin pool de proxies, sin
circuit breaker. El desafío pide navegar toda la paginación, descargar PDFs y
manejar 429 con retry, así que es lo que hay, sin capas extra que no aporten
a eso. Si hace falta más velocidad o resiliencia frente a bloqueos más
agresivos, se puede sumar después sobre esta base.

## Salidas

| Ruta | Qué es |
|---|---|
| `data/documents.jsonl` | Un documento por línea, con todos los campos extraídos. |
| `data/scraper-state.json` | Checkpoint: última página, ids vistos, descargas pendientes de reintento. |
| `pdfs/` | PDFs descargados. |
| `logs/` | Log de cada corrida (consola + archivo). |

## Nota

Este es un ejercicio técnico. La lógica de navegación (`PageParser`,
`ResultsPaginator`) sale de inspeccionar el sitio a mano; si algo cambió del
lado del sitio, lo primero a revisar son los selectores en `PageParser.ts`.
