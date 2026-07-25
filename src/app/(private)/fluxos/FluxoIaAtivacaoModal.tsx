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
  condicao?: CondicaoGatilho | null;
  ativo?: boolean | null;
};

type GatilhoPendente = {
  id: string;
  valor: string;
  condicao: CondicaoGatilho;
};

type RespostaFluxos = { ok?: boolean; error?: string; fluxos?: FluxoResumo[] };
type RespostaGatilhos = { ok?: boolean; error?: string; gatilhos?: GatilhoResumo[] };
type RespostaApi = { ok?: boolean; error?: string };

const JANELA_MODAL_MS = 15 * 60 * 1000;
const PREFIXO_SESSAO = "prosperity:fluxo-ia:ativacao:";
const LIMITE_GATILHOS = 30;

function marcadorSessao(fluxoId: string) {
  return `${PREFIXO_SESSAO}${fluxoId}`;
}

function fluxoCriadoPorIa(fluxo: FluxoResumo) {
  const nome = String(fluxo.nome || "").trim();
  const descricao = String(fluxo.descricao || "").toLowerCase();
  return /^✨\s*IA\s*-/i.test(nome) || descricao.includes("fluxo criado pelo assistente de ia");
}

function fluxoRecente(fluxo: FluxoResumo) {
  const criadoEm = new Date(String(fluxo.created_at || "")).getTime();
  const diferenca = Date.now() - criadoEm;
  return Number.isFinite(criadoEm) && diferenca >= -60_000 && diferenca <= JANELA_MODAL_MS;
}

function chaveGatilho(valor: unknown) {
  return String(valor || "").trim().toLocaleLowerCase("pt-BR");
}

function palavrasDaEntrada(valor: string, condicao: CondicaoGatilho) {
  const texto = valor.trim();
  if (!texto) return [];
  if (condicao === "regex") return [texto];
  return Array.from(
    new Set(texto.split(/[,;\n]+/).map(chaveGatilho).filter(Boolean))
  );
}

function rotuloCondicao(condicao?: CondicaoGatilho | null) {
  if (condicao === "exata") return "Igual exatamente";
  if (condicao === "inicia_com") return "Começa com";
  if (condicao === "regex") return "Regex";
  return "Contém a palavra";
}

function idPendente(valor: string, indice: number) {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${indice}-${valor}`;
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

function textoNormalizado(elemento: Element) {
  return String(elemento.textContent || "").trim().toLocaleLowerCase("pt-BR");
}

function botoesDaPergunta(seletor: HTMLElement) {
  let anterior = seletor.previousElementSibling;
  while (anterior) {
    const botoes = anterior.querySelector<HTMLElement>('[class*="whatsappFlowButtons"]');
    if (botoes) return botoes;
    if (anterior.matches('[class*="whatsappFlowJourneySelector"]')) break;
    anterior = anterior.previousElementSibling;
  }
  return null;
}

function aplicarSelecaoNaPrevia() {
  const seletores = document.querySelectorAll<HTMLElement>(
    '[class*="whatsappFlowJourneySelector"]'
  );

  for (const seletor of seletores) {
    const container = botoesDaPergunta(seletor);
    const opcoes = Array.from(
      seletor.querySelectorAll<HTMLButtonElement>('[class*="whatsappFlowJourneyOptions"] button')
    );

    if (!container || opcoes.length === 0) {
      seletor.style.removeProperty("display");
      seletor.removeAttribute("aria-hidden");
      continue;
    }

    const visiveis = Array.from(container.querySelectorAll<HTMLElement>("span"));
    const usados = new Set<HTMLElement>();
    const pares = opcoes.map((opcao) => {
      let visivel = visiveis.find(
        (item) => !usados.has(item) && textoNormalizado(item) === textoNormalizado(opcao)
      );
      visivel ||= visiveis.find((item) => !usados.has(item));

      if (!visivel) {
        visivel = document.createElement("span");
        visivel.dataset.opcaoPreviewGerada = "true";
        container.appendChild(visivel);
        visiveis.push(visivel);
      }

      usados.add(visivel);
      const texto = String(opcao.textContent || "").trim();
      if (visivel.textContent !== texto) visivel.textContent = texto;
      if (visivel.className !== opcao.className) visivel.className = opcao.className;
      visivel.style.removeProperty("display");
      visivel.style.cursor = "pointer";
      visivel.setAttribute("role", "button");
      visivel.setAttribute("tabindex", "0");
      visivel.setAttribute(
        "aria-pressed",
        String(opcao.className.toLocaleLowerCase("pt-BR").includes("active"))
      );
      return { visivel, opcao };
    });

    const classeAtiva =
      opcoes.find((item) => item.className.toLocaleLowerCase("pt-BR").includes("active"))
        ?.className || opcoes[0].className;
    const classeInativa =
      opcoes.find((item) => !item.className.toLocaleLowerCase("pt-BR").includes("active"))
        ?.className || opcoes[0].className;

    pares.forEach(({ visivel, opcao }, selecionado) => {
      const escolher = () => {
        pares.forEach(({ visivel: item }, indice) => {
          const ativo = indice === selecionado;
          item.className = ativo ? classeAtiva : classeInativa;
          item.setAttribute("aria-pressed", String(ativo));
        });
        opcao.click();
      };
      visivel.onclick = escolher;
      visivel.onkeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        escolher();
      };
    });

    for (const visivel of visiveis) {
      if (usados.has(visivel)) continue;
      if (visivel.dataset.opcaoPreviewGerada === "true") visivel.remove();
      else visivel.style.display = "none";
    }

    seletor.style.display = "none";
    seletor.setAttribute("aria-hidden", "true");
  }
}

export default function FluxoIaAtivacaoModal() {
  const searchParams = useSearchParams();
  const fluxoId = String(searchParams.get("fluxo") || "").trim();

  const [aberto, setAberto] = useState(false);
  const [fluxo, setFluxo] = useState<FluxoResumo | null>(null);
  const [existeOutroPadrao, setExisteOutroPadrao] = useState(false);
  const [usarComoPadrao, setUsarComoPadrao] = useState(false);
  const [palavraChave, setPalavraChave] = useState("");
  const [condicao, setCondicao] = useState<CondicaoGatilho>("contem");
  const [gatilhosAtivos, setGatilhosAtivos] = useState<GatilhoResumo[]>([]);
  const [pendentes, setPendentes] = useState<GatilhoPendente[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let frameId: number | null = null;
    const observer = new MutationObserver(() => {
      if (frameId !== null) return;

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        observer.disconnect();
        aplicarSelecaoNaPrevia();
        observer.observe(document.body, { childList: true, subtree: true });
      });
    });

    aplicarSelecaoNaPrevia();
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function verificar() {
      setAberto(false);
      setFluxo(null);
      setErro("");
      setPalavraChave("");
      setCondicao("contem");
      setGatilhosAtivos([]);
      setPendentes([]);
      setUsarComoPadrao(false);

      if (!fluxoId || window.sessionStorage.getItem(marcadorSessao(fluxoId))) return;

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

        const fluxos = Array.isArray(jsonFluxos.fluxos) ? jsonFluxos.fluxos : [];
        const atual = fluxos.find((item) => item.id === fluxoId);
        if (!atual || atual.status !== "rascunho" || !fluxoCriadoPorIa(atual) || !fluxoRecente(atual)) {
          return;
        }

        const ativos =
          resGatilhos.ok && jsonGatilhos.ok && Array.isArray(jsonGatilhos.gatilhos)
            ? jsonGatilhos.gatilhos.filter((item) => item.ativo === true)
            : [];
        const outroPadrao = fluxos.some(
          (item) => item.id !== atual.id && item.fluxo_padrao === true && item.status !== "arquivado"
        );

        if (cancelado) return;
        setFluxo(atual);
        setExisteOutroPadrao(outroPadrao);
        setUsarComoPadrao(atual.fluxo_padrao === true && !outroPadrao);
        setGatilhosAtivos(ativos);
        setAberto(true);
      } catch {
        // Este modal é apenas uma orientação e não bloqueia o fluxo criado.
      }
    }

    void verificar();
    return () => {
      cancelado = true;
    };
  }, [fluxoId]);

  function configurarDepois() {
    if (!fluxo?.id || salvando) return;
    window.sessionStorage.setItem(marcadorSessao(fluxo.id), "adiado");
    setAberto(false);
  }

  function adicionar() {
    const palavras = palavrasDaEntrada(palavraChave, condicao);
    if (palavras.length === 0) {
      setErro("Informe ao menos uma palavra-chave para adicionar.");
      return;
    }

    const existentes = new Set([
      ...gatilhosAtivos.map((item) => chaveGatilho(item.valor)),
      ...pendentes.map((item) => chaveGatilho(item.valor)),
    ]);
    const novas = palavras.filter((item) => !existentes.has(chaveGatilho(item)));

    if (novas.length === 0) {
      setErro("Essa palavra-chave já foi adicionada ao fluxo.");
      return;
    }
    if (pendentes.length + novas.length > LIMITE_GATILHOS) {
      setErro(`Cadastre no máximo ${LIMITE_GATILHOS} gatilhos por vez.`);
      return;
    }

    setPendentes((atuais) => [
      ...atuais,
      ...novas.map((valor, indice) => ({ id: idPendente(valor, indice), valor, condicao })),
    ]);
    setPalavraChave("");
    setCondicao("contem");
    setErro("");
  }

  function pendentesComEntrada() {
    const existentes = new Set([
      ...gatilhosAtivos.map((item) => chaveGatilho(item.valor)),
      ...pendentes.map((item) => chaveGatilho(item.valor)),
    ]);
    const entrada = palavrasDaEntrada(palavraChave, condicao)
      .filter((valor) => !existentes.has(chaveGatilho(valor)))
      .map((valor, indice) => ({ id: idPendente(valor, indice), valor, condicao }));
    return [...pendentes, ...entrada];
  }

  async function cadastrarGatilho(gatilho: GatilhoPendente) {
    if (!fluxo?.id) return;
    const response = await fetch(`/api/automacoes/${encodeURIComponent(fluxo.id)}/gatilhos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo_gatilho: "palavra_chave",
        valor: gatilho.valor,
        condicao: gatilho.condicao,
      }),
    });
    const json = await lerJson<RespostaApi>(response);
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Erro ao cadastrar o gatilho “${gatilho.valor}”.`);
    }
  }

  async function salvar() {
    if (!fluxo?.id || salvando) return;
    const novos = pendentesComEntrada();

    if (!usarComoPadrao && gatilhosAtivos.length === 0 && novos.length === 0) {
      setErro("Cadastre uma palavra-chave ou torne este fluxo o padrão antes de continuar.");
      return;
    }
    if (novos.length > LIMITE_GATILHOS) {
      setErro(`Cadastre no máximo ${LIMITE_GATILHOS} gatilhos por vez.`);
      return;
    }

    try {
      setSalvando(true);
      setErro("");

      if (usarComoPadrao) {
        const response = await fetch("/api/automacoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: fluxo.id, fluxo_padrao: true }),
        });
        const json = await lerJson<RespostaApi>(response);
        if (!response.ok || !json.ok) {
          throw new Error(json.error || "Erro ao definir o fluxo padrão.");
        }
      } else {
        for (const gatilho of novos) await cadastrarGatilho(gatilho);
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

  const podeEscolherPadrao = !existeOutroPadrao || fluxo.fluxo_padrao === true;
  const semGatilhos = gatilhosAtivos.length === 0 && pendentes.length === 0;

  return (
    <div className={styles.modalOverlay} role="presentation">
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="titulo-fluxo-ia">
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Fluxo criado com IA</p>
            <h3 id="titulo-fluxo-ia" className={styles.modalTitle}>Como este fluxo será iniciado?</h3>
            <p className={styles.modalSubtitle}>{fluxo.nome}</p>
          </div>
          <button type="button" className={styles.closePanelButton} onClick={configurarDepois} disabled={salvando} aria-label="Configurar depois">×</button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.warningBox}>
            <strong>O fluxo foi salvo como rascunho.</strong>
            <p>Para ativar este fluxo, cadastre pelo menos uma palavra-chave ou torne-o o fluxo padrão. Depois, revise a estrutura e use o botão “Ativar fluxo”.</p>
          </div>

          {podeEscolherPadrao && (
            <label className={styles.switchField}>
              <input type="checkbox" checked={usarComoPadrao} onChange={(event) => { setErro(""); setUsarComoPadrao(event.target.checked); }} disabled={salvando} />
              <div>
                <strong>Tornar este fluxo padrão</strong>
                <p>Ele será iniciado automaticamente quando nenhuma palavra-chave de outro fluxo for encontrada.</p>
              </div>
            </label>
          )}

          {existeOutroPadrao && (
            <div className={styles.defaultFlowNotice}>
              <div className={styles.defaultFlowIcon}>↪</div>
              <div className={styles.defaultFlowContent}>
                <div className={styles.defaultFlowTop}><strong>Já existe um fluxo padrão</strong><span className={styles.defaultFlowBadge}>Padrão</span></div>
                <p>Cadastre uma palavra-chave para definir quando este novo fluxo deve começar.</p>
              </div>
            </div>
          )}

          {!usarComoPadrao && (
            <div className={styles.gatilhosBox}>
              <div>
                <p className={styles.modalSectionTitle}>Gatilhos do fluxo</p>
                <p className={styles.help}>Palavras que iniciam este fluxo quando o cliente envia uma mensagem.</p>
              </div>

              <div className={styles.gatilhoCreateRow}>
                <input
                  className={styles.input}
                  value={palavraChave}
                  onChange={(event) => { setErro(""); setPalavraChave(event.target.value); }}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); adicionar(); } }}
                  placeholder="Ex: suporte, orçamento, agendamento"
                  disabled={salvando}
                  autoFocus
                />
                <div className={styles.gatilhoBottomRow}>
                  <select className={styles.input} value={condicao} onChange={(event) => setCondicao(event.target.value as CondicaoGatilho)} disabled={salvando}>
                    <option value="contem">Contém a palavra</option>
                    <option value="exata">Igual exatamente</option>
                    <option value="inicia_com">Começa com</option>
                    <option value="regex">Regex</option>
                  </select>
                  <button type="button" className={styles.primaryButton} onClick={adicionar} disabled={salvando}>Adicionar</button>
                </div>
                <p className={styles.help}>Cadastre várias palavras de uma vez separando por vírgula ou ponto e vírgula.</p>
              </div>

              {semGatilhos ? (
                <div className={styles.emptyMini}>Nenhum gatilho adicionado para este fluxo.</div>
              ) : (
                <div className={styles.gatilhosList}>
                  {gatilhosAtivos.map((gatilho) => (
                    <div key={gatilho.id} className={styles.gatilhoItem}>
                      <div>
                        <strong className={styles.gatilhoValor}>{gatilho.valor || "Palavra-chave cadastrada"}</strong>
                        <p className={styles.gatilhoMeta}>Condição: {rotuloCondicao(gatilho.condicao)} · Ativo</p>
                      </div>
                    </div>
                  ))}
                  {pendentes.map((gatilho) => (
                    <div key={gatilho.id} className={styles.gatilhoItem}>
                      <div>
                        <strong className={styles.gatilhoValor}>{gatilho.valor}</strong>
                        <p className={styles.gatilhoMeta}>Condição: {rotuloCondicao(gatilho.condicao)} · Será salvo</p>
                      </div>
                      <div className={styles.gatilhoActions}>
                        <button type="button" className={styles.dangerSmallButton} onClick={() => setPendentes((atuais) => atuais.filter((item) => item.id !== gatilho.id))} disabled={salvando} aria-label={`Remover gatilho ${gatilho.valor}`}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {erro && <div className={styles.errorAlert}>{erro}</div>}
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.secondaryButton} onClick={configurarDepois} disabled={salvando}>Configurar depois</button>
          <button type="button" className={styles.primaryButton} onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar configuração"}</button>
        </div>
      </div>
    </div>
  );
}
