"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function normalizarTexto(valor: string | null | undefined) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function ehConteudoIndisponivel(elemento: Element | null) {
  if (!(elemento instanceof HTMLElement)) return false;

  const texto = normalizarTexto(elemento.textContent);

  return (
    texto.includes("conteudo nao disponivel") ||
    texto.includes("mensagem nao suportada pela api do whatsapp") ||
    texto.includes("evento ou conteudo nao reconhecido") ||
    texto.includes("este tipo de conteudo ainda nao e suportado pela api oficial")
  );
}

function ehContainerDaTimeline(elemento: HTMLElement) {
  const classes = String(elemento.className || "");

  return (
    classes.includes("messagesStack") ||
    classes.includes("timelineArea") ||
    classes.includes("timelineWrapper")
  );
}

function encontrarLinhaDoCard(elemento: HTMLElement) {
  const linhaPorClasse = elemento.closest<HTMLElement>(
    '[id^="mensagem-"], [class*="messageRow"], [class*="systemMessageRow"]'
  );

  if (linhaPorClasse) return linhaPorClasse;

  let atual: HTMLElement | null = elemento;
  let linhaFlexivel: HTMLElement | null = null;

  while (atual) {
    const pai: HTMLElement | null = atual.parentElement;

    if (!pai || ehContainerDaTimeline(pai)) break;

    const estilo = window.getComputedStyle(atual);
    const retanguloAtual = atual.getBoundingClientRect();
    const retanguloElemento = elemento.getBoundingClientRect();

    if (
      estilo.display.includes("flex") &&
      estilo.flexDirection !== "column" &&
      retanguloAtual.width >= retanguloElemento.width + 40
    ) {
      linhaFlexivel = atual;
    }

    atual = pai;
  }

  return linhaFlexivel;
}

function encontrarCardDireto(linha: HTMLElement, elemento: HTMLElement) {
  let card = elemento;

  while (card.parentElement && card.parentElement !== linha) {
    card = card.parentElement;
  }

  return card.parentElement === linha
    ? card
    : (linha.firstElementChild as HTMLElement | null);
}

function removerAjuste(linha: HTMLElement) {
  linha.style.removeProperty("justify-content");
  linha.style.removeProperty("width");
  linha.style.removeProperty("align-self");

  const card = linha.querySelector<HTMLElement>(
    '[data-card-conteudo-indisponivel-direita="true"]'
  );

  if (card) {
    card.style.removeProperty("margin-left");
    card.style.removeProperty("margin-right");
    card.style.removeProperty("align-self");
    delete card.dataset.cardConteudoIndisponivelDireita;
  }

  delete linha.dataset.conteudoIndisponivelDireita;
}

function alinharCardADireita(linha: HTMLElement, card: HTMLElement | null) {
  linha.style.setProperty("display", "flex", "important");
  linha.style.setProperty("justify-content", "flex-end", "important");
  linha.style.setProperty("width", "100%", "important");
  linha.style.setProperty("align-self", "stretch", "important");

  if (card) {
    card.style.setProperty("margin-left", "auto", "important");
    card.style.setProperty("margin-right", "0", "important");
    card.style.setProperty("align-self", "flex-end", "important");
    card.dataset.cardConteudoIndisponivelDireita = "true";
  }

  linha.dataset.conteudoIndisponivelDireita = "true";
}

function ajustarAlinhamentoCards() {
  const linhasAjustadas = document.querySelectorAll<HTMLElement>(
    '[data-conteudo-indisponivel-direita="true"]'
  );

  linhasAjustadas.forEach((linha) => {
    if (!ehConteudoIndisponivel(linha)) {
      removerAjuste(linha);
    }
  });

  const raiz =
    document.querySelector<HTMLElement>('[class*="timelineArea"]') || document.body;

  const elementos = raiz.querySelectorAll<HTMLElement>("div, article, section, p, span");
  const linhasProcessadas = new Set<HTMLElement>();

  elementos.forEach((elemento) => {
    if (!ehConteudoIndisponivel(elemento)) return;

    const filhoTambemIdentificado = Array.from(elemento.children).some((filho) =>
      ehConteudoIndisponivel(filho)
    );

    if (filhoTambemIdentificado) return;

    const linha = encontrarLinhaDoCard(elemento);

    if (!linha || linhasProcessadas.has(linha)) return;

    const card = encontrarCardDireto(linha, elemento);
    alinharCardADireita(linha, card);
    linhasProcessadas.add(linha);
  });
}

type InformacaoCaptura = {
  id: string;
  tipo?: string | null;
  nome_campo?: string | null;
  sequencia?: number | null;
  valor: string;
  capturado_em?: string | null;
  atualizado_em?: string | null;
  automacao_fluxos?:
    | { nome?: string | null }
    | { nome?: string | null }[]
    | null;
};

type ConversaResumoApi = {
  id?: string;
  contatos?: {
    id?: string;
  } | null;
};

const CAPTURE_STYLE_ID = "conversas-capture-info-enhancer-style";
const CAPTURE_SUMMARY_HOST = "conversas-capture-summary-host";
const CAPTURE_OVERLAY_HOST = "conversas-capture-overlay-host";

const CAPTURE_CSS = `
[data-${CAPTURE_SUMMARY_HOST}] { display: contents; }
[data-${CAPTURE_OVERLAY_HOST}] {
  position: absolute;
  inset: 0;
  z-index: 40;
  pointer-events: none;
}
[data-${CAPTURE_OVERLAY_HOST}] .captureInfoOverlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--crm-surface, var(--crm-surface));
  color: var(--crm-text-strong, var(--crm-ui-private-content-hex-172033));
  pointer-events: auto;
}
.captureInfoSummaryRow,
.captureInfoFullItem {
  border: 1px solid var(--crm-border-soft, var(--crm-ui-private-border-hex-e7edf3));
  border-radius: 16px;
  background: var(--crm-surface, var(--crm-surface));
  padding: 14px;
}
.captureInfoSummaryLabel,
.captureInfoFullLabel {
  display: block;
  color: var(--crm-text-soft, var(--crm-ui-private-content-hex-7b8798));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .05em;
  text-transform: uppercase;
}
.captureInfoSummaryValue,
.captureInfoFullValue {
  display: block;
  margin-top: 6px;
  color: var(--crm-text-strong, var(--crm-ui-private-content-hex-172033));
  font-size: 15px;
  font-weight: 700;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.captureInfoMoreButton {
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
.captureInfoMoreButton:hover { background: var(--crm-surface-muted, var(--crm-ui-private-surface-hex-eef2f6)); }
.captureInfoOverlayHeader {
  min-height: 58px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--crm-border-soft, var(--crm-ui-private-border-hex-e7edf3));
  background: var(--crm-surface, var(--crm-surface));
}
.captureInfoOverlayBack,
.captureInfoOverlayRefresh {
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
.captureInfoOverlayBack { width: 38px; padding-inline: 0; }
.captureInfoOverlayTitle {
  min-width: 0;
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.captureInfoOverlayBody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}
.captureInfoFullList {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.captureInfoFullMeta {
  display: block;
  margin-top: 8px;
  color: var(--crm-text-muted, var(--crm-ui-private-content-hex-718096));
  font-size: 11px;
  line-height: 1.4;
}
.captureInfoEmpty {
  border: 1px dashed var(--crm-border, var(--crm-ui-private-border-hex-d8e0eb));
  border-radius: 14px;
  padding: 18px;
  color: var(--crm-text-muted, var(--crm-ui-private-content-hex-718096));
  font-size: 13px;
  text-align: center;
}
.captureInfoPanelEnabled { position: relative !important; }
`;

function obterConversaIdAtual() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("id")?.trim() || "";
}

function encontrarListaInformacoesContato() {
  const secoes = Array.from(
    document.querySelectorAll<HTMLElement>('[class*="whatsContactSection"]')
  );

  const secao = secoes.find((item) => {
    const cabecalho = item.querySelector<HTMLElement>('[class*="whatsSectionHeader"]');
    return normalizarTexto(cabecalho?.textContent).includes("informacoes do contato");
  });

  return secao?.querySelector<HTMLElement>('[class*="whatsInfoList"]') || null;
}

function encontrarLinhaPorLabel(lista: HTMLElement, label: string) {
  const alvo = normalizarTexto(label).trim();

  return (
    Array.from(lista.children).find((elemento) => {
      const linha = elemento as HTMLElement;
      const textoLabel = linha.querySelector<HTMLElement>('[class*="whatsInfoLabel"]')?.textContent;
      return normalizarTexto(textoLabel).trim() === alvo;
    }) as HTMLElement | undefined
  ) || null;
}

function obterTelefoneDoPainel(lista: HTMLElement) {
  const linhaTelefone = encontrarLinhaPorLabel(lista, "telefone");
  const valor =
    linhaTelefone?.querySelector<HTMLElement>('[class*="whatsInfoValue"]')?.textContent ||
    document.querySelector<HTMLElement>('[class*="whatsContactPhone"]')?.textContent ||
    "";

  return valor.trim();
}

function obterBaseCampo(nomeCampo?: string | null, tipo?: string | null) {
  const nome = String(nomeCampo || tipo || "Informação").trim();
  return nome.replace(/\s+\d+\s*$/, "").trim() || "Informação";
}

function formatarNomeCampoCaptura(informacao: InformacaoCaptura, incluirSequencia: boolean) {
  const original = String(informacao.nome_campo || informacao.tipo || "Informação").trim();
  const numeroNoNome = original.match(/\s+(\d+)\s*$/)?.[1] || "";
  let base = obterBaseCampo(original, informacao.tipo);

  if (!normalizarTexto(base).includes("captura")) {
    base = `${base} captura`;
  }

  if (!incluirSequencia) return base;

  return numeroNoNome ? `${base} ${numeroNoNome}` : base;
}

function chaveAgrupamentoCaptura(informacao: InformacaoCaptura) {
  return normalizarTexto(obterBaseCampo(informacao.nome_campo, informacao.tipo))
    .replace(/\s+/g, " ")
    .trim();
}

function obterNomeFluxo(informacao: InformacaoCaptura) {
  const relacao = informacao.automacao_fluxos;
  const fluxo = Array.isArray(relacao) ? relacao[0] : relacao;
  return fluxo?.nome || "Fluxo não identificado";
}

function formatarDataCaptura(valor?: string | null) {
  if (!valor) return "Data não informada";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Data não informada";
  return data.toLocaleString("pt-BR");
}

function CaptureInfoEnhancer() {
  const [previewHost, setPreviewHost] = useState<HTMLElement | null>(null);
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  const [informacoes, setInformacoes] = useState<InformacaoCaptura[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [abaAberta, setAbaAberta] = useState(false);

  const conversaIdRef = useRef("");
  const contatoIdRef = useRef("");
  const carregadaParaConversaRef = useRef("");
  const carregandoParaConversaRef = useRef("");
  const requestIdRef = useRef(0);
  const previewHostRef = useRef<HTMLElement | null>(null);

  const resumo = useMemo(() => {
    const vistos = new Set<string>();
    const itens: InformacaoCaptura[] = [];

    informacoes.forEach((informacao) => {
      const chave = chaveAgrupamentoCaptura(informacao);
      if (vistos.has(chave)) return;
      vistos.add(chave);
      itens.push(informacao);
    });

    return itens;
  }, [informacoes]);

  const possuiCapturasOcultas = informacoes.length > resumo.length;

  async function resolverContatoId(conversaId: string, telefone: string) {
    const termos = Array.from(
      new Set([
        telefone.replace(/\D/g, ""),
        telefone.trim(),
      ].filter((item) => item.length >= 4))
    );

    for (const termo of termos) {
      const params = new URLSearchParams({
        busca: termo,
        limit: "50",
      });
      const response = await fetch(`/api/conversas?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.ok || !Array.isArray(data.conversas)) continue;

      const conversa = (data.conversas as ConversaResumoApi[]).find(
        (item) => item.id === conversaId
      );
      const contatoId = conversa?.contatos?.id?.trim() || "";

      if (contatoId) return contatoId;
    }

    return "";
  }

  async function carregarInformacoes(forcar = false) {
    const conversaId = conversaIdRef.current;
    const hostAtual = previewHostRef.current;

    if (!conversaId || !hostAtual?.isConnected) return;
    if (
      !forcar &&
      (carregadaParaConversaRef.current === conversaId ||
        carregandoParaConversaRef.current === conversaId)
    ) return;

    carregandoParaConversaRef.current = conversaId;
    const requestId = ++requestIdRef.current;
    setCarregando(true);
    setErro("");

    try {
      let contatoId = contatoIdRef.current;

      if (!contatoId) {
        const lista = encontrarListaInformacoesContato();
        const telefone = lista ? obterTelefoneDoPainel(lista) : "";
        contatoId = await resolverContatoId(conversaId, telefone);
      }

      if (!contatoId) {
        throw new Error("Não foi possível identificar o contato desta conversa.");
      }

      if (requestId !== requestIdRef.current || conversaIdRef.current !== conversaId) {
        return;
      }

      contatoIdRef.current = contatoId;

      const response = await fetch(
        `/api/contatos/${encodeURIComponent(contatoId)}/informacoes-captura`,
        {
          cache: "no-store",
          headers: { "X-Origem-Modulo": "conversas" },
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar informações de captura.");
      }

      if (requestId !== requestIdRef.current || conversaIdRef.current !== conversaId) {
        return;
      }

      setInformacoes(Array.isArray(data.informacoes) ? data.informacoes : []);
      carregadaParaConversaRef.current = conversaId;
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setInformacoes([]);
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao carregar informações de captura."
      );
      carregadaParaConversaRef.current = conversaId;
    } finally {
      if (requestId === requestIdRef.current) {
        carregandoParaConversaRef.current = "";
        setCarregando(false);
      }
    }
  }

  useEffect(() => {
    let frameId: number | null = null;
    let intervaloId: number | null = null;

    const sincronizar = () => {
      const conversaId = obterConversaIdAtual();

      if (conversaId !== conversaIdRef.current) {
        conversaIdRef.current = conversaId;
        contatoIdRef.current = "";
        carregadaParaConversaRef.current = "";
        carregandoParaConversaRef.current = "";
        requestIdRef.current += 1;
        setInformacoes([]);
        setErro("");
        setAbaAberta(false);
      }

      const lista = encontrarListaInformacoesContato();
      const linhaObservacoes = lista
        ? encontrarLinhaPorLabel(lista, "observacoes")
        : null;

      if (lista && linhaObservacoes) {
        let host = lista.querySelector<HTMLElement>(`[data-${CAPTURE_SUMMARY_HOST}]`);

        if (!host) {
          host = document.createElement("div");
          host.setAttribute(`data-${CAPTURE_SUMMARY_HOST}`, "true");
          linhaObservacoes.insertAdjacentElement("afterend", host);
        } else if (linhaObservacoes.nextElementSibling !== host) {
          linhaObservacoes.insertAdjacentElement("afterend", host);
        }

        previewHostRef.current = host;
        setPreviewHost((atual) => (atual === host ? atual : host));

        if (conversaId && carregadaParaConversaRef.current !== conversaId) {
          void carregarInformacoes();
        }
      } else {
        previewHostRef.current = null;
        setPreviewHost(null);
        setAbaAberta(false);
      }

      const painel = document.querySelector<HTMLElement>('aside[class*="rightPanel"]');

      if (painel) {
        painel.classList.add("captureInfoPanelEnabled");
        let host = painel.querySelector<HTMLElement>(`[data-${CAPTURE_OVERLAY_HOST}]`);

        if (!host) {
          host = document.createElement("div");
          host.setAttribute(`data-${CAPTURE_OVERLAY_HOST}`, "true");
          painel.appendChild(host);
        }

        setOverlayHost((atual) => (atual === host ? atual : host));
      } else {
        setOverlayHost(null);
        setAbaAberta(false);
      }
    };

    const agendar = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        sincronizar();
      });
    };

    let style = document.getElementById(CAPTURE_STYLE_ID) as HTMLStyleElement | null;
    const criouStyle = !style;

    if (!style) {
      style = document.createElement("style");
      style.id = CAPTURE_STYLE_ID;
      style.textContent = CAPTURE_CSS;
      document.head.appendChild(style);
    }

    agendar();

    const observer = new MutationObserver(agendar);
    observer.observe(document.body, { childList: true, subtree: true });
    intervaloId = window.setInterval(agendar, 750);
    window.addEventListener("popstate", agendar);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", agendar);
      if (intervaloId !== null) window.clearInterval(intervaloId);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (criouStyle) style?.remove();

      document
        .querySelectorAll<HTMLElement>(
          `[data-${CAPTURE_SUMMARY_HOST}], [data-${CAPTURE_OVERLAY_HOST}]`
        )
        .forEach((host) => host.remove());
      document
        .querySelectorAll<HTMLElement>(".captureInfoPanelEnabled")
        .forEach((painel) => painel.classList.remove("captureInfoPanelEnabled"));
    };
  }, []);

  const abrirAba = () => {
    setAbaAberta(true);
    void carregarInformacoes(true);
  };

  const preview =
    previewHost && previewHost.isConnected
      ? createPortal(
          !carregando && resumo.length > 0 ? (
            <>
              {resumo.map((informacao) => (
                <div className="captureInfoSummaryRow" key={informacao.id}>
                  <span className="captureInfoSummaryLabel">
                    {formatarNomeCampoCaptura(informacao, false)}
                  </span>
                  <strong className="captureInfoSummaryValue">{informacao.valor}</strong>
                </div>
              ))}

              {possuiCapturasOcultas && (
                <button
                  type="button"
                  className="captureInfoMoreButton"
                  onClick={abrirAba}
                >
                  Ver mais
                </button>
              )}
            </>
          ) : null,
          previewHost
        )
      : null;

  const overlay =
    overlayHost && overlayHost.isConnected && abaAberta
      ? createPortal(
          <section className="captureInfoOverlay" aria-label="Informações de captura">
            <header className="captureInfoOverlayHeader">
              <button
                type="button"
                className="captureInfoOverlayBack"
                onClick={() => setAbaAberta(false)}
                aria-label="Voltar para detalhes do contato"
                title="Voltar"
              >
                ←
              </button>
              <h3 className="captureInfoOverlayTitle">Informações de captura</h3>
              <button
                type="button"
                className="captureInfoOverlayRefresh"
                onClick={() => void carregarInformacoes(true)}
                disabled={carregando}
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
            </header>

            <div className="captureInfoOverlayBody">
              {carregando && informacoes.length === 0 ? (
                <div className="captureInfoEmpty">Carregando informações...</div>
              ) : erro ? (
                <div className="captureInfoEmpty">{erro}</div>
              ) : informacoes.length === 0 ? (
                <div className="captureInfoEmpty">
                  Nenhuma informação foi capturada por um fluxo ainda.
                </div>
              ) : (
                <div className="captureInfoFullList">
                  {informacoes.map((informacao) => (
                    <article className="captureInfoFullItem" key={informacao.id}>
                      <span className="captureInfoFullLabel">
                        {formatarNomeCampoCaptura(informacao, true)}
                      </span>
                      <strong className="captureInfoFullValue">{informacao.valor}</strong>
                      <small className="captureInfoFullMeta">
                        {obterNomeFluxo(informacao)} · {formatarDataCaptura(informacao.capturado_em)}
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
      {preview}
      {overlay}
    </>
  );
}

export default function ConteudoIndisponivelAlignment() {
  useEffect(() => {
    let frameId: number | null = null;

    const agendarAjuste = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        ajustarAlinhamentoCards();
      });
    };

    agendarAjuste();

    const observer = new MutationObserver(agendarAjuste);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("resize", agendarAjuste);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", agendarAjuste);

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return <CaptureInfoEnhancer />;
}
