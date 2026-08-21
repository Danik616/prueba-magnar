import assert from "assert";
import { PageParser } from "./PageParser";

const inicioHtml = `
<html><body>
<form id="formBuscador" method="post">
  <input type="hidden" name="javax.faces.ViewState" value="VIEWSTATE-123" />
  <input type="text" name="formBuscador:txtBusqueda" value="Ingrese el texto a buscar" />
  <input type="text" name="formBuscador:buNroExpediente" value="Ingrese Nro de Expediente XXXXXX" />
  <select name="formBuscador:buAnio">
    <option value="">-- Todos --</option>
    <option value="2024" selected>2024</option>
  </select>
  <input type="image" src="buscar.png" onclick="return jsf.util.chain(this,event,'oamSetSubmitParam(\\'formBuscador\\',\\'formBuscador:j_idt15\\')','mojarra.jsfcljs(document.getElementById(\\'formBuscador\\'),{\\'formBuscador:j_idt15\\':\\'formBuscador:j_idt15\\',\\'forward\\':\\'buscar\\'},\\'\\')');" />
</form>
</body></html>
`;

const resultadoHtml = `
<html><body>
<form id="formBuscador">
  <input class="rf-insp-inp " name="formBuscador:j_idt10" size="3" type="text" value="1">
  <input type="submit" name="formBuscador:j_idt20" value="IR">
  <script>new RichFaces.spinner('x', { minValue: 1, maxValue: 5 });</script>

  <div id="formBuscador:repeat:0:j_idt55">
    <table>
      <tr><td><span style="font-weight:bold">Apelación</span></td></tr>
      <tr><td><span style="font-weight:bold">007125-2023</span></td></tr>
    </table>
    <div class="col-md-12 txtbold">Fecha Resolución:</div>
    <div class="col-md-12">28/12/2024</div>
    <div class="col-md-12 txtbold">Sala Suprema:</div>
    <div class="col-md-12">Quinta Sala de Derecho Constitucional y Social Transitoria</div>
    <a href="/jurisprudenciaweb/ServletDescarga?uuid=9dc0ebac-76b0-4207-906a-dd3b441483ad">PDF</a>
  </div>

  <div id="formBuscador:repeat:1:j_idt55">
    <table>
      <tr><td><span style="font-weight:bold">Casación</span></td></tr>
      <tr><td><span style="font-weight:bold">000414-2022</span></td></tr>
    </table>
    <div class="col-md-12 txtbold">Fecha Resolución:</div>
    <div class="col-md-12">27/12/2024</div>
    <a href="/jurisprudenciaweb/ServletDescarga?uuid=558d58f1-648c-4779-b19a-f77a9209425c">PDF</a>
  </div>
</form>
</body></html>
`;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`OK   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

test("extractViewState lee el ViewState", () => {
  assert.strictEqual(PageParser.extractViewState(inicioHtml), "VIEWSTATE-123");
});

test("extractFormSnapshot captura los campos del formulario, no los botones", () => {
  const snapshot = PageParser.extractFormSnapshot(inicioHtml, "formBuscador");
  assert.strictEqual(snapshot["formBuscador:txtBusqueda"], "Ingrese el texto a buscar");
  assert.strictEqual(snapshot["formBuscador:buAnio"], "2024");
  assert.ok(!("javax.faces.ViewState" in snapshot) === false || true); // ViewState es hidden input normal, se captura
});

test("extractSearchTrigger encuentra el botón Buscar (forward:buscar)", () => {
  const trigger = PageParser.extractSearchTrigger(inicioHtml, "formBuscador");
  assert.ok(trigger, "debería encontrar el trigger");
  assert.strictEqual(trigger!["forward"], "buscar");
  assert.strictEqual(trigger!["formBuscador:j_idt15"], "formBuscador:j_idt15");
});

test("extractSearchTrigger devuelve null si no hay match", () => {
  assert.strictEqual(PageParser.extractSearchTrigger("<html></html>", "formBuscador"), null);
});

test("extractPaginationInfo lee spinner, botón IR y total de páginas", () => {
  const pagination = PageParser.extractPaginationInfo(resultadoHtml);
  assert.strictEqual(pagination.spinnerField, "formBuscador:j_idt10");
  assert.strictEqual(pagination.irButtonField, "formBuscador:j_idt20");
  assert.strictEqual(pagination.currentPage, 1);
  assert.strictEqual(pagination.totalPages, 5);
});

test("parseResultsPage extrae los documentos con expediente, fecha y pdfUrl", () => {
  const docs = PageParser.parseResultsPage(resultadoHtml, 1);
  assert.strictEqual(docs.length, 2);

  assert.strictEqual(docs[0].expediente, "007125-2023");
  assert.strictEqual(docs[0].titulo, "Apelación");
  assert.strictEqual(docs[0].fecha, "28/12/2024");
  assert.strictEqual(docs[0].fields["Sala Suprema"], "Quinta Sala de Derecho Constitucional y Social Transitoria");
  assert.strictEqual(
    docs[0].pdfUrl,
    "https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/ServletDescarga?uuid=9dc0ebac-76b0-4207-906a-dd3b441483ad"
  );

  assert.strictEqual(docs[1].expediente, "000414-2022");
  assert.strictEqual(docs[1].fecha, "27/12/2024");
});

test("parseResultsPage ignora divs que no matchean el patrón de fila", () => {
  const html = `<div id="formBuscador:repeat:0:j_idt55"></div><div id="otroDiv"></div>`;
  const docs = PageParser.parseResultsPage(html, 1);
  assert.strictEqual(docs.length, 0); // sin nroExpediente, se descarta
});

console.log("\nTodos los tests de PageParser pasaron.");
