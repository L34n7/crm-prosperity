import assert from "node:assert/strict";
import test from "node:test";
import { compararModulosPermissoes, getModuloPermissao } from "../src/lib/permissoes/grupos-por-modulo.ts";

test("WhatsApp agrupa separadamente disparos, templates, ambiente e perfil", () => {
  assert.equal(getModuloPermissao("whatsapp.disparos.enviar"), "Disparos WhatsApp");
  assert.equal(getModuloPermissao("whatsapp.integracao.configurar"), "Configurar Ambiente");
  assert.equal(getModuloPermissao("whatsapp.perfil.visualizar"), "Perfil WhatsApp");
  assert.equal(getModuloPermissao("whatsapp_templates.criar"), "Templates WhatsApp");
});

test("códigos existentes continuam nos respectivos módulos", () => {
  const grupos = {
    "mensagens.enviar_midia":"Conversas",
    "conversas.transferir":"Conversas",
    "cotacoes.configurar":"Cotação veicular",
    "imoveis.criar":"Imóveis",
    "email_marketing.campanhas":"E-mail Marketing",
    "pessoas.criar":"Clientes e pacientes",
    "agendas.visualizar":"Agenda",
    "permissoes.editar_usuario":"Permissões e políticas",
    "ia.tokens.exibir_header":"Tokens de IA",
    "assinaturas.plano.visualizar":"Planos e assinaturas",
  };
  for (const [codigo, modulo] of Object.entries(grupos)) {
    assert.equal(getModuloPermissao(codigo), modulo);
  }
});

test("prefixos futuros não são misturados em Outros", () => {
  assert.equal(getModuloPermissao("recurso_novo.visualizar"), "Outros — recurso novo");
  assert.equal(getModuloPermissao("outro_recurso.visualizar"), "Outros — outro recurso");
});

test("ordem da navegação precede módulos desconhecidos", () => {
  const modulos = ["E-mail Marketing","Disparos WhatsApp","Conversas","Outros — z","Agenda"];
  assert.deepEqual(modulos.sort(compararModulosPermissoes), ["Conversas","Disparos WhatsApp","Agenda","E-mail Marketing","Outros — z"]);
});
