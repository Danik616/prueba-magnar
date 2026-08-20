import assert from "assert";
import fs from "fs";
import { StateManager } from "./StateManager";
import { config } from "../config";
import { DocumentRecord } from "../types";

function test(name: string, fn: () => void) {
  fn();
  console.log(`OK   ${name}`);
}

const doc = (id: string): DocumentRecord => ({
  id,
  expediente: id,
  titulo: "Test",
  fecha: "01/01/2024",
  pdfUrl: null,
  pdfPath: null,
  fields: {},
});

for (const f of [config.paths.documentsJsonl, config.paths.stateJson]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const state = new StateManager();

test("appendDocuments descarta duplicados por id (misma llamada)", () => {
  state.appendDocuments([doc("A"), doc("A"), doc("B")]);
  assert.strictEqual(state.loadAllDocuments().length, 2);
});

test("appendDocuments descarta duplicados ya persistidos (resume)", () => {
  state.appendDocuments([doc("A"), doc("C")]);
  const all = state.loadAllDocuments();
  assert.strictEqual(all.length, 3, "A no debería duplicarse al reintentar la misma página");
  assert.deepStrictEqual(
    all.map((d) => d.id),
    ["A", "B", "C"]
  );
});

console.log("\nTodos los tests de StateManager pasaron.");
