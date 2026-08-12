"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";

type InformacaoCaptura = {
  id: string;
  tipo?: string | null;
  nome_campo?: string | null;
  valor: string;
  capturado_em?: string | null;
  automacao_fluxos?:
    | { nome?: string | null }
    | { nome?: string | null }[]
    | null;
};

type ItemDetalhado = {
  informacao: InformacaoCaptura;
  label: string;
};

type ContatoBusca = {
  id?: string | null;
  telefone?: string | null;
  conversa_id?: string | null;
};

const STYLE_ID = "capture-info-panel-v3-style";
const SUMMARY_HOST = "capture-info-panel-v3-summary";
const OVERLAY_HOST = "capture-info-panel-v3-overlay";

const CSS = `
[data-conversas-capture-summary-host] > .captureInfoSummaryRow,
[data-conversas-capture-summary-host] > .captureInfoMoreButton,
[data-conversas-capture-overlay-host],
[data-capture-info-panel-v2-summary] > .captureInfoV2Row,
[data-capture-info-panel-v2-summary] > .captureInfoV2More,
[data-capture-info-panel-v2-overlay] { display: none !important; }
[data-${SUMMARY_HOST}] { display: contents; }
[data-${OVERLAY_HOST}] {
  position: absolute;
  inset: 0;
  z-index: 60;
  pointer-events: none;
}
.captureInfoPanelV3Enabled { position: relative !important; }
.captureInfoV3Row,
.captureInfoV3Item {
  border: 1px solid var(--crm-border-soft, var(--crm-ui-private-border-hex-e7edf3));
  border-radius: 16px;
  background: var(--crm-surface, var(--crm-surface));
  padding: 14px;
}
.captureInfoV3Label {
  display: block;
  color: var(--crm-text-soft, var(--crm-ui-private-content-hex-7b8798));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
}
.captureInfoV3Value {
  display: block;
  margin-top: 6px;
  color: var(--crm-text-strong, var(--crm-ui-private-content-hex-172033));
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.captureInfoV3More {
  width: 100%;
  border: 1px solid var(--crm-border, var(--crm-ui-private-border-hex-d8e0eb));
  border-radius: 12px;
  background: var(--crm-surface-soft, var(--crm-ui-private-surface-hex-f7f9fb));
  color: var(--crm-primary, var(--crm-ui-private-content-hex-08785a));
  padding: 11px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.captureInfoV3More:hover { background: var(--crm-surface-muted, var(--crm-ui-private-surface-hex-eef2f6)); }
.captureInfoV3Overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--crm-surface, var(--crm-surface));
  color: var(--crm-text-strong, var(--crm-ui-private-content-hex-172033));
  pointer-events: auto;
}
.captureInfoV3Header {
  min-height: 58px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--crm-border-soft, var(--crm-ui-private-border-hex-e7edf3));
}
.captureInfoV3Back,
.captureInfoV3Refresh {
  border: 1px solid var(--crm-border, var(--crm-ui-private-border-hex-d8e0eb));
  border-radius: 10px;
  background: var(--crm-surface, var(--crm-surface));
  color: var(--crm-text-strong, var(--crm-ui-private-content-hex-172033));
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.captureInfoV3Back { width: 38px; padding-inline: 0; }
.captureInfoV3Title {
  min-width: 0;
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.captureInfoV3Body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}
.captureInfoV3List {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.captureInfoV3Meta {
  display: block;
  margin-top: 8px;
  color: var(--crm-text-muted, var(--crm-ui-private-content-hex-718096));
  font-size: 11px;
  line-height: 1.4;
}
.captureInfoV3Empty {
  border: 1px dashed var(--crm-border, var(--crm-ui-private-border-hex-d8e0eb));
  border-radius: 14px;
  padding: 18px;
  color: var(--crm-text-muted, var(--crm-ui-private-content-hex-718096));
  font-size: 13px;
  text-align: center;
}
`;

function normalizar(valor: string | null | undefined) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizarTelefone(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "");
}

function encontrarListaInformacoesContato() {
  const secoes = Array.from(
    document.querySelectorAll<HTMLElement>('[class*="whatsContactSection"]')
  );

  const secao = secoes.find((item) => {
    const cabecalho = item.querySelector<HTMLElement>('[class*="whatsSectionHeader"]');
    return normalizar(cabecalho?.textContent).includes("informacoes do contato");
  });

  return secao?.querySelector<HTMLElement>('[class*="whatsInfoList"]') || null;
}

function encontrarLinhaPorLabel(lista: HTMLElement, labelProcurado: string) {
  const procurado = normalizar(labelProcurado);

  return (
    Array.from(lista.children).find((elemento) => {
      const label = elemento.querySelector<HTMLElement>('[class*="whatsInfoLabel"]');
      return normalizar(label?.textContent) === procurado;
    }) as HTMLElement | undefined
  ) || null;
}

function encontrarObservacoes(lista: HTMLElement) {
  return encontrarLinhaPorLabel(lista, "observações");
}

function obterTelefonePainel(lista: HTMLElement) {
  const linha = encontrarLinhaPorLabel(lista, "telefone");
  const valor = linha?.querySelector<HTMLElement>('[class*="whatsInfoValue"]');
  return normalizarTelefone(valor?.textContent);
}

function textoBase(informacao: InformacaoCaptura) {
  return String(informacao.nome_campo || informacao.tipo || "Informação")
    .replace(/[_-]+/g, " ")
    .replace(/\s+\d+\s*$/, "")
    .replace(/\s+captura\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Informação";
}

function chaveGrupo(informacao: InformacaoCaptura) {
  return normalizar(textoBase(informacao)).replace(/[^a-z0-9]+/g, " ").trim();
}

function labelBase(informacao: InformacaoCaptura) {
  const base = textoBase(informacao);
  const normalizado = normalizar(base);
  const nome = normalizado === "email" || normalizado === "e mail" ? "E-mail" : base;
  return `${nome} captura`;
}

function nomeFluxo(informacao: InformacaoCaptura) {
  const relacao = informacao.automacao_fluxos;
  const fluxo = Array.isArray(relacao) ? relacao[0] : relacao;
  return fluxo?.nome || "Fluxo não identificado";
}

function dataCaptura(valor?: string | null) {
  if (!valor) return "Data não informada";
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? "Data não informada"
    : data.toLocaleString("pt-BR");
}

async function lerJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function CaptureInfoPanel() {
  const searchParams = useSearchParams();
  const conversaId = searchParams.get("id")?.trim() || "";
  const [telefonePainel, setTelefonePainel] = useState("");
  const [informacoes, setInformacoes] = useState<InformacaoCaptura[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [summaryHost, setSummaryHost] = useState<HTMLElement | null>(null);
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  const [abaAberta, setAbaAberta] = useState(false);
  const requestIdRef = useRef(0);
  const chaveCarregadaRef = useRef("");
  const carregandoRef = useRef(false);

  const resumo = useMemo(() => {
    const vistos = new Set<string>();
    return informacoes.filter((informacao) => {
      const chave = chaveGrupo(informacao);
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
  }, [informacoes]);

  const itensDetalhados = useMemo<ItemDetalhado[]>(() => {
    const ocorrencias = new Map<string, number>();

    return informacoes.map((informacao) => {
      const chave = chaveGrupo(informacao);
      const indice = ocorrencias.get(chave) || 0;
      ocorrencias.set(chave, indice + 1);

      return {
        informacao,
        label: `${labelBase(informacao)}${indice > 0 ? ` ${indice}` : ""}`,
      };
    });
  }, [informacoes]);

  const possuiDuplicadas = informacoes.length > resumo.length;

  async function carregarPorContatoId(contatoId: string) {
    const response = await fetch(
      `/api/contatos/${encodeURIComponent(contatoId)}/informacoes-captura`,
      {
        cache: "no-store",
        headers: { "X-Origem-Modulo": "conversas" },
      }
    );
    const data = await lerJson(response);

    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || "Erro ao carregar informações de captura.");
    }

    return Array.isArray(data.informacoes)
      ? (data.informacoes as InformacaoCaptura[])
      : [];
  }

  async function carregarPorTelefone(telefone: string) {
    const telefoneNormalizado = normalizarTelefone(telefone);
    if (!telefoneNormalizado) return [];

    const params = new URLSearchParams({
      busca: telefoneNormalizado,
      limite: "50",
    });
    const response = await fetch(`/api/contatos?${params.toString()}`, {
      cache: "no-store",
    });
    const data = await lerJson(response);

    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || "Erro ao localizar o contato da conversa.");
    }

    const contatos = Array.isArray(data.contatos)
      ? (data.contatos as ContatoBusca[])
      : [];
    const exatos = contatos.filter(
      (contato) => normalizarTelefone(contato.telefone) === telefoneNormalizado
    );
    const contato =
      exatos.find((item) => conversaId && item.conversa_id === conversaId) ||
      exatos[0] ||
      contatos[0];
    const contatoId = String(contato?.id || "").trim();

    if (!contatoId) return [];
    return carregarPorContatoId(contatoId);
  }

  async function carregar(forcar = false) {
    const chaveAtual = conversaId || telefonePainel;
    if (!chaveAtual) return;
    if (!forcar && (carregandoRef.current || chaveCarregadaRef.current === chaveAtual)) {
      return;
    }

    const requestId = ++requestIdRef.current;
    carregandoRef.current = true;
    setCarregando(true);
    setErro("");

    try {
      let dados: InformacaoCaptura[] = [];
      let erroConversa: Error | null = null;

      if (conversaId) {
        try {
          const response = await fetch(
            `/api/conversas/${encodeURIComponent(conversaId)}/informacoes-captura`,
            { cache: "no-store" }
          );
          const data = await lerJson(response);

          if (!response.ok || data?.ok === false) {
            throw new Error(data?.error || "Erro ao carregar capturas pela conversa.");
          }

          dados = Array.isArray(data.informacoes)
            ? (data.informacoes as InformacaoCaptura[])
            : [];
        } catch (error) {
          erroConversa =
            error instanceof Error
              ? error
              : new Error("Erro ao carregar capturas pela conversa.");
        }
      }

      if (dados.length === 0 && telefonePainel) {
        const dadosPorTelefone = await carregarPorTelefone(telefonePainel);
        if (dadosPorTelefone.length > 0 || !conversaId) {
          dados = dadosPorTelefone;
          erroConversa = null;
        }
      }

      if (dados.length === 0 && erroConversa && !telefonePainel) {
        throw erroConversa;
      }

      if (requestId !== requestIdRef.current) return;
      setInformacoes(dados);
      chaveCarregadaRef.current = chaveAtual;
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setInformacoes([]);
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao carregar informações de captura."
      );
      chaveCarregadaRef.current = chaveAtual;
    } finally {
      if (requestId === requestIdRef.current) {
        carregandoRef.current = false;
        setCarregando(false);
      }
    }
  }

  useEffect(() => {
    requestIdRef.current += 1;
    carregandoRef.current = false;
    chaveCarregadaRef.current = "";
    setInformacoes([]);
    setErro("");
    setAbaAberta(false);
  }, [conversaId]);

  useEffect(() => {
    if (conversaId || telefonePainel) void carregar();
  }, [conversaId, telefonePainel]);

  useEffect(() => {
    let frame: number | null = null;

    const sincronizarHosts = () => {
      const lista = encontrarListaInformacoesContato();
      const observacoes = lista ? encontrarObservacoes(lista) : null;

      if (lista && observacoes) {
        const telefoneAtual = obterTelefonePainel(lista);
        setTelefonePainel((atual) =>
          atual === telefoneAtual ? atual : telefoneAtual
        );

        let host = lista.querySelector<HTMLElement>(`[data-${SUMMARY_HOST}]`);
        if (!host) {
          host = document.createElement("div");
          host.setAttribute(`data-${SUMMARY_HOST}`, "true");
          observacoes.insertAdjacentElement("afterend", host);
        } else if (observacoes.nextElementSibling !== host) {
          observacoes.insertAdjacentElement("afterend", host);
        }
        setSummaryHost((atual) => (atual === host ? atual : host));
      } else {
        setSummaryHost(null);
        setTelefonePainel("");
        setAbaAberta(false);
      }

      const painel =
        lista?.closest<HTMLElement>('aside, [class*="rightPanel"]') ||
        document.querySelector<HTMLElement>('aside[class*="rightPanel"]');

      if (painel) {
        painel.classList.add("captureInfoPanelV3Enabled");
        let host = painel.querySelector<HTMLElement>(`[data-${OVERLAY_HOST}]`);
        if (!host) {
          host = document.createElement("div");
          host.setAttribute(`data-${OVERLAY_HOST}`, "true");
          painel.appendChild(host);
        }
        setOverlayHost((atual) => (atual === host ? atual : host));
      } else {
        setOverlayHost(null);
        setAbaAberta(false);
      }
    };

    const agendar = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        sincronizarHosts();
      });
    };

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    const criouStyle = !style;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    agendar();
    const observer = new MutationObserver(agendar);
    observer.observe(document.body, { childList: true, subtree: true });
    const intervalo = window.setInterval(agendar, 700);

    return () => {
      observer.disconnect();
      window.clearInterval(intervalo);
      if (frame !== null) window.cancelAnimationFrame(frame);
      document
        .querySelectorAll(`[data-${SUMMARY_HOST}], [data-${OVERLAY_HOST}]`)
        .forEach((item) => item.remove());
      document
        .querySelectorAll(".captureInfoPanelV3Enabled")
        .forEach((item) => item.classList.remove("captureInfoPanelV3Enabled"));
      if (criouStyle) style?.remove();
    };
  }, []);

  const resumoPortal =
    summaryHost && summaryHost.isConnected && !carregando && resumo.length > 0
      ? createPortal(
          <>
            {resumo.map((informacao) => (
              <div className="captureInfoV3Row" key={informacao.id}>
                <span className="captureInfoV3Label">{labelBase(informacao)}</span>
                <strong className="captureInfoV3Value">{informacao.valor}</strong>
              </div>
            ))}
            {possuiDuplicadas && (
              <button
                type="button"
                className="captureInfoV3More"
                onClick={() => setAbaAberta(true)}
              >
                Ver mais
              </button>
            )}
          </>,
          summaryHost
        )
      : null;

  const overlayPortal =
    overlayHost && overlayHost.isConnected && abaAberta
      ? createPortal(
          <section className="captureInfoV3Overlay" aria-label="Informações de captura">
            <header className="captureInfoV3Header">
              <button
                type="button"
                className="captureInfoV3Back"
                onClick={() => setAbaAberta(false)}
                aria-label="Voltar para detalhes do contato"
              >
                ←
              </button>
              <h3 className="captureInfoV3Title">Informações de captura</h3>
              <button
                type="button"
                className="captureInfoV3Refresh"
                onClick={() => void carregar(true)}
                disabled={carregando}
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
            </header>

            <div className="captureInfoV3Body">
              {carregando && informacoes.length === 0 ? (
                <div className="captureInfoV3Empty">Carregando informações...</div>
              ) : erro ? (
                <div className="captureInfoV3Empty">{erro}</div>
              ) : informacoes.length === 0 ? (
                <div className="captureInfoV3Empty">
                  Nenhuma informação foi capturada por um fluxo ainda.
                </div>
              ) : (
                <div className="captureInfoV3List">
                  {itensDetalhados.map(({ informacao, label }) => (
                    <article className="captureInfoV3Item" key={informacao.id}>
                      <span className="captureInfoV3Label">{label}</span>
                      <strong className="captureInfoV3Value">{informacao.valor}</strong>
                      <small className="captureInfoV3Meta">
                        {nomeFluxo(informacao)} · {dataCaptura(informacao.capturado_em)}
                      </small>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>,
          overlayHost
        )
      : null;

  return (
    <>
      {resumoPortal}
      {overlayPortal}
    </>
  );
}
