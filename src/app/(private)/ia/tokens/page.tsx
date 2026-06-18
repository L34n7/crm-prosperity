"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import Header from "@/components/Header";
import { solicitarAtualizacaoSaldoTokensIa } from "@/lib/ia/tokens-client-events";
import styles from "./tokens.module.css";

type SaldoTokensIa = {
  limite_mensal: number | null;
  tokens_usados: number;
  tokens_restantes: number | null;
  saldo_mensal_restante: number | null;
  saldo_avulso_restante: number;
  tokens_mensais_usados: number;
  periodo_inicio: string;
  periodo_fim: string;
};

type UsoTokensIa = {
  id: string;
  origem: string;
  modelo: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_total: number;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

type TotaisTokens = {
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
};

type MovimentacaoTokens = {
  id: string;
  tipo: "renovacao" | "recarga" | "ajuste";
  referencia: string;
  quantidade_tokens: number;
  saldo_mensal_apos: number | null;
  saldo_avulso_apos: number;
  created_at: string;
};

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMesIso() {
  const agora = new Date();
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function dataIso(data: Date) {
  return data.toISOString().slice(0, 10);
}

function diasAtrasIso(dias: number) {
  const data = new Date();
  data.setDate(data.getDate() - (dias - 1));
  return dataIso(data);
}

function formatarData(valor?: string | null) {
  if (!valor) return "-";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(valor));
  } catch {
    return "-";
  }
}

function formatarPeriodo(valor?: string | null) {
  if (!valor) return "-";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
    }).format(new Date(valor));
  } catch {
    return "-";
  }
}

function formatarNumero(valor?: number | null) {
  if (valor === null || valor === undefined) return "-";
  return new Intl.NumberFormat("pt-BR").format(valor);
}

function origemLabel(origem: string) {
  if (origem === "interpretar_conexao") return "Interpretação de conexão";
  if (origem === "interpretar_arquivo") return "Análise de arquivo";
  if (origem === "transcrever_audio") return "Transcrição de áudio";
  return origem.replace(/_/g, " ");
}

function origemClass(origem: string) {
  if (origem === "interpretar_conexao") return styles.badgeBlue;
  if (origem === "interpretar_arquivo") return styles.badgeGreen;
  if (origem === "transcrever_audio") return styles.badgeYellow;
  return styles.badgeGray;
}

export default function ExtratoTokensIaPage() {
  const [saldo, setSaldo] = useState<SaldoTokensIa | null>(null);
  const [usos, setUsos] = useState<UsoTokensIa[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoTokens[]>([]);
  const [totais, setTotais] = useState<TotaisTokens>({
    tokens_input: 0,
    tokens_output: 0,
    tokens_total: 0,
  });
  const [dataInicio, setDataInicio] = useState(primeiroDiaMesIso());
  const [dataFim, setDataFim] = useState(hojeIso());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [renovacoesOpen, setRenovacoesOpen] = useState(false);

  const percentualUsado = useMemo(() => {
    if (!saldo?.limite_mensal) return 0;
    return Math.min(
      100,
      Math.round((saldo.tokens_mensais_usados / saldo.limite_mensal) * 100)
    );
  }, [saldo]);

  async function carregarSaldo() {
    const res = await fetch("/api/ia/tokens", { cache: "no-store" });
    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao carregar saldo.");
    }

    const saldoAtualizado = json.saldo || null;

    setSaldo(saldoAtualizado);
    solicitarAtualizacaoSaldoTokensIa({ saldo: saldoAtualizado });
  }

  async function carregarUsos() {
    const params = new URLSearchParams();

    if (dataInicio) params.set("data_inicio", dataInicio);
    if (dataFim) params.set("data_fim", dataFim);
    params.set("limit", "500");

    const res = await fetch(`/api/ia/tokens/usos?${params.toString()}`, {
      cache: "no-store",
    });
    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao carregar extrato.");
    }

    setUsos(json.usos || []);
    setTotais(
      json.totais || {
        tokens_input: 0,
        tokens_output: 0,
        tokens_total: 0,
      }
    );
  }

  async function carregarMovimentacoes() {
    const params = new URLSearchParams();

    if (dataInicio) params.set("data_inicio", dataInicio);
    if (dataFim) params.set("data_fim", dataFim);

    const res = await fetch(`/api/ia/tokens/movimentacoes?${params.toString()}`, {
      cache: "no-store",
    });
    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || "Erro ao carregar movimentacoes.");
    }

    setMovimentacoes(json.movimentacoes || []);
  }

  async function carregarDados() {
    setCarregando(true);
    setErro("");

    try {
      await Promise.all([
        carregarSaldo(),
        carregarUsos(),
        carregarMovimentacoes(),
      ]);
    } catch (error: unknown) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao carregar extrato de tokens."
      );
    } finally {
      setCarregando(false);
    }
  }

  function limparFiltros() {
    setDataInicio(primeiroDiaMesIso());
    setDataFim(hojeIso());
  }

  function aplicarAtalhoPeriodo(tipo: "7_dias" | "15_dias" | "mes_passado" | "3_meses" | "6_meses") {
    const hoje = new Date();

    if (tipo === "mes_passado") {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      setDataInicio(dataIso(inicio));
      setDataFim(dataIso(fim));
      return;
    }

    if (tipo === "7_dias") setDataInicio(diasAtrasIso(7));
    if (tipo === "15_dias") setDataInicio(diasAtrasIso(15));

    if (tipo === "3_meses" || tipo === "6_meses") {
      const inicio = new Date(hoje);
      inicio.setMonth(inicio.getMonth() - (tipo === "3_meses" ? 3 : 6));
      setDataInicio(dataIso(inicio));
    }

    setDataFim(hojeIso());
  }

  useEffect(() => {
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!renovacoesOpen) return;

    function fecharComEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setRenovacoesOpen(false);
    }

    window.addEventListener("keydown", fecharComEscape);
    return () => window.removeEventListener("keydown", fecharComEscape);
  }, [renovacoesOpen]);

  return (
    <>
      <Header
        title="Extrato de tokens"
        subtitle="Acompanhe o consumo mensal e cada uso de IA da empresa."
      />

      <main className={styles.pageContent}>
        <section className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <span>Saldo disponível</span>
            <strong>{formatarNumero(saldo?.tokens_restantes)}</strong>
            <p>Saldo mensal somado aos pacotes avulsos.</p>
          </div>

          <div className={styles.summaryCard}>
            <span>Saldo mensal</span>
            <strong>{formatarNumero(saldo?.saldo_mensal_restante)}</strong>
            <p>{percentualUsado}% consumido no ciclo atual.</p>
          </div>

          <div className={styles.summaryCard}>
            <span>Saldo avulso</span>
            <strong>{formatarNumero(saldo?.saldo_avulso_restante)}</strong>
            <p>Pacotes comprados sem expiração mensal.</p>
          </div>

          <div className={styles.summaryCard}>
            <span>Mensalidade</span>
            <strong>{formatarNumero(saldo?.limite_mensal)}</strong>
            <p>
              Ciclo {formatarPeriodo(saldo?.periodo_inicio)} ate{" "}
              {formatarPeriodo(saldo?.periodo_fim)}
            </p>
          </div>

          <div className={styles.summaryCard}>
            <span>Total filtrado</span>
            <strong>{formatarNumero(totais.tokens_total)}</strong>
            <p>
              {formatarNumero(totais.tokens_input)} entrada /{" "}
              {formatarNumero(totais.tokens_output)} saída
            </p>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Filtros</p>
              <h2 className={styles.cardTitle}>Consumo por período</h2>
              <p className={styles.cardDescription}>
                Filtre por data para ver quais recursos consumiram tokens.
              </p>
            </div>

            <Link href="/ia/tokens/pacotes" className={styles.buyTokensButton}>
              Comprar tokens
            </Link>
          </div>

          <div className={styles.filtersGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Data inicial</span>
              <input
                className={styles.input}
                type="date"
                value={dataInicio}
                onChange={(event) => setDataInicio(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Data final</span>
              <input
                className={styles.input}
                type="date"
                value={dataFim}
                onChange={(event) => setDataFim(event.target.value)}
              />
            </label>

            <div className={styles.actionsRow}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={carregarDados}
                disabled={carregando}
              >
                Filtrar
              </button>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={limparFiltros}
                disabled={carregando}
              >
                Mês atual
              </button>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setRenovacoesOpen(true)}
              >
                Renovações
              </button>
            </div>
          </div>

          <div className={styles.shortcutRow}>
            <span>Atalhos</span>
            <button type="button" onClick={() => aplicarAtalhoPeriodo("7_dias")}>
              7 dias
            </button>
            <button type="button" onClick={() => aplicarAtalhoPeriodo("15_dias")}>
              15 dias
            </button>
            <button type="button" onClick={() => aplicarAtalhoPeriodo("mes_passado")}>
              Mês passado
            </button>
            <button type="button" onClick={() => aplicarAtalhoPeriodo("3_meses")}>
              3 meses
            </button>
            <button type="button" onClick={() => aplicarAtalhoPeriodo("6_meses")}>
              6 meses
            </button>
          </div>

          {erro && <div className={styles.alertError}>{erro}</div>}
        </section>

        <section className={styles.card}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Extrato</p>
              <h2 className={styles.cardTitle}>Usos registrados</h2>
            </div>
            <span className={styles.infoBadge}>{usos.length} registro(s)</span>
          </div>

          {carregando ? (
            <div className={styles.emptyState}>Carregando extrato...</div>
          ) : usos.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhum consumo de IA encontrado nesse período.
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Origem</th>
                    <th>Modelo</th>
                    <th>Entrada</th>
                    <th>Saída</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {usos.map((uso) => (
                    <tr key={uso.id}>
                      <td>{formatarData(uso.created_at)}</td>
                      <td>
                        <span
                          className={`${styles.badge} ${origemClass(
                            uso.origem
                          )}`}
                        >
                          {origemLabel(uso.origem)}
                        </span>
                      </td>
                      <td>{uso.modelo || "-"}</td>
                      <td>{formatarNumero(uso.tokens_input)}</td>
                      <td>{formatarNumero(uso.tokens_output)}</td>
                      <td>
                        <strong>{formatarNumero(uso.tokens_total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>

      {renovacoesOpen && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="renovacoes-title"
          onClick={() => setRenovacoesOpen(false)}
        >
          <section
            className={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Créditos</p>
                <h2 id="renovacoes-title" className={styles.cardTitle}>
                  Renovações e recargas
                </h2>
                <p className={styles.cardDescription}>
                  Movimentações encontradas no período selecionado.
                </p>
              </div>

              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setRenovacoesOpen(false)}
                aria-label="Fechar renovações"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {carregando ? (
              <div className={styles.emptyState}>Carregando movimentações...</div>
            ) : movimentacoes.length === 0 ? (
              <div className={styles.emptyState}>
                Nenhuma renovação ou recarga encontrada nesse período.
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Tipo</th>
                      <th>Referência</th>
                      <th>Tokens</th>
                      <th>Saldo mensal</th>
                      <th>Saldo avulso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentacoes.map((movimentacao) => (
                      <tr key={movimentacao.id}>
                        <td>{formatarData(movimentacao.created_at)}</td>
                        <td>{movimentacao.tipo}</td>
                        <td>{movimentacao.referencia}</td>
                        <td>
                          <strong>
                            + {formatarNumero(movimentacao.quantidade_tokens)}
                          </strong>
                        </td>
                        <td>{formatarNumero(movimentacao.saldo_mensal_apos)}</td>
                        <td>{formatarNumero(movimentacao.saldo_avulso_apos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
