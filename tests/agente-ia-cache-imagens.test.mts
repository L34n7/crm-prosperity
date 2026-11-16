import assert from "node:assert/strict";
import test from "node:test";
import { chaveCacheInterpretacaoImagem } from "../src/lib/agentes-ia/cache-chave-imagem.ts";

const hash = "qJgjpLl08MJvR7Hua4XYgPodTTkYUND3w9voULcT4Ys=";
const uuid1 = "0ebf4044-2309-41c8-bc0b-973f855abc18";
const uuid2 = "19f43cf6-cd82-4fd2-86c6-4195b32009c9";

test("a mesma imagem reenviada reutiliza chave pelo SHA-256", () => {
  const x = chaveCacheInterpretacaoImagem({ mensagemId: uuid1, metadataJson: { sha256: hash } });
  const y = chaveCacheInterpretacaoImagem({ mensagemId: uuid2, metadataJson: { sha256: hash } });
  assert.equal(x,y);
  assert.equal(x,"v2:sha256:"+hash);
});

test("sha256 no objeto image também funciona", () => {
  assert.equal(chaveCacheInterpretacaoImagem({mensagemId:uuid1, metadataJson: {image:{sha256:hash}}}),"v2:sha256:"+hash);
});

test("sem hash válido a chave é exclusiva por mensagem", () => {
  assert.equal(chaveCacheInterpretacaoImagem({mensagemId:uuid1,metadataJson:{sha256:"invalido"}}),"v2:mensagem:"+uuid1);
  assert.equal(chaveCacheInterpretacaoImagem({mensagemId:uuid2,metadataJson:null}),"v2:mensagem:"+uuid2);
});

test("prioriza sha256 da mensagem para evitar metadados de outros formatos", () => {
  assert.equal(chaveCacheInterpretacaoImagem({mensagemId:uuid1,metadataJson:{sha256:hash,image:{sha256:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa="}}}),"v2:sha256:"+hash);
});
