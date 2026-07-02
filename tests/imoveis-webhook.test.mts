import assert from "node:assert/strict";
import test from "node:test";
import {
  criarSegredoWebhook,
  normalizarWebhookImovel,
  sanitizarPayloadSemMidia,
  segredoWebhookValido,
} from "../src/lib/imoveis/webhook.ts";

test("normaliza o contrato recomendado sem baixar imagens", () => {
  const payload = {
    event_id: "evt_1",
    event_type: "property.updated",
    occurred_at: "2026-07-02T14:30:00-03:00",
    property: {
      external_id: "IMO-10",
      codigo: "AP-10",
      titulo: "Apartamento no Centro",
      finalidade: "venda",
      valor_venda: 850000,
      endereco: {
        bairro: "Centro",
        cidade: "Belo Horizonte",
        uf: "MG",
      },
      quartos: 3,
      areas: { util: 112.5 },
      imagens: [
        { url: "https://cdn.example/imovel/fachada.jpg" },
        { original: "https://cdn.example/imovel/sala.jpg" },
        { url: "data:image/jpeg;base64,AAAA" },
        { url: "http://127.0.0.1/admin.jpg" },
      ],
      property_url: "https://imobiliaria.example/imovel/IMO-10",
    },
  };

  const normalizado = normalizarWebhookImovel(
    payload,
    JSON.stringify(payload)
  );

  assert.equal(normalizado.eventId, "evt_1");
  assert.equal(normalizado.action, "upsert");
  assert.equal(normalizado.externalId, "IMO-10");
  assert.equal(normalizado.imovel.valor, 850000);
  assert.equal(normalizado.imovel.bairro, "Centro");
  assert.equal(normalizado.imovel.areaM2, 112.5);
  assert.deepEqual(normalizado.imovel.imagemUrls, [
    "https://cdn.example/imovel/fachada.jpg",
    "https://cdn.example/imovel/sala.jpg",
  ]);
  assert.equal(
    normalizado.imovel.externalUrl,
    "https://imobiliaria.example/imovel/IMO-10"
  );
});

test("aceita aliases comuns em ingles", () => {
  const payload = {
    eventId: "evt_english",
    event: "listing-created",
    data: {
      listing_id: "LIST-55",
      headline: "House near the lake",
      business_type: "rent",
      rental_price: "3,500.50",
      address: {
        neighborhood: "Lagoa",
        city: "Belo Horizonte",
        state_code: "mg",
      },
      attributes: {
        bedrooms: 4,
        bathrooms: 3,
        parking_spaces: 2,
      },
      gallery: ["https://cdn.example/list-55.jpg"],
      listing_url: "https://partner.example/listings/55",
    },
  };

  const normalizado = normalizarWebhookImovel(
    payload,
    JSON.stringify(payload)
  );

  assert.equal(normalizado.externalId, "LIST-55");
  assert.equal(normalizado.imovel.finalidade, "locacao");
  assert.equal(normalizado.imovel.valor, 3500.5);
  assert.equal(normalizado.imovel.estado, "MG");
  assert.equal(normalizado.imovel.quartos, 4);
});

test("permite exclusao somente com o identificador externo", () => {
  const payload = {
    event_id: "evt_delete",
    event_type: "property.deleted",
    property: { external_id: "IMO-REMOVIDO" },
  };

  const normalizado = normalizarWebhookImovel(
    payload,
    JSON.stringify(payload)
  );

  assert.equal(normalizado.action, "delete");
  assert.equal(normalizado.imovel.titulo, null);
});

test("reconhece type como evento quando existe envelope de imovel", () => {
  const payload = {
    event_id: "evt_delete_type",
    type: "listing.removed",
    listing: { id: "LIST-REMOVIDO" },
  };

  const normalizado = normalizarWebhookImovel(
    payload,
    JSON.stringify(payload)
  );

  assert.equal(normalizado.action, "delete");
  assert.equal(normalizado.externalId, "LIST-REMOVIDO");
});

test("rejeita inclusao sem identificador estavel", () => {
  const payload = {
    event_type: "property.created",
    property: { titulo: "Imovel sem identificador" },
  };

  assert.throws(
    () => normalizarWebhookImovel(payload, JSON.stringify(payload)),
    /identificador do imovel/i
  );
});

test("remove midia embutida e preserva URLs", () => {
  const sanitizado = sanitizarPayloadSemMidia({
    property: {
      imagem: {
        url: "https://cdn.example/image.jpg",
        base64: "AAAA",
      },
      arquivo: "data:image/png;base64,BBBB",
      foto_binaria: "A".repeat(2048),
      descricao: "Texto normal",
    },
  });

  assert.deepEqual(sanitizado, {
    property: {
      imagem: {
        url: "https://cdn.example/image.jpg",
        base64: "[conteudo de midia removido]",
      },
      arquivo: "[conteudo de midia removido]",
      foto_binaria: "[conteudo de midia removido]",
      descricao: "Texto normal",
    },
  });
});

test("segredo e armazenado como hash e comparado corretamente", () => {
  const credencial = criarSegredoWebhook();

  assert.match(credencial.segredo, /^whsec_/);
  assert.notEqual(credencial.hash, credencial.segredo);
  assert.equal(
    segredoWebhookValido(credencial.segredo, credencial.hash),
    true
  );
  assert.equal(segredoWebhookValido("whsec_incorreto", credencial.hash), false);
});
