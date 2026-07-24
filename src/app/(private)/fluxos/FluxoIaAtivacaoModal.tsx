"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import styles from "./fluxos.module.css";

type CondicaoGatilho = "contem" | "exata" | "inicia_com" | "regex";

type FluxoResumo = {
  id: string;
  nome?: string | null;
  descricao?: string | null;
  status?: string | null;
  fluxo_padrao?: boolean | null;
  created_at?: string | null;
};

type GatilhoResumo = {
  id: string;
  valor?: string | null;
  ativo?: boolean | null;
};

type RespostaFluxos = {
  ok?: boolean;
  error?: string;
  fluxos?: FluxoResumo[];
};

type RespostaGatilhos = {
  ok?: boolean;
  error?: string;
  gatilhos?: GatilhoResumo[];
};

const JANELA_ABERTURA_MODAL_MS = 15 * 60 * 1000;
const PREFIXO_MARCADOR_SESSAO = "prosperity:fluxo-ia:ativacao:";

function fluxoCriadoPorIa(fluxo: FluxoResumo) {
  const nome = String(fluxo.nome || "").trim();
  const descricao = String(fluxo.descricao || "").toLowerCase();

  return (
    /^✨\s*IA\s*-/i.test(nome) ||
    descricao.includes("fluxo criado pelo assistente de ia")
  );
}

function fluxoFoiCriadoRecentemente(fluxo: FluxoResumo) {
  const criadoEm = new Date(String(fluxo.created_at || "")).getTime();
  if (!Number.isFinite(criadoEm)) return false;

  const diferenca = Date.now() - criadoEm;
  return diferenca >= -60_000 && diferenca <= JANELA_ABERTURA_MODAL_MS;
}

function marcadorSessao(fluxoId: string) {
  return `${PREFIXO_MARCADOR_SESSAO}${fluxoId}`;
}

async function lerJson<T>(response: Response): Promise<T> {
  const texto = await response.text();

  if (!texto.trim()) return {} as T;

  try {
    return JSON.parse(texto) as T;
  } catch {
    return {} as T;
  }
}

export default function FluxoIaAtivacaoModal() {
  const searchParams = useSearchParams();
  const fluxoId = String(searchParams.get("fluxo") || "").trim();

  const [aberto, setAberto] = useState(false);
  const [fluxo, setFluxo] = useState<FluxoResumo | null>(null);
  const [existeOutroFluxoPadrao, setExisteOutroFluxoPadrao] = useState(false);
  const [usarComoPadrao, setUsarComoPadrao] = useState(false);
  const [palavraChave, setPalavraChave] = useState("");
  const [condicao, setCondicao] = useState<CondicaoGatilho>("contem");
  const [gatilhosAtivos, setGatilhosAtivos] = useState<GatilhoResumo[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;

    async function verificarFluxoCriado() {
      setAberto(false);
      setFluxo(null);
      setErro("");
      setPalavraChave("");
      setCondicao("contem");
      setGatilhosAtivos([]);
      setUsarComoPadrao(false);

      if (!fluxoId) return;
      if (window.sessionStorage.getItem(marcadorSessao(fluxoId))) return;

      try {
        const [resFluxos, resGatilhos] = await Promise.all([
          fetch("/api/automacoes", { cache: "no-store" }),
          fetch(`/api/automacoes/${encodeURIComponent(fluxoId)}/gatilhos`, {
            cache: "no-store",
          }),
        ]);

        const [jsonFluxos, jsonGatilhos] = await Promise.all([
          lerJson<RespostaFluxos>(resFluxos),
          lerJson<RespostaGatilhos>(resGatilhos),
        ]);

        if (cancelado || !resFluxos.ok || !jsonFluxos.ok) return;

        const fluxos = Array.isArray(jsonFluxos.fluxos)
          ? jsonFluxos.fluxos
          : [];
        const fluxoSelecionado = fluxos.find((item) => item.id === fluxoId);

        if (
          !fluxoSelecionado ||
          String(fluxoSelecionado.status || "") !== "rascunho" ||
          !fluxoCriadoPorIa(fluxoSelecionado) ||
          !fluxoFoiCriadoRecentemente(fluxoSelecionado)
        ) {
          return;
        }

        const gatilhos =
          resGatilhos.ok && jsonGatilhos.ok && Array.isArray(jsonGatilhos.gatilhos)
            ? jsonGatilhos.gatilhos.filter((item) => item.ativo === true)
            : [];
        const outroPadrao = fluxos.some(
          (item) =>
            item.id !== fluxoSelecionado.id &&
            item.fluxo_padrao === true &&
            String(item.status || "") !== "arquivado"
        );

        if (cancelado) return;

        setFluxo(fluxoSelecionado);
        setExisteOutroFluxoPadrao(outroPadrao);
        setUsarComoPadrao(
          fluxoSelecionado.fluxo_padrao === true && !outroPadrao
        );
        setGatilhosAtivos(gatilhos);
        setAberto(true);
      } catch {
        // A falha desta orientação não interfere no fluxo recém-criado.
      }
    }

    void verificarFluxoCriado();

    return () => {
      cancelado = true;
    };
  }, [fluxoId]);

  function fecharParaConfigurarDepois() {
    if (!fluxo?.id || salvando) return;

    window.sessionStorage.setItem(marcadorSessao(fluxo.id), "adiado");
    setAberto(false);
  }

  async function salvarConfiguracao() {
    if (!fluxo?.id || salvando) return;

    const palavra = palavraChave.trim().toLowerCase();
    const jaPossuiPalavraChave = gatilhosAtivos.length > 0;

    if (!usarComoPadrao && !jaPossuiPalavraChave && !palavra) {
      setErro(
        "Cadastre uma palavra-chave ou torne este fluxo o padrão antes de continuar."
      );
      return;
    }

    try {
      setSalvando(true);
      setErro("");

      if (usarComoPadrao) {
        const response = await fetch("/api/automacoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: fluxo.id,
            fluxo_padrao: true,
          }),
        });
        const json = await lerJson<{ ok?: boolean; error?: string }>(response);

        if (!response.ok || !json.ok) {
          throw new Error(json.error || "Erro ao definir o fluxo padrão.");
        }
      } else if (!jaPossuiPalavraChave) {
        const response = await fetch(
          `/api/automacoes/${encodeURIComponent(fluxo.id)}/gatilhos`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tipo_gatilho: "palavra_chave",
              valor: palavra,
              condicao,
            }),
          }
        );
        const json = await lerJson<{ ok?: boolean; error?: string }>(response);

        if (!response.ok || !json.ok) {
          throw new Error(json.error || "Erro ao cadastrar a palavra-chave.");
        }
      }

      window.sessionStorage.setItem(marcadorSessao(fluxo.id), "configurado");
      setAberto(false);
      window.location.reload();
    } catch (error: unknown) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a configuração inicial do fluxo."
      );
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto || !fluxo) return null;

  const podeEscolherPadrao = !existeOutroFluxoPadrao || fluxo.fluxo_padrao === true;
  const possuiGatilhoAtivo = gatilhosAtivos.length > 0;

  return (
    <div className={styles.modalOverlay} role="presentation">
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-configuracao-fluxo-ia"
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Fluxo criado com IA</p>
            <h3
              id="titulo-configuracao-fluxo-ia"
              className={styles.modalTitle}
            >
              Como este fluxo será iniciado?
            </h3>
            <p className={styles.modalSubtitle}>{fluxo.nome}</p>
          </div>

          <button
            type="button"
            className={styles.closePanelButton}
            onClick={fecharParaConfigurarDepois}
            disabled={salvando}
            aria-label="Configurar depois"
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.warningBox}>
            <strong>O fluxo foi salvo como rascunho.</strong>
            <p>
              Para ativar este fluxo, cadastre pelo menos uma palavra-chave ou
              torne-o o fluxo padrão. Depois, revise a estrutura e use o botão
              “Ativar fluxo”.
            </p>
          </div>

          {podeEscolherPadrao && (
            <label className={styles.switchField}>
              <input
                type="checkbox"
                checked={usarComoPadrao}
                onChange={(event) => {
                  setErro("");
                  setUsarComoPadrao(event.target.checked);
                }}
                disabled={salvando}
              />

              <div>
                <strong>Tornar este fluxo padrão</strong>
                <p>
                  Ele será iniciado automaticamente quando nenhuma palavra-chave
                  de outro fluxo for encontrada.
                </p>
              </div>
            </label>
          )}

          {existeOutroFluxoPadrao && (
            <div className={styles.defaultFlowNotice}>
              <div className={styles.defaultFlowIcon}>↪</div>
              <div className={styles.defaultFlowContent}>
                <div className={styles.defaultFlowTop}>
                  <strong>Já existe um fluxo padrão</strong>
                  <span className={styles.defaultFlowBadge}>Padrão</span>
                </div>
                <p>
                  Cadastre uma palavra-chave para definir quando este novo fluxo
                  deve começar.
                </p>
              </div>
            </div>
          )}

          {!usarComoPadrao && (
            <div className={styles.gatilhosBox}>
              <div>
                <p className={styles.modalSectionTitle}>Palavra-chave do fluxo</p>
                <p className={styles.help}>
                  Use a mesma configuração disponível no modal Editar fluxo.
                </p>
              </div>

              {possuiGatilhoAtivo ? (
                <div className={styles.gatilhosList}>
                  {gatilhosAtivos.map((gatilho) => (
                    <div key={gatilho.id} className={styles.gatilhoItem}>
                      <div>
                        <strong className={styles.gatilhoValor}>
                          {gatilho.valor || "Palavra-chave cadastrada"}
                        </strong>
                        <p className={styles.gatilhoMeta}>Ativo</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.gatilhoCreateRow}>
                  <input
                    className={styles.input}
                    value={palavraChave}
                    onChange={(event) => {
                      setErro("");
                      setPalavraChave(event.target.value);
                    }}
                    placeholder="Ex: suporte, orçamento, agendamento"
                    disabled={salvando}
                    autoFocus
                  />

                  <div className={styles.gatilhoBottomRow}>
                    <select
                      className={styles.input}
                      value={condicao}
                      onChange={(event) =>
                        setCondicao(event.target.value as CondicaoGatilho)
                      }
                      disabled={salvando}
                    >
                      <option value="contem">Contém a palavra</option>
                      <option value="exata">Igual exatamente</option>
                      <option value="inicia_com">Começa com</option>
                      <option value="regex">Regex</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {erro && <div className={styles.errorAlert}>{erro}</div>}
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={fecharParaConfigurarDepois}
            disabled={salvando}
          >
            Configurar depois
          </button>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={salvarConfiguracao}
            disabled={salvando}
          >
            {salvando ? "Salvando..." : "Salvar configuração"}
          </button>
        </div>
      </div>
    </div>
  );
}
