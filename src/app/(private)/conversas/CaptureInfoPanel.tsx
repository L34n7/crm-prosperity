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

const STYLE_ID = "capture-info-panel-v2-style";
const SUMMARY_HOST = "capture-info-panel-v2-summary";
const OVERLAY_HOST = "capture-info-panel-v2-overlay";

const CSS = `
[data-conversas-capture-summary-host] > .captureInfoSummaryRow,
[data-conversas-capture-summary-host] > .captureInfoMoreButton,
[data-conversas-capture-overlay-host] { display: none !important; }
[data-${SUMMARY_HOST}] { display: contents; }
[data-${OVERLAY_HOST}] {
  position: absolute;
  inset: 0;
  z-index: 60;
  pointer-events: none;
}
.captureInfoPanelV2Enabled { position: relative !important; }
.captureInfoV2Row,
.captureInfoV2Item {
  border: 1px solid var(--crm-border-soft, #e7edf3);
  border-radius: 16px;
  background: var(--crm-surface, #fff);
  padding: 14px;
}
.captureInfoV2Label {
  display: block;
  color: var(--crm-text-soft, #7b8798);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
}
.captureInfoV2Value {
  display: block;
  margin-top: 6px;
  color: var(--crm-text-strong, #172033);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.captureInfoV2More {
  width: 100%;
  border: 1px solid var(--crm-border, #d8e0eb);
  border-radius: 12px;
  background: var(--crm-surface-soft, #f7f9fb);
  color: var(--crm-primary, #08785a);
  padding: 11px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}
.captureInfoV2More:hover { background: var(--crm-surface-muted, #eef2f6); }
.captureInfoV2Overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--crm-surface, #fff);
  color: var(--crm-text-strong, #172033);
  pointer-events: auto;
}
.captureInfoV2Header {
  min-height: 58px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--crm-border-soft, #e7edf3);
}
.captureInfoV2Back,
.captureInfoV2Refresh {
  border: 1px solid var(--crm-border, #d8e0eb);
  border-radius: 10px;
  background: var(--crm-surface, #fff);
  color: var(--crm-text-strong, #172033);
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.captureInfoV2Back { width: 38px; padding-inline: 0; }
.captureInfoV2Title {
  min-width: 0;
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.captureInfoV2Body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}
.captureInfoV2List {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.captureInfoV2Meta {
  display: block;
  margin-top: 8px;
  color: var(--crm-text-muted, #718096);
  font-size: 11px;
  line-height: 1.4;
}
.captureInfoV2Empty {
  border: 1px dashed var(--crm-border, #d8e0eb);
  border-radius: 14px;
  padding: 18px;
  color: var(--crm-text-muted, #718096);
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

function encontrarObservacoes(lista: HTMLElement) {
  return (
    Array.from(lista.children).find((elemento) => {
      const label = elemento.querySelector<HTMLElement>('[class*="whatsInfoLabel"]');
      return normalizar(label?.textContent) === "observacoes";
    }) as HTMLElement | undefined
  ) || null;
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

export default function CaptureInfoPanel() {
  const searchParams = useSearchParams();
  const conversaId = searchParams.get("id")?.trim() || "";
  const [informacoes, setInformacoes] = useState<InformacaoCaptura[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [summaryHost, setSummaryHost] = useState<HTMLElement | null>(null);
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  const [abaAberta, setAbaAberta] = useState(false);
  const requestIdRef = useRef(0);

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

  async function carregar(forcar = false) {
    if (!conversaId || (carregando && !forcar)) return;
    const requestId = ++requestIdRef.current;
    setCarregando(true);
    setErro("");

    try {
      const response = await fetch(
        `/api/conversas/${encodeURIComponent(conversaId)}/informacoes-captura`,
        { cache: "no-store" }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || "Erro ao carregar informações de captura.");
      }

      if (requestId !== requestIdRef.current) return;
      setInformacoes(Array.isArray(data.informacoes) ? data.informacoes : []);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setInformacoes([]);
      setErro(error instanceof Error ? error.message : "Erro ao carregar informações de captura.");
    } finally {
      if (requestId === requestIdRef.current) setCarregando(false);
    }
  }

  useEffect(() => {
    requestIdRef.current += 1;
    setInformacoes([]);
    setErro("");
    setAbaAberta(false);
    if (conversaId) void carregar(true);
  }, [conversaId]);

  useEffect(() => {
    let frame: number | null = null;

    const sincronizarHosts = () => {
      const lista = encontrarListaInformacoesContato();
      const observacoes = lista ? encontrarObservacoes(lista) : null;

      if (lista && observacoes) {
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
        setAbaAberta(false);
      }

      const painel = document.querySelector<HTMLElement>('aside[class*="rightPanel"]');
      if (painel) {
        painel.classList.add("captureInfoPanelV2Enabled");
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

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      document.querySelectorAll(`[data-${SUMMARY_HOST}], [data-${OVERLAY_HOST}]`).forEach((item) => item.remove());
      document.querySelectorAll(".captureInfoPanelV2Enabled").forEach((item) => item.classList.remove("captureInfoPanelV2Enabled"));
      if (criouStyle) style?.remove();
    };
  }, []);

  const resumoPortal =
    summaryHost && summaryHost.isConnected && !carregando && resumo.length > 0
      ? createPortal(
          <>
            {resumo.map((informacao) => (
              <div className="captureInfoV2Row" key={informacao.id}>
                <span className="captureInfoV2Label">{labelBase(informacao)}</span>
                <strong className="captureInfoV2Value">{informacao.valor}</strong>
              </div>
            ))}
            {possuiDuplicadas && (
              <button
                type="button"
                className="captureInfoV2More"
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
          <section className="captureInfoV2Overlay" aria-label="Informações de captura">
            <header className="captureInfoV2Header">
              <button
                type="button"
                className="captureInfoV2Back"
                onClick={() => setAbaAberta(false)}
                aria-label="Voltar para detalhes do contato"
              >
                ←
              </button>
              <h3 className="captureInfoV2Title">Informações de captura</h3>
              <button
                type="button"
                className="captureInfoV2Refresh"
                onClick={() => void carregar(true)}
                disabled={carregando}
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
            </header>

            <div className="captureInfoV2Body">
              {carregando && informacoes.length === 0 ? (
                <div className="captureInfoV2Empty">Carregando informações...</div>
              ) : erro ? (
                <div className="captureInfoV2Empty">{erro}</div>
              ) : (
                <div className="captureInfoV2List">
                  {itensDetalhados.map(({ informacao, label }) => (
                    <article className="captureInfoV2Item" key={informacao.id}>
                      <span className="captureInfoV2Label">{label}</span>
                      <strong className="captureInfoV2Value">{informacao.valor}</strong>
                      <small className="captureInfoV2Meta">
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
