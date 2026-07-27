"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  email?: string | null;
  conversa_id?: string | null;
};

type IdentidadePainel = {
  telefone: string;
  email: string;
};

type ContextoPainel = IdentidadePainel & {
  lista: HTMLElement;
  observacoes: HTMLElement;
};

type ItemDetalhado = {
  informacao: InformacaoCaptura;
  label: string;
};

const STYLE_ID = "capture-info-visible-panel-v4-style";
const SUMMARY_HOST = "capture-info-visible-panel-v4-summary";

const CSS = `
[data-conversas-capture-summary-host],
[data-conversas-capture-overlay-host],
[data-capture-info-panel-v2-summary],
[data-capture-info-panel-v2-overlay],
[data-capture-info-panel-v3-summary],
[data-capture-info-panel-v3-overlay],
[data-capture-info-visible-panel-summary] {
  display: none !important;
}

[data-${SUMMARY_HOST}] {
  display: contents !important;
}

.captureInfoVisibleV4Row,
.captureInfoVisibleV4Item {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--crm-border-soft, #dce5ea);
  border-radius: 16px;
  background: var(--crm-surface, #fff);
  padding: 14px;
}

.captureInfoVisibleV4Label {
  display: block;
  color: var(--crm-text-soft, #8aa0a8);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .05em;
  text-transform: uppercase;
}

.captureInfoVisibleV4Value {
  display: block;
  margin-top: 6px;
  color: var(--crm-text-strong, #102638);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.captureInfoVisibleV4More {
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

.captureInfoVisibleV4Overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  background: var(--crm-surface, #fff);
  color: var(--crm-text-strong, #102638);
}

.captureInfoVisibleV4Header {
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: max(12px, env(safe-area-inset-top)) 14px 12px;
  border-bottom: 1px solid var(--crm-border-soft, #e7edf3);
  background: var(--crm-surface, #fff);
}

.captureInfoVisibleV4Back,
.captureInfoVisibleV4Refresh {
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

.captureInfoVisibleV4Back {
  width: 40px;
  padding-inline: 0;
}

.captureInfoVisibleV4Title {
  min-width: 0;
  flex: 1;
  margin: 0;
  font-size: 17px;
  font-weight: 900;
}

.captureInfoVisibleV4Body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 14px max(20px, env(safe-area-inset-bottom));
}

.captureInfoVisibleV4List {
  width: min(100%, 720px);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.captureInfoVisibleV4Meta {
  display: block;
  margin-top: 8px;
  color: var(--crm-text-muted, #718096);
  font-size: 11px;
  line-height: 1.4;
}

.captureInfoVisibleV4Empty {
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

function normalizarTexto(valor: string | null | undefined) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarTelefone(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarEmail(valor: string | null | undefined) {
  return String(valor || "").trim().toLowerCase();
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

function encontrarLabelsExatos(texto: string) {
  const alvo = normalizarTexto(texto);
  const elementos = Array.from(
    document.querySelectorAll<HTMLElement>("span, label, p, strong, div")
  );

  return elementos.filter(
    (elemento) =>
      elemento.childElementCount === 0 &&
      normalizarTexto(elemento.textContent) === alvo
  );
}

function encontrarLinhaDoLabel(label: HTMLElement) {
  const porClasse = label.closest<HTMLElement>('[class*="whatsInfoRow"]');
  if (porClasse) return porClasse;

  let atual: HTMLElement | null = label.parentElement;
  let profundidade = 0;

  while (atual && profundidade < 5) {
    const pai = atual.parentElement;
    if (!pai) break;

    if (pai.children.length >= 3) return atual;

    atual = pai;
    profundidade += 1;
  }

  return label.parentElement;
}

function obterValorDaLinha(linha: HTMLElement | null, labelTexto: string) {
  if (!linha) return "";

  const input = linha.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    "input, textarea"
  );
  if (input?.value) return input.value.trim();

  const valorDireto = linha.querySelector<HTMLElement>(
    '[class*="whatsInfoValue"], [class*="infoValueRow"] a, [class*="infoValueRow"] span, a'
  );
  const textoDireto = valorDireto?.textContent?.trim() || "";
  if (textoDireto && normalizarTexto(textoDireto) !== normalizarTexto(labelTexto)) {
    return textoDireto;
  }

  const candidatos = Array.from(
    linha.querySelectorAll<HTMLElement>("strong, a, span, p, div")
  )
    .map((elemento) => elemento.textContent?.trim() || "")
    .filter(
      (texto) =>
        texto.length > 0 &&
        normalizarTexto(texto) !== normalizarTexto(labelTexto) &&
        !normalizarTexto(texto).includes("editar")
    )
    .sort((a, b) => b.length - a.length);

  return candidatos[0] || "";
}

function encontrarLinhaNaLista(lista: HTMLElement, labelProcurado: string) {
  const alvo = normalizarTexto(labelProcurado);

  for (const filho of Array.from(lista.children)) {
    const elemento = filho as HTMLElement;
    const labels = Array.from(
      elemento.querySelectorAll<HTMLElement>("span, label, p, strong, div")
    );

    if (
      labels.some(
        (label) =>
          label.childElementCount === 0 &&
          normalizarTexto(label.textContent) === alvo
      )
    ) {
      return elemento;
    }
  }

  return null;
}

function encontrarContextoPainel(): ContextoPainel | null {
  const labelsObservacoes = encontrarLabelsExatos("observações")
    .filter(elementoVisivel)
    .sort((a, b) => {
      const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
      const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
      return areaB - areaA;
    });

  for (const label of labelsObservacoes) {
    const observacoes = encontrarLinhaDoLabel(label);
    const lista = observacoes?.parentElement;
    if (!observacoes || !lista) continue;

    const linhaEmail = encontrarLinhaNaLista(lista, "e-mail");
    const linhaEmpresa = encontrarLinhaNaLista(lista, "empresa");
    const linhaCampanha = encontrarLinhaNaLista(lista, "campanha");

    if (!linhaEmail && !linhaEmpresa && !linhaCampanha) continue;

    const linhaTelefone = encontrarLinhaNaLista(lista, "telefone");
    const telefone = normalizarTelefone(
      obterValorDaLinha(linhaTelefone, "telefone") ||
        document.querySelector<HTMLElement>('[class*="whatsContactPhone"]')
          ?.textContent
    );
    const email = normalizarEmail(obterValorDaLinha(linhaEmail, "e-mail"));

    return {
      lista,
      observacoes,
      telefone,
      email,
    };
  }

  return null;
}

function obterConversaIdDaUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("id")?.trim() || "";
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
  return normalizarTexto(textoBase(informacao)).replace(/[^a-z0-9]+/g, " ").trim();
}

function labelBase(informacao: InformacaoCaptura) {
  const base = textoBase(informacao);
  const normalizado = normalizarTexto(base);
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
  const [conversaId, setConversaId] = useState("");
  const [identidadePainel, setIdentidadePainel] = useState<IdentidadePainel>({
    telefone: "",
    email: "",
  });
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

  async function carregarPorBusca(identidade: IdentidadePainel) {
    const termos = [identidade.telefone, identidade.email].filter(Boolean);

    for (const termo of termos) {
      const params = new URLSearchParams({ busca: termo, limite: "50" });
      const response = await fetch(`/api/contatos?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await lerJson(response);

      if (!response.ok || data?.ok === false) continue;

      const contatos = Array.isArray(data.contatos)
        ? (data.contatos as ContatoBusca[])
        : [];
      const contato =
        contatos.find(
          (item) =>
            Boolean(conversaId) &&
            String(item.conversa_id || "").trim() === conversaId
        ) ||
        contatos.find(
          (item) =>
            Boolean(identidade.telefone) &&
            normalizarTelefone(item.telefone) === identidade.telefone
        ) ||
        contatos.find(
          (item) =>
            Boolean(identidade.email) &&
            normalizarEmail(item.email) === identidade.email
        ) ||
        contatos[0];

      const contatoId = String(contato?.id || "").trim();
      if (contatoId) return carregarPorContatoId(contatoId);
    }

    return [];
  }

  async function carregar(forcar = false) {
    const chave = `${conversaId}|${identidadePainel.telefone}|${identidadePainel.email}`;
    if (!conversaId && !identidadePainel.telefone && !identidadePainel.email) return;
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

      if (dados.length === 0 && (identidadePainel.telefone || identidadePainel.email)) {
        const dadosPorBusca = await carregarPorBusca(identidadePainel);
        if (dadosPorBusca.length > 0) {
          dados = dadosPorBusca;
          falhaConversa = null;
        }
      }

      if (
        dados.length === 0 &&
        falhaConversa &&
        !identidadePainel.telefone &&
        !identidadePainel.email
      ) {
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
      console.error("[capturas-contato]", error);
    } finally {
      if (requestId === requestIdRef.current) {
        carregandoRef.current = false;
        setCarregando(false);
      }
    }
  }

  useEffect(() => {
    const atualizarConversaId = () => {
      const proximoId = obterConversaIdDaUrl();
      setConversaId((atual) => (atual === proximoId ? atual : proximoId));
    };

    atualizarConversaId();
    const intervalo = window.setInterval(atualizarConversaId, 350);
    window.addEventListener("popstate", atualizarConversaId);

    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener("popstate", atualizarConversaId);
    };
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    chaveCarregadaRef.current = "";
    carregandoRef.current = false;
    setInformacoes([]);
    setErro("");
    setAbaAberta(false);
  }, [conversaId]);

  useEffect(() => {
    if (conversaId || identidadePainel.telefone || identidadePainel.email) {
      void carregar();
    }
  }, [conversaId, identidadePainel.telefone, identidadePainel.email]);

  useEffect(() => {
    let frame: number | null = null;
    let hostAtual: HTMLElement | null = null;

    const sincronizar = () => {
      const contexto = encontrarContextoPainel();

      if (!contexto) {
        if (hostAtual?.isConnected) hostAtual.remove();
        hostAtual = null;
        setSummaryHost(null);
        setIdentidadePainel((atual) =>
          atual.telefone || atual.email ? { telefone: "", email: "" } : atual
        );
        setAbaAberta(false);
        return;
      }

      setIdentidadePainel((atual) =>
        atual.telefone === contexto.telefone && atual.email === contexto.email
          ? atual
          : { telefone: contexto.telefone, email: contexto.email }
      );

      let host = contexto.lista.querySelector<HTMLElement>(`[data-${SUMMARY_HOST}]`);
      if (!host) {
        host = document.createElement("div");
        host.setAttribute(`data-${SUMMARY_HOST}`, "true");
      }

      if (contexto.observacoes.nextElementSibling !== host) {
        contexto.observacoes.insertAdjacentElement("afterend", host);
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
    observer.observe(document.body, { childList: true, subtree: true });
    const intervalo = window.setInterval(agendar, 400);
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
              <div className="captureInfoVisibleV4Row" key={informacao.id}>
                <span className="captureInfoVisibleV4Label">
                  {labelBase(informacao)}
                </span>
                <strong className="captureInfoVisibleV4Value">
                  {informacao.valor}
                </strong>
              </div>
            ))}
            {possuiDuplicadas && (
              <button
                type="button"
                className="captureInfoVisibleV4More"
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
          <section
            className="captureInfoVisibleV4Overlay"
            aria-label="Informações de captura"
          >
            <header className="captureInfoVisibleV4Header">
              <button
                type="button"
                className="captureInfoVisibleV4Back"
                onClick={() => setAbaAberta(false)}
                aria-label="Voltar para detalhes do contato"
              >
                ←
              </button>
              <h3 className="captureInfoVisibleV4Title">
                Informações de captura
              </h3>
              <button
                type="button"
                className="captureInfoVisibleV4Refresh"
                onClick={() => void carregar(true)}
                disabled={carregando}
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
            </header>

            <div className="captureInfoVisibleV4Body">
              {carregando && informacoes.length === 0 ? (
                <div className="captureInfoVisibleV4Empty">
                  Carregando informações...
                </div>
              ) : erro ? (
                <div className="captureInfoVisibleV4Empty">{erro}</div>
              ) : informacoes.length === 0 ? (
                <div className="captureInfoVisibleV4Empty">
                  Nenhuma informação foi capturada por um fluxo ainda.
                </div>
              ) : (
                <div className="captureInfoVisibleV4List">
                  {detalhadas.map(({ informacao, label }) => (
                    <article
                      className="captureInfoVisibleV4Item"
                      key={informacao.id}
                    >
                      <span className="captureInfoVisibleV4Label">{label}</span>
                      <strong className="captureInfoVisibleV4Value">
                        {informacao.valor}
                      </strong>
                      <small className="captureInfoVisibleV4Meta">
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
