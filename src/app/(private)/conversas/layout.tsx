import Script from "next/script";
import { type ReactNode } from "react";

import ConteudoIndisponivelAlignment from "./ConteudoIndisponivelAlignment";

const SCRIPT_CAMPOS_CAPTURA_CONVERSA = `
(() => {
  const HOST_ATTR = "data-conversa-capturas-contato";
  const STYLE_ID = "conversa-capturas-contato-style";
  let requestSequence = 0;
  let chaveAtual = "";
  let carregando = false;
  let frame = 0;

  function normalizarTexto(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase()
      .replace(/\\s+/g, " ")
      .trim();
  }

  function normalizarTelefone(valor) {
    return String(valor || "").replace(/\\D/g, "");
  }

  function normalizarEmail(valor) {
    return String(valor || "").trim().toLowerCase();
  }

  function estaVisivel(elemento) {
    if (!(elemento instanceof HTMLElement)) return false;
    const estilo = window.getComputedStyle(elemento);
    const retangulo = elemento.getBoundingClientRect();
    return (
      estilo.display !== "none" &&
      estilo.visibility !== "hidden" &&
      Number(estilo.opacity || "1") !== 0 &&
      retangulo.width > 0 &&
      retangulo.height > 0
    );
  }

  function encontrarLinhaPorLabel(lista, labelProcurado) {
    const alvo = normalizarTexto(labelProcurado);
    return Array.from(lista.children).find((filho) => {
      const elemento = filho;
      return Array.from(
        elemento.querySelectorAll("span, label, strong, p, div")
      ).some(
        (item) =>
          item.childElementCount === 0 &&
          normalizarTexto(item.textContent) === alvo
      );
    }) || null;
  }

  function obterValorLinha(linha, label) {
    if (!linha) return "";
    const campo = linha.querySelector("input, textarea");
    if (campo && campo.value) return String(campo.value).trim();

    const valor = linha.querySelector(
      '[class*="whatsInfoValue"], [class*="infoValueRow"] span, [class*="infoValueRow"] a'
    );
    const texto = String(valor?.textContent || "").trim();
    return normalizarTexto(texto) === normalizarTexto(label) ? "" : texto;
  }

  function encontrarContexto() {
    const candidatos = Array.from(
      document.querySelectorAll("span, label")
    ).filter(
      (elemento) =>
        estaVisivel(elemento) &&
        elemento.childElementCount === 0 &&
        normalizarTexto(elemento.textContent) === "observacoes"
    );

    for (const label of candidatos) {
      const linha = label.closest('[class*="whatsInfoRow"]');
      const lista = linha?.parentElement;
      if (!linha || !lista) continue;

      const linhaTelefone = encontrarLinhaPorLabel(lista, "telefone");
      const linhaEmail = encontrarLinhaPorLabel(lista, "e-mail");
      const telefone = normalizarTelefone(
        obterValorLinha(linhaTelefone, "telefone") ||
          document.querySelector('[class*="whatsContactPhone"]')?.textContent
      );
      const email = normalizarEmail(obterValorLinha(linhaEmail, "e-mail"));

      if (!telefone && !email) continue;
      return { lista, observacoes: linha, telefone, email };
    }

    return null;
  }

  function removerHosts(lista) {
    document
      .querySelectorAll("[" + HOST_ATTR + "]")
      .forEach((elemento) => {
        if (!lista || elemento.parentElement !== lista) elemento.remove();
      });
  }

  function tituloBase(informacao) {
    return (
      String(informacao.nome_campo || informacao.tipo || "Informação")
        .replace(/[_-]+/g, " ")
        .replace(/\\s+\\d+\\s*$/, "")
        .replace(/\\s+captura\\s*$/i, "")
        .replace(/\\s+/g, " ")
        .trim() || "Informação"
    );
  }

  function chaveTitulo(informacao) {
    return normalizarTexto(tituloBase(informacao))
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function formatarTitulo(informacao) {
    const base = tituloBase(informacao);
    const normalizado = normalizarTexto(base);
    const titulo =
      normalizado === "email" || normalizado === "e mail"
        ? "E-mail"
        : base.charAt(0).toUpperCase() + base.slice(1);
    return titulo + " captura";
  }

  function criarLinha(modelo, informacao) {
    const linha = document.createElement("div");
    linha.className = modelo.className;
    linha.setAttribute(HOST_ATTR, "item");

    const labelModelo = modelo.querySelector('[class*="whatsInfoLabel"]');
    const valorModelo = modelo.querySelector('[class*="whatsInfoValue"]');
    const label = document.createElement("span");
    const valor = document.createElement("strong");

    label.className = labelModelo?.className || "";
    valor.className = valorModelo?.className || "";
    label.textContent = formatarTitulo(informacao);
    valor.textContent = String(informacao.valor || "").trim();

    linha.append(label, valor);
    return linha;
  }

  function renderizar(contexto, informacoes) {
    contexto.lista
      .querySelectorAll("[" + HOST_ATTR + "]")
      .forEach((elemento) => elemento.remove());

    const vistos = new Set();
    const resumo = informacoes.filter((informacao) => {
      const valor = String(informacao?.valor || "").trim();
      const chave = chaveTitulo(informacao || {});
      if (!valor || !chave || vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });

    let referencia = contexto.observacoes;
    resumo.forEach((informacao) => {
      const linha = criarLinha(contexto.observacoes, informacao);
      referencia.insertAdjacentElement("afterend", linha);
      referencia = linha;
    });
  }

  function contatoDaConversa(conversa) {
    const contato = Array.isArray(conversa?.contatos)
      ? conversa.contatos[0]
      : conversa?.contatos || conversa?.contato || {};
    return contato && typeof contato === "object" ? contato : {};
  }

  async function resolverConversaId(contexto) {
    const termos = [contexto.telefone, contexto.email].filter(Boolean);

    for (const termo of termos) {
      const params = new URLSearchParams({ busca: termo, limit: "50" });
      const response = await fetch("/api/conversas?" + params.toString(), {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) continue;

      const conversas = Array.isArray(data.conversas) ? data.conversas : [];
      const exata = conversas.find((conversa) => {
        const contato = contatoDaConversa(conversa);
        return (
          (contexto.telefone &&
            normalizarTelefone(contato.telefone) === contexto.telefone) ||
          (contexto.email &&
            normalizarEmail(contato.email) === contexto.email)
        );
      });
      const conversa = exata || conversas[0];
      const id = String(conversa?.id || "").trim();
      if (id) return id;
    }

    return "";
  }

  async function carregar(contexto, forcar) {
    const chave = contexto.telefone + "|" + contexto.email;
    if (!forcar && (carregando || chaveAtual === chave)) return;

    const requestId = ++requestSequence;
    carregando = true;

    try {
      const conversaId = await resolverConversaId(contexto);
      if (!conversaId || requestId !== requestSequence) {
        if (requestId === requestSequence) renderizar(contexto, []);
        return;
      }

      const response = await fetch(
        "/api/conversas/" + encodeURIComponent(conversaId) + "/informacoes-captura",
        { cache: "no-store" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || "Erro ao carregar informações de captura.");
      }

      if (requestId !== requestSequence) return;
      renderizar(
        contexto,
        Array.isArray(data.informacoes) ? data.informacoes : []
      );
      chaveAtual = chave;
    } catch (error) {
      if (requestId === requestSequence) {
        renderizar(contexto, []);
        console.error("[capturas-conversa]", error);
      }
    } finally {
      if (requestId === requestSequence) carregando = false;
    }
  }

  function sincronizar() {
    const contexto = encontrarContexto();
    if (!contexto) {
      requestSequence += 1;
      chaveAtual = "";
      carregando = false;
      removerHosts(null);
      return;
    }

    removerHosts(contexto.lista);
    void carregar(contexto, false);
  }

  function agendar() {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      sincronizar();
    });
  }

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      '[data-capture-info-visible-panel-v4-summary], ' +
      '[data-conversas-capture-summary-host], ' +
      '[data-capture-info-panel-v2-summary], ' +
      '[data-capture-info-panel-v3-summary] { display: none !important; }';
    document.head.appendChild(style);
  }

  const observer = new MutationObserver(agendar);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", () => {
    requestSequence += 1;
    chaveAtual = "";
    agendar();
  });
  document.addEventListener("input", () => {
    chaveAtual = "";
    agendar();
  }, true);
  agendar();
})();
`;

export default function ConversasLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ConteudoIndisponivelAlignment />
      {children}
      <Script
        id="corrigir-campos-captura-conversa"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: SCRIPT_CAMPOS_CAPTURA_CONVERSA }}
      />
    </>
  );
}
