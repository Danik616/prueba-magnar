import assert from "assert";
import fs from "fs";
import path from "path";
import http from "http";
import { HttpClient } from "../http/HttpClient";
import { PdfDownloader } from "./PdfDownloader";
import { StateManager } from "../storage/StateManager";
import { config } from "../config";
import { DocumentRecord } from "../types";

// no pisar data/ real
config.paths.documentsJsonl = "data/.test/documents.jsonl";
config.paths.stateJson = "data/.test/scraper-state.json";
config.paths.pdfsDir = "data/.test/pdfs";

let attempts429 = 0;

const server = http.createServer((req, res) => {
  if (req.url === "/ok.pdf") {
    if (attempts429 === 0) {
      attempts429++;
      res.writeHead(429, { "Retry-After": "1" });
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/pdf" });
    res.end(Buffer.from("%PDF-1.4 fake content"));
    return;
  }
  if (req.url === "/not-a-pdf.pdf") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html>esto no es un pdf</html>");
    return;
  }
  res.writeHead(404);
  res.end();
});

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`OK   ${name}`))
    .catch((err) => {
      console.error(`FAIL ${name}`);
      throw err;
    });
}

async function main() {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  for (const f of [config.paths.documentsJsonl, config.paths.stateJson]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  fs.rmSync(config.paths.pdfsDir, { recursive: true, force: true });
  fs.mkdirSync(config.paths.pdfsDir, { recursive: true });

  const http = new HttpClient();
  const state = new StateManager();
  const downloader = new PdfDownloader(http, state);

  await test("descarga OK tras un 429 (retry/backoff funcionando)", async () => {
    const doc: DocumentRecord = {
      id: "doc-1",
      expediente: "EXP-1",
      titulo: "Test",
      fecha: "01/01/2024",
      pdfUrl: `http://127.0.0.1:${port}/ok.pdf`,
      pdfPath: null,
      fields: {},
    };
    await downloader.downloadOne(doc);
    const destPath = path.join(config.paths.pdfsDir, "EXP-1_Test_01_01_2024.pdf");
    assert.ok(fs.existsSync(destPath), "el pdf debería existir en disco");
    assert.strictEqual(attempts429, 1, "debería haber reintentado una vez tras el 429");
    assert.strictEqual(state.failedDownloads.length, 0);
  });

  await test("descarga inválida (no es PDF real) se registra como fallida", async () => {
    const doc: DocumentRecord = {
      id: "doc-2",
      expediente: "EXP-2",
      titulo: "Test2",
      fecha: "01/01/2024",
      pdfUrl: `http://127.0.0.1:${port}/not-a-pdf.pdf`,
      pdfPath: null,
      fields: {},
    };
    await downloader.downloadOne(doc);
    assert.strictEqual(state.failedDownloads.length, 1);
    assert.strictEqual(state.failedDownloads[0].documentId, "doc-2");
    const destPath = path.join(config.paths.pdfsDir, "EXP-2_Test2_01_01_2024.pdf");
    assert.ok(!fs.existsSync(destPath), "el archivo inválido no debería quedar en disco");
  });

  server.close();
  console.log("\nTodos los tests de PdfDownloader pasaron.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
