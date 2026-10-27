import assert from "node:assert/strict";
import test from "node:test";

import { classificarErroEstruturalCampanhaDisparo } from "../src/lib/whatsapp/disparo-fila.ts";

test("classifica template com imagem sem mídia como falha estrutural", () => {
  const resultado = classificarErroEstruturalCampanhaDisparo(
    "Template com cabeçalho IMAGE sem mídia sincronizada da Meta. Sincronize o template novamente antes de disparar."
  );

  assert.equal(resultado?.chave, "template_header_midia_ausente");
});

test("não classifica número inválido como falha estrutural", () => {
  assert.equal(
    classificarErroEstruturalCampanhaDisparo("Numero invalido."),
    null
  );
});
