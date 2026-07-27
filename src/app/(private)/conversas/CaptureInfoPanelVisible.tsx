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

type ContatoBusca = {
  id?: string | null;
  telefone?: string | null;
  conversa_id?: string | null;
};

type ItemDetalhado = {
  informacao: InformacaoCaptura;
  label: string;
};

const STYLE_ID = "capture-info-visible-panel-style";
const SUMMARY_HOST = "capture-info-visible-panel-summary";

const CSS = `
[data-conversas-capture-summary-host],
[data-conversas-capture-overlay-host],
[data-capture-info-panel-v2-summary],
[data-capture-info-panel-v2-overlay],
[data-capture-info-panel-v3-summary],
[data-capture-info-panel-v3-overlay] {
  display: none !important;
}

[data-${SUMMARY_HOST}] {
  display: contents !important;
}

.captureInfoVisibleRow,
.captureInfoVisibleItem {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--crm-border-soft, #dce5ea);
  border-radius: 16px;
  background: var(--crm-surface, #fff);
  padding: 14px;
}

.captureInfoVisibleLabel {
  display: block;
  color: var(--crm-text-soft, #8aa0a8);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.captureInfoVisibleValue {
  display: block;
  margin-top: 6px;
  color: var(--crm-text-strong, #102638);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.captureInfoVisibleMore {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--crm-border, #d8e0eb);
  border-radius: 12px;
  background: var(--crm-surface-soft, #f7faf9);
  color: var(--crm-primary, #08785a);
  padding: 11px 14px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.captureInfoVisibleOverlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  background: var(--crm-surface, #fff);
  color: var(--crm-text-strong, #102638);
}

.captureInfoVisibleHeader {
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: max(12px, env(safe-area-inset-top)) 14px 12px;
  border-bottom: 1px solid var(--crm-border-soft, #e7edf3);
  background: var(--crm-surface, #fff);
}

.captureInfoVisibleBack,
.captureInfoVisibleRefresh {
  border: 1px solid var(--crm-border, #d8e0eb);
  border-radius: 10px;
  background: var(--crm-surface, #fff);
  color: var(--crm-text-strong, #102638);
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.captureInfoVisibleBack {
  width: 40px;
  padding-inline: 0;
}

.captureInfoVisibleTitle {
  min-width: 0;
  flex: 1;
  margin: 0;
  font-size: 17px;
  font-weight: 900;
}

.captureInfoVisibleBody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 14px max(20px, env(safe-area-inset-bottom));
}

.captureInfoVisibleList {
  width: min(100%, 720px);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.captureInfoVisibleMeta {
  display: block;
  margin-top: 8px;
  color: var(--crm-text-muted, #718096);
  font-size: 11px;
  line-height: 1.4;
}

.captureInfoVisibleEmpty {
  width: min(100%, 720px);
  margin: 0 auto;
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

function normalizarTelefone(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "");
}

function elementoVisivel(elemento: HTMLElement) {
  const estilo = window.getComputedStyle(elemento);
  const retangulo = elemento.getBoundingClientRect();

  return (
    estilo.display !== "none" &&
    estilo.visibility !== "hidden" &&
    Number(estilo.opacity || "1") !== 0 &&
    retangulo.width > 0 &&
    retangulo.height > 0 &&
    elemento.getClientRects().length > 0
  );
}

function encontrarListaVisivelInformacoesContato() {
  const listas = Array.from(
    document.querySelectorAll<HTMLElement>('[class*="whatsContactSection"]')
  )
    .filter((secao) => {
      const cabecalho = secao.querySelector<HTMLElement>('[class*="whatsSectionHeader"]');
      return normalizar(cabecalho?.textContent).includes("informacoes do contato");
    })
    .map((secao) => secao.querySelector<HTMLElement>('[class*="whatsInfoList"]'))
    .filter((lista): lista is HTMLElement => Boolean(lista));

  const visiveis = listas.filter(elementoVisivel);
  if (visiveis.length === 0) return null;

  return visiveis.sort((a, b) => {
    const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
    const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
    return areaB - areaA;
  })[0];
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

function obterTelefonePainel(lista: HTMLElement) {
  const linha = encontrarLinhaPorLabel(lista, "telefone");
  const valor = linha?.querySelector<HTMLElement>('[class*="whatsInfoValue"]');
  return normalizarTelefone(valor?.textContent);
}

function textoBase(informacao: InformacaoCaptura) {
  return (
    String(informacao.nome_campo || informacao.tipo || "Informação")
      .replace(/[_-]+/g, " ")
      .replace(/\s+\d+\s*$/, "")
      .replace(/\s+captura\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim() || "Informação"
  );
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

export default function CaptureInfoPanelVisible() {
  const searchParams = useSearchParams();
  const conversaId = searchParams.get("id")?.trim() || "";
  const [telefonePainel, setTelefonePainel] = useState("");
  const [summaryHost, setSummaryHost] = useState<HTMLElement | null>(null);
  const [informacoes, setInformacoes] = useState<InformacaoCaptura[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
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

  const detalhadas = useMemo<ItemDetalhado[]>(() => {
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
      { cache: "no-store" }
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
    const chave = `${conversaId}|${telefonePainel}`;
    if (!conversaId && !telefonePainel) return;
    if (!forcar && (carregandoRef.current || chaveCarregadaRef.current === chave)) {
      return;
    }

    const requestId = ++requestIdRef.current;
    carregandoRef.current = true;
    setCarregando(true);
    setErro("");

    try {
      let dados: InformacaoCaptura[] = [];
      let falhaConversa: Error | null = null;

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
          falhaConversa =
            error instanceof Error
              ? error
              : new Error("Erro ao carregar capturas pela conversa.");
        }
      }

      if (dados.length === 0 && telefonePainel) {
        dados = await carregarPorTelefone(telefonePainel);
        if (dados.length > 0) falhaConversa = null;
      }

      if (dados.length === 0 && falhaConversa && !telefonePainel) {
        throw falhaConversa;
      }

      if (requestId !== requestIdRef.current) return;
      setInformacoes(dados);
      chaveCarregadaRef.current = chave;
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setInformacoes([]);
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao carregar informações de captura."
      );
      chaveCarregadaRef.current = chave;
    } finally {
      if (requestId === requestIdRef.current) {
        carregandoRef.current = false;
        setCarregando(false);
      }
    }
  }

  useEffect(() => {
    requestIdRef.current += 1;
    chaveCarregadaRef.current = "";
    carregandoRef.current = false;
    setInformacoes([]);
    setErro("");
    setAbaAberta(false);
  }, [conversaId]);

  useEffect(() => {
    if (conversaId || telefonePainel) void carregar();
  }, [conversaId, telefonePainel]);

  useEffect(() => {
    let frame: number | null = null;
    let hostAtual: HTMLElement | null = null;

    const sincronizar = () => {
      const lista = encontrarListaVisivelInformacoesContato();
      const observacoes = lista ? encontrarLinhaPorLabel(lista, "observações") : null;

      if (!lista || !observacoes) {
        if (hostAtual?.isConnected) hostAtual.remove();
        hostAtual = null;
        setSummaryHost(null);
        setTelefonePainel("");
        setAbaAberta(false);
        return;
      }

      const telefone = obterTelefonePainel(lista);
      setTelefonePainel((atual) => (atual === telefone ? atual : telefone));

      let host = lista.querySelector<HTMLElement>(`[data-${SUMMARY_HOST}]`);
      if (!host) {
        host = document.createElement("div");
        host.setAttribute(`data-${SUMMARY_HOST}`, "true");
      }

      if (observacoes.nextElementSibling !== host) {
        observacoes.insertAdjacentElement("afterend", host);
      }

      if (hostAtual && hostAtual !== host && hostAtual.isConnected) {
        hostAtual.remove();
      }

      hostAtual = host;
      setSummaryHost((atual) => (atual === host ? atual : host));
    };

    const agendar = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        sincronizar();
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
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });
    const intervalo = window.setInterval(agendar, 500);
    window.addEventListener("resize", agendar);
    window.addEventListener("orientationchange", agendar);

    return () => {
      observer.disconnect();
      window.clearInterval(intervalo);
      window.removeEventListener("resize", agendar);
      window.removeEventListener("orientationchange", agendar);
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (hostAtual?.isConnected) hostAtual.remove();
      document
        .querySelectorAll(`[data-${SUMMARY_HOST}]`)
        .forEach((elemento) => elemento.remove());
      if (criouStyle) style?.remove();
    };
  }, []);

  useEffect(() => {
    if (!abaAberta) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflowAnterior;
    };
  }, [abaAberta]);

  const resumoPortal =
    summaryHost && summaryHost.isConnected && !carregando && resumo.length > 0
      ? createPortal(
          <>
            {resumo.map((informacao) => (
              <div className="captureInfoVisibleRow" key={informacao.id}>
                <span className="captureInfoVisibleLabel">{labelBase(informacao)}</span>
                <strong className="captureInfoVisibleValue">{informacao.valor}</strong>
              </div>
            ))}
            {possuiDuplicadas && (
              <button
                type="button"
                className="captureInfoVisibleMore"
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
    typeof document !== "undefined" && abaAberta
      ? createPortal(
          <section className="captureInfoVisibleOverlay" aria-label="Informações de captura">
            <header className="captureInfoVisibleHeader">
              <button
                type="button"
                className="captureInfoVisibleBack"
                onClick={() => setAbaAberta(false)}
                aria-label="Voltar para detalhes do contato"
              >
                ←
              </button>
              <h3 className="captureInfoVisibleTitle">Informações de captura</h3>
              <button
                type="button"
                className="captureInfoVisibleRefresh"
                onClick={() => void carregar(true)}
                disabled={carregando}
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
            </header>

            <div className="captureInfoVisibleBody">
              {carregando && informacoes.length === 0 ? (
                <div className="captureInfoVisibleEmpty">Carregando informações...</div>
              ) : erro ? (
                <div className="captureInfoVisibleEmpty">{erro}</div>
              ) : informacoes.length === 0 ? (
                <div className="captureInfoVisibleEmpty">
                  Nenhuma informação foi capturada por um fluxo ainda.
                </div>
              ) : (
                <div className="captureInfoVisibleList">
                  {detalhadas.map(({ informacao, label }) => (
                    <article className="captureInfoVisibleItem" key={informacao.id}>
                      <span className="captureInfoVisibleLabel">{label}</span>
                      <strong className="captureInfoVisibleValue">{informacao.valor}</strong>
                      <small className="captureInfoVisibleMeta">
                        {nomeFluxo(informacao)} · {dataCaptura(informacao.capturado_em)}
                      </small>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>,
          document.body
        )
      : null;

  return (
    <>
      {resumoPortal}
      {overlayPortal}
    </>
  );
}
