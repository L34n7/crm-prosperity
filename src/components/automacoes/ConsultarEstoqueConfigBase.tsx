"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { TemplateVariableOption } from "@/components/TemplateVariableCombobox";
import styles from "./ConsultarEstoqueConfig.module.css";

export type OrigemProdutoConsultaEstoque =
  | "resposta_cliente"
  | "variavel"
  | "produto_especifico"
  | "produto_selecionado_anteriormente";
export type ModoPesquisaConsultaEstoque =
  | "automatico"
  | "nome"
  | "codigo_sku"
  | "codigo_barras";
export type ModoDepositoConsultaEstoque =
  | "todos"
  | "especifico"
  | "selecionados";

export const MENSAGEM_MULTIPLOS_PRODUTOS_PADRAO =
  "Encontrei estas opções. Responda com o número do produto que deseja:";

export type ConfiguracaoConsultarEstoque = {
  origem_produto: OrigemProdutoConsultaEstoque;
  produto_id: string;
  variavel_produto: string;
  variavel_resposta: string;
  pesquisar_por: ModoPesquisaConsultaEstoque;
  deposito_modo: ModoDepositoConsultaEstoque;
  deposito_id: string;
  deposito_ids: string[];
  usar_embalagem_venda: boolean;
  validar_quantidade_solicitada: boolean;
  variavel_quantidade: string;
  produtos_por_pagina: number;
  mensagem_multiplos_produtos: string;
  /** Compatibilidade com fluxos salvos antes da paginação. */
  limite_candidatos: number;
};

type ProdutoOpcao = {
  id: string;
  codigo: string;
  sku: string;
  codigo_barras: string;
  nome: string;
  unidade: string;
  preco_venda: number | null;
};

type DepositoOpcao = {
  id: string;
  codigo?: string | null;
  nome: string;
  principal?: boolean | null;
};

type Props = {
  configuracao?: Record<string, unknown> | null;
  variaveis: TemplateVariableOption[];
  onChange: (configuracao: ConfiguracaoConsultarEstoque) => void;
};

export const CONFIGURACAO_CONSULTAR_ESTOQUE_PADRAO: ConfiguracaoConsultarEstoque = {
  origem_produto: "resposta_cliente",
  produto_id: "",
  variavel_produto: "",
  variavel_resposta: "",
  pesquisar_por: "automatico",
  deposito_modo: "todos",
  deposito_id: "",
  deposito_ids: [],
  usar_embalagem_venda: true,
  validar_quantidade_solicitada: false,
  variavel_quantidade: "",
  produtos_por_pagina: 15,
  mensagem_multiplos_produtos: MENSAGEM_MULTIPLOS_PRODUTOS_PADRAO,
  limite_candidatos: 15,
};

const ORIGENS_PRODUTO = new Set<OrigemProdutoConsultaEstoque>([
  "resposta_cliente",
  "variavel",
  "produto_especifico",
  "produto_selecionado_anteriormente",
]);
const MODOS_PESQUISA = new Set<ModoPesquisaConsultaEstoque>([
  "automatico",
  "nome",
  "codigo_sku",
  "codigo_barras",
]);
const MODOS_DEPOSITO = new Set<ModoDepositoConsultaEstoque>([
  "todos",
  "especifico",
  "selecionados",
]);

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function normalizarVariavel(valor: unknown) {
  return texto(valor)
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .replace(/^variaveis\./i, "")
    .trim()
    .toLowerCase();
}

function normalizarProdutosPorPagina(config: Record<string, unknown>) {
  const informado = Number(
    config.produtos_por_pagina ?? config.limite_candidatos ?? 15
  );

  if (informado === 5 || informado === 10 || informado === 15) return informado;
  if (informado === 3) return 5;
  return 15;
}

export function normalizarConfiguracaoConsultarEstoque(
  configuracao?: Record<string, unknown> | null
): ConfiguracaoConsultarEstoque {
  const config = configuracao || {};
  const origem = texto(config.origem_produto) as OrigemProdutoConsultaEstoque;
  const pesquisa = texto(
    config.pesquisar_por || config.modo_pesquisa
  ) as ModoPesquisaConsultaEstoque;
  const depositoModo = texto(
    config.deposito_modo || "todos"
  ) as ModoDepositoConsultaEstoque;
  const depositoIds = Array.isArray(config.deposito_ids)
    ? Array.from(
        new Set(config.deposito_ids.map((id) => texto(id)).filter(Boolean))
      )
    : [];
  const produtosPorPagina = normalizarProdutosPorPagina(config);
  const mensagemMultiplos =
    config.mensagem_multiplos_produtos === undefined ||
    config.mensagem_multiplos_produtos === null
      ? MENSAGEM_MULTIPLOS_PRODUTOS_PADRAO
      : String(config.mensagem_multiplos_produtos).slice(0, 600);

  return {
    origem_produto: ORIGENS_PRODUTO.has(origem)
      ? origem
      : CONFIGURACAO_CONSULTAR_ESTOQUE_PADRAO.origem_produto,
    produto_id: texto(config.produto_id),
    variavel_produto: normalizarVariavel(config.variavel_produto),
    variavel_resposta: normalizarVariavel(config.variavel_resposta),
    pesquisar_por: MODOS_PESQUISA.has(pesquisa)
      ? pesquisa
      : CONFIGURACAO_CONSULTAR_ESTOQUE_PADRAO.pesquisar_por,
    deposito_modo: MODOS_DEPOSITO.has(depositoModo)
      ? depositoModo
      : CONFIGURACAO_CONSULTAR_ESTOQUE_PADRAO.deposito_modo,
    deposito_id: texto(config.deposito_id),
    deposito_ids: depositoIds.slice(0, 50),
    usar_embalagem_venda: config.usar_embalagem_venda !== false,
    validar_quantidade_solicitada:
      config.validar_quantidade_solicitada === true ||
      config.validar_quantidade_solicitada === "true",
    variavel_quantidade: normalizarVariavel(config.variavel_quantidade),
    produtos_por_pagina: produtosPorPagina,
    mensagem_multiplos_produtos: mensagemMultiplos,
    limite_candidatos: produtosPorPagina,
  };
}

function descricaoProduto(produto: ProdutoOpcao) {
  const identificadores = [
    produto.codigo ? `Cód. ${produto.codigo}` : "",
    produto.sku ? `SKU ${produto.sku}` : "",
    produto.codigo_barras ? `EAN ${produto.codigo_barras}` : "",
  ].filter(Boolean);

  return `${produto.nome}${
    identificadores.length ? ` · ${identificadores.join(" · ")}` : ""
  }`;
}

export default function ConsultarEstoqueConfig({
  configuracao,
  variaveis,
  onChange,
}: Props) {
  const datalistId = useId();
  const config = useMemo(
    () => normalizarConfiguracaoConsultarEstoque(configuracao),
    [configuracao]
  );
  const [produtos, setProdutos] = useState<ProdutoOpcao[]>([]);
  const [depositos, setDepositos] = useState<DepositoOpcao[]>([]);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const atualizar = useCallback(
    (patch: Partial<ConfiguracaoConsultarEstoque>) => {
      onChange({ ...config, ...patch });
    },
    [config, onChange]
  );

  const carregarOpcoes = useCallback(
    async (busca = "") => {
      try {
        setCarregando(true);
        setErro("");
        const params = new URLSearchParams();
        if (busca.trim()) params.set("q", busca.trim());
        if (config.produto_id) params.set("produto_id", config.produto_id);

        const response = await fetch(
          `/api/automacoes/estoque/opcoes?${params.toString()}`,
          { cache: "no-store" }
        );
        const json = await response.json().catch(() => ({}));

        if (!response.ok || json.ok !== true) {
          throw new Error(json.error || "Não foi possível carregar o estoque.");
        }

        setProdutos(Array.isArray(json.produtos) ? json.produtos : []);
        setDepositos(Array.isArray(json.depositos) ? json.depositos : []);
      } catch (error) {
        setErro(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar produtos e depósitos."
        );
      } finally {
        setCarregando(false);
      }
    },
    [config.produto_id]
  );

  useEffect(() => {
    void carregarOpcoes();
  }, [carregarOpcoes]);

  return (
    <div className={styles.root}>
      <div className={styles.intro}>
        <strong>Consulta em tempo real</strong>
        <span>
          Em buscas por texto, o bloco usa IA quando houver tokens para interpretar
          o que o cliente deseja. Se encontrar vários produtos, o próprio bloco
          envia as opções, aguarda a escolha e trata a paginação internamente.
          Também pode revalidar o saldo do produto escolhido antes da compra.
          A consulta não reserva, movimenta ou altera saldo.
        </span>
      </div>

      <label className={styles.field}>
        <span>Produto vem de</span>
        <select
          value={config.origem_produto}
          onChange={(event) =>
            atualizar({
              origem_produto: event.target.value as OrigemProdutoConsultaEstoque,
            })
          }
        >
          <option value="resposta_cliente">Resposta atual do cliente</option>
          <option value="variavel">Variável do fluxo</option>
          <option value="produto_especifico">Produto específico</option>
          <option value="produto_selecionado_anteriormente">
            Produto selecionado anteriormente
          </option>
        </select>
      </label>

      {config.origem_produto === "produto_selecionado_anteriormente" && (
        <div className={styles.intro}>
          <strong>Reutilizar o produto já escolhido</strong>
          <span>
            Usa automaticamente {"{{estoque_produto_id}}"} gerado por uma consulta
            anterior deste fluxo. O produto é consultado novamente pelo ID, sem nova
            busca por nome e sem consumo de IA.
          </span>
        </div>
      )}

      {config.origem_produto === "produto_especifico" && (
        <div className={styles.stack}>
          <label className={styles.field}>
            <span>Localizar produto</span>
            <div className={styles.searchRow}>
              <input
                value={buscaProduto}
                onChange={(event) => setBuscaProduto(event.target.value)}
                placeholder="Nome, código, SKU ou código de barras"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void carregarOpcoes(buscaProduto);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void carregarOpcoes(buscaProduto)}
                disabled={carregando}
              >
                {carregando ? "Buscando..." : "Buscar"}
              </button>
            </div>
          </label>

          <label className={styles.field}>
            <span>Produto</span>
            <select
              value={config.produto_id}
              onChange={(event) => atualizar({ produto_id: event.target.value })}
              disabled={carregando}
            >
              <option value="">Selecione o produto...</option>
              {produtos.map((produto) => (
                <option key={produto.id} value={produto.id}>
                  {descricaoProduto(produto)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {config.origem_produto === "variavel" && (
        <label className={styles.field}>
          <span>Variável que contém o produto</span>
          <input
            list={datalistId}
            value={config.variavel_produto}
            onChange={(event) =>
              atualizar({
                variavel_produto: normalizarVariavel(event.target.value),
              })
            }
            placeholder="Ex.: produto_desejado"
          />
          <small>
            Pode ser uma variável criada por Capturar resposta ou outra variável
            disponível no fluxo.
          </small>
        </label>
      )}

      {config.origem_produto === "resposta_cliente" && (
        <label className={styles.field}>
          <span>Variável da resposta do cliente</span>
          <input
            list={datalistId}
            value={config.variavel_resposta}
            onChange={(event) =>
              atualizar({
                variavel_resposta: normalizarVariavel(event.target.value),
              })
            }
            placeholder="Ex.: produto_desejado (recomendado)"
          />
          <small>
            Se estiver vazia, o motor usa a mensagem que levou a execução até este
            bloco. Para jornadas com múltiplas etapas, prefira uma variável capturada.
          </small>
        </label>
      )}

      <datalist id={datalistId}>
        {variaveis.map((variavel) => (
          <option key={variavel.key} value={variavel.key}>
            {variavel.description}
          </option>
        ))}
      </datalist>

      {config.origem_produto !== "produto_selecionado_anteriormente" && (
        <label className={styles.field}>
          <span>Pesquisar por</span>
          <select
            value={config.pesquisar_por}
            onChange={(event) =>
              atualizar({
                pesquisar_por: event.target.value as ModoPesquisaConsultaEstoque,
              })
            }
          >
            <option value="automatico">Automático (recomendado)</option>
            <option value="nome">Nome</option>
            <option value="codigo_sku">Código / SKU</option>
            <option value="codigo_barras">Código de barras</option>
          </select>
          <small>
            A IA é usada nas buscas por texto. Código/SKU e código de barras seguem
            pela busca exata. Sem tokens, a busca direta continua funcionando.
          </small>
        </label>
      )}

      <label className={styles.field}>
        <span>Escopo de depósitos</span>
        <select
          value={config.deposito_modo}
          onChange={(event) =>
            atualizar({
              deposito_modo: event.target.value as ModoDepositoConsultaEstoque,
            })
          }
        >
          <option value="todos">Todos os depósitos ativos</option>
          <option value="especifico">Um depósito específico</option>
          <option value="selecionados">Depósitos selecionados</option>
        </select>
      </label>

      {config.deposito_modo === "especifico" && (
        <label className={styles.field}>
          <span>Depósito</span>
          <select
            value={config.deposito_id}
            onChange={(event) => atualizar({ deposito_id: event.target.value })}
          >
            <option value="">Selecione o depósito...</option>
            {depositos.map((deposito) => (
              <option key={deposito.id} value={deposito.id}>
                {deposito.nome}
                {deposito.principal ? " · principal" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {config.deposito_modo === "selecionados" && (
        <div className={styles.field}>
          <span>Depósitos considerados</span>
          <div className={styles.checkList}>
            {depositos.map((deposito) => {
              const checked = config.deposito_ids.includes(deposito.id);
              return (
                <label key={deposito.id} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      atualizar({
                        deposito_ids: event.target.checked
                          ? Array.from(
                              new Set([...config.deposito_ids, deposito.id])
                            )
                          : config.deposito_ids.filter(
                              (id) => id !== deposito.id
                            ),
                      })
                    }
                  />
                  <span>
                    {deposito.nome}
                    {deposito.principal ? " · principal" : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={config.usar_embalagem_venda}
          onChange={(event) =>
            atualizar({ usar_embalagem_venda: event.target.checked })
          }
        />
        <span>
          <strong>Considerar embalagem padrão de venda</strong>
          <small>
            Retorna fator, preço da embalagem e quantidade de embalagens completas
            disponíveis.
          </small>
        </span>
      </label>

      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={config.validar_quantidade_solicitada}
          onChange={(event) =>
            atualizar({ validar_quantidade_solicitada: event.target.checked })
          }
        />
        <span>
          <strong>Validar quantidade solicitada</strong>
          <small>
            Consulta novamente o saldo atual e só retorna Disponível quando houver
            quantidade suficiente para atender o valor capturado no fluxo.
          </small>
        </span>
      </label>

      {config.validar_quantidade_solicitada && (
        <label className={styles.field}>
          <span>Variável da quantidade solicitada</span>
          <input
            list={datalistId}
            value={config.variavel_quantidade}
            onChange={(event) =>
              atualizar({
                variavel_quantidade: normalizarVariavel(event.target.value),
              })
            }
            placeholder="Ex.: quantidade_desejada"
          />
          <small>
            Use a variável criada pelo bloco Capturar resposta, por exemplo
            {" {{quantidade_desejada}}"}. O Consultar estoque não cria uma nova
            variável de quantidade solicitada.
          </small>
        </label>
      )}

      <label className={styles.field}>
        <span>Produtos por página</span>
        <select
          value={String(config.produtos_por_pagina)}
          onChange={(event) => {
            const valor = Number(event.target.value);
            atualizar({
              produtos_por_pagina: valor,
              limite_candidatos: valor,
            });
          }}
        >
          <option value="5">5 produtos</option>
          <option value="10">10 produtos</option>
          <option value="15">15 produtos</option>
        </select>
        <small>
          Se houver mais resultados, o cliente poderá responder “mais” ou “voltar”.
          A navegação acontece dentro do próprio bloco sem uma nova consulta de IA.
        </small>
      </label>

      <label className={styles.field}>
        <span>Mensagem quando encontrar vários produtos</span>
        <textarea
          value={config.mensagem_multiplos_produtos}
          maxLength={600}
          onChange={(event) =>
            atualizar({ mensagem_multiplos_produtos: event.target.value })
          }
          placeholder={MENSAGEM_MULTIPLOS_PRODUTOS_PADRAO}
        />
        <small>
          Esta mensagem é enviada automaticamente pelo próprio bloco. A página, a
          lista numerada e as instruções de “mais/voltar” são acrescentadas abaixo
          da copy. O cliente escolhe uma opção e o bloco continua a consulta sozinho.
        </small>
      </label>

      <div className={styles.outputs}>
        <strong>Conexões necessárias</strong>
        <small>
          Arraste cada saída do bloco até o próximo passo. O ID da resposta é
          configurado automaticamente pela própria saída e não precisa ser digitado.
        </small>
        <div className={styles.outputGrid}>
          <span>
            <strong>Disponível</strong>
            <br />
            <code
              style={{
                color: "var(--crm-text-muted)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              disponivel
            </code>
          </span>
          <span>
            <strong>Sem estoque</strong>
            <br />
            <code
              style={{
                color: "var(--crm-text-muted)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              sem_estoque
            </code>
          </span>
          <span>
            <strong>Não encontrado</strong>
            <br />
            <code
              style={{
                color: "var(--crm-text-muted)",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              nao_encontrado
            </code>
          </span>
        </div>
        <small>
          Recomendação: Disponível → continuar a venda; Sem estoque → informar a
          indisponibilidade ou fazer nova consulta; Não encontrado → solicitar outro
          produto ou encaminhar para atendimento. Vários resultados continuam sendo
          tratados internamente pelo próprio bloco.
        </small>
      </div>

      {erro && <div className={styles.error}>{erro}</div>}
    </div>
  );
}
