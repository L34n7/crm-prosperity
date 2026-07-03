import assert from "node:assert/strict";
import test from "node:test";
import {
  CODIGO_CONFIRMACAO_LISTA_FRIA_OBRIGATORIA,
  CODIGO_MARKETING_LISTA_FRIA_BLOQUEADO,
  classificarDestinatariosPorOptIn,
  validarPoliticaListaDisparo,
} from "../src/lib/whatsapp/disparo-politica-lista.ts";

test("classifica opt-in pelo número remetente e telefone atual do contato", async () => {
  const tabelasConsultadas: string[] = [];
  let phoneNumberIdConsultado = "";
  const supabase = {
    from(tabela: string) {
      tabelasConsultadas.push(tabela);
      const query = {
        select() {
          return query;
        },
        eq(coluna: string, valor: unknown) {
          if (
            tabela === "whatsapp_contatos_opt_in_numeros" &&
            coluna === "phone_number_id"
          ) {
            phoneNumberIdConsultado = String(valor || "");
          }

          return query;
        },
        async in() {
          if (tabela === "contatos") {
            return {
              data: [
                {
                  id: "contato-opt-in",
                  telefone: "5511999999999",
                },
                {
                  id: "contato-frio",
                  telefone: "5511888888888",
                },
              ],
              error: null,
            };
          }

          return {
            data: [
              {
                contato_id: "contato-opt-in",
                telefone_normalizado: "5511999999999",
              },
            ],
            error: null,
          };
        },
      };

      return query;
    },
  };

  const resultado = await classificarDestinatariosPorOptIn({
    supabase: supabase as never,
    empresaId: "empresa-1",
    integracaoWhatsappId: "integracao-1",
    phoneNumberId: "phone-number-1",
    destinatarios: [
      {
        contatoId: "contato-opt-in",
        telefone: "5511999999999",
      },
      {
        contatoId: "contato-frio",
        telefone: "5511888888888",
      },
      {
        contatoId: "contato-opt-in",
        telefone: "5511777777777",
      },
    ],
  });

  assert.deepEqual(tabelasConsultadas, [
    "contatos",
    "whatsapp_contatos_opt_in_numeros",
  ]);
  assert.equal(phoneNumberIdConsultado, "phone-number-1");
  assert.equal(resultado.totalOptIn, 1);
  assert.equal(resultado.totalFrios, 2);
});

test("libera marketing quando todos os contatos possuem opt-in", () => {
  const resultado = validarPoliticaListaDisparo({
    categoria: "MARKETING",
    totalContatosFrios: 0,
    responsabilidadeListaFriaConfirmada: false,
  });

  assert.equal(resultado.ok, true);
});

test("bloqueia marketing quando existe contato de lista fria", () => {
  const resultado = validarPoliticaListaDisparo({
    categoria: "MARKETING",
    totalContatosFrios: 1,
    responsabilidadeListaFriaConfirmada: true,
  });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.code, CODIGO_MARKETING_LISTA_FRIA_BLOQUEADO);
});

test("exige responsabilidade para utility com lista fria", () => {
  const resultado = validarPoliticaListaDisparo({
    categoria: "UTILITY",
    totalContatosFrios: 2,
    responsabilidadeListaFriaConfirmada: false,
  });

  assert.equal(resultado.ok, false);
  assert.equal(
    resultado.code,
    CODIGO_CONFIRMACAO_LISTA_FRIA_OBRIGATORIA
  );
});

test("libera utility com lista fria após confirmação de responsabilidade", () => {
  const resultado = validarPoliticaListaDisparo({
    categoria: "UTILITY",
    totalContatosFrios: 2,
    responsabilidadeListaFriaConfirmada: true,
  });

  assert.equal(resultado.ok, true);
});
