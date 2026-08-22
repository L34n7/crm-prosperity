"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { TemplateVariableOption } from "@/components/TemplateVariableCombobox";
import styles from "./ConsultarEstoqueConfig.module.css";

export type OrigemProdutoConsultaEstoque =
  | "resposta_cliente"
  | "variavel"
  | "produto_especifico";
export type ModoPesquisaConsultaEstoque =
  | "automatico"
  | "nome"
  | "codigo_sku"
  | "codigo_barras";
export type ModoDepositoConsultaEstoque =
  | "todos"
  | "especifico"
  | "selecionados";

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
  limite_candidatos: 5,
};

const ORIGENS_PRODUTO = new Set<OrigemProdutoConsultaEstoque>([
  "resposta_cliente",
  "variavel",
  "produto_especifico",
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
  const limiteInformado = Number(config.limite_candidatos || 5);

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
    limite_candidatos: [3, 5, 10].includes(limiteInformado)
      ? limiteInformado
      : 5,
  };
}

function descricaoProduto(produto: ProdutoOpcao) {
  const identificadores = [
    produto.codigo ? `Cód. ${produto.codigo}` : "",
    produto.sku ? `SKU ${produto.sku}` : "",
    produto.codigo_barras ? `EAN ${produto.codigo_barras}` : "",
  ].filter(Boolean);

  return `${produto.nome}${identificadores.length ? ` · ${identificadores.join(" · ")}` : ""}`;
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
      onChange({
        ...config,
        ...patch,
      });
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
          O bloco apenas lê o estoque. Ele não reserva, movimenta ou altera saldo.
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
        </select>
      </label>

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
              atualizar({ variavel_produto: normalizarVariavel(event.target.value) })
            }
            placeholder="Ex.: produto_desejado"
          />
          <small>
            Pode ser uma variável criada por Capturar resposta ou outra variável disponível no fluxo.
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
              atualizar({ variavel_resposta: normalizarVariavel(event.target.value) })
            }
            placeholder="Ex.: produto_desejado (recomendado)"
          />
          <small>
            Se estiver vazia, o motor usa a mensagem que levou a execução até este bloco. Para jornadas com múltiplas etapas, prefira uma variável capturada.
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
          Código, SKU e código de barras têm prioridade. Busca textual ambígua nunca escolhe um produto arbitrariamente.
        </small>
      </label>

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
                {deposito.nome}{deposito.principal ? " · principal" : ""}
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
                          : config.deposito_ids.filter((id) => id !== deposito.id),
                      })
                    }
                  />
                  <span>{deposito.nome}{deposito.principal ? " · principal" : ""}</span>
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
            Retorna fator, preço da embalagem e quantidade de embalagens completas disponíveis.
          </small>
        </span>
      </label>

      <label className={styles.field}>
        <span>Máximo de candidatos em resultado ambíguo</span>
        <select
          value={String(config.limite_candidatos)}
          onChange={(event) =>
            atualizar({ limite_candidatos: Number(event.target.value) })
          }
        >
          <option value="3">3 produtos</option>
          <option value="5">5 produtos</option>
          <option value="10">10 produtos</option>
        </select>
      </label>

      <div className={styles.outputs}>
        <strong>Saídas do bloco</strong>
        <div className={styles.outputGrid}>
          <span>Disponível</span>
          <span>Sem estoque</span>
          <span>Não encontrado</span>
          <span>Vários encontrados</span>
        </div>
        <small>
          O fluxo só poderá ser ativado quando cada uma das quatro saídas estiver conectada exatamente uma vez.
        </small>
      </div>

      {erro && <div className={styles.error}>{erro}</div>}
    </div>
  );
}
