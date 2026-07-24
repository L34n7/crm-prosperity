"use client";

import { useEffect } from "react";

const CONNECT_FLAG = "crm:agenda:conectar-google-apos-criar";

function texto(elemento: Element | null) {
  return elemento?.textContent?.trim() || "";
}

function alterarTextoBotao(botao: HTMLButtonElement, novoTexto: string) {
  const noTexto = Array.from(botao.childNodes).find(
    (no) => no.nodeType === Node.TEXT_NODE && no.textContent?.trim()
  );

  if (noTexto) {
    noTexto.textContent = novoTexto;
  } else {
    botao.append(document.createTextNode(novoTexto));
  }
}

function aguardarAgendaCriada(agendaAnteriorId: string) {
  const inicio = Date.now();
  window.sessionStorage.setItem(CONNECT_FLAG, agendaAnteriorId);

  const intervalo = window.setInterval(() => {
    const select = document.querySelector<HTMLSelectElement>(
      ".agendaTemplateShell .a2 .head .select"
    );
    const novoId = select?.value || "";

    if (novoId && novoId !== agendaAnteriorId) {
      window.clearInterval(intervalo);
      window.sessionStorage.removeItem(CONNECT_FLAG);
      window.location.href =
        `/api/agendas/${encodeURIComponent(novoId)}/google-calendar?acao=conectar`;
      return;
    }

    if (Date.now() - inicio > 20_000) {
      window.clearInterval(intervalo);
      window.sessionStorage.removeItem(CONNECT_FLAG);
    }
  }, 250);
}

export default function AgendaEnhancer() {
  useEffect(() => {
    const shellElement =
      document.querySelector<HTMLElement>(".agendaTemplateShell");
    if (!shellElement) return;
    const shell: HTMLElement = shellElement;

    let googleCardOriginal: HTMLElement | null = null;
    let googleCardParentOriginal: HTMLElement | null = null;

    function localizarGoogleCard() {
      if (googleCardOriginal?.isConnected) return googleCardOriginal;

      const cards = Array.from(
        shell.querySelectorAll<HTMLElement>(".a2 .aside .side, .a2 .modal .side")
      );
      googleCardOriginal =
        cards.find((card) =>
          texto(card.querySelector("h3")).includes("Google Calendar")
        ) || null;

      if (googleCardOriginal && !googleCardParentOriginal) {
        googleCardParentOriginal = googleCardOriginal.parentElement;
      }

      return googleCardOriginal;
    }

    function atualizarResumoGoogle() {
      const head = shell.querySelector<HTMLElement>(".a2 .head");
      const blocoTitulo = head?.firstElementChild as HTMLElement | null;
      const cardGoogle = localizarGoogleCard();
      if (!head || !blocoTitulo || !cardGoogle) return;

      blocoTitulo.classList.add("agendaGoogleHeaderSlot");
      blocoTitulo.querySelector("h1")?.remove();
      blocoTitulo.querySelector("p")?.remove();

      let resumo = blocoTitulo.querySelector<HTMLElement>(
        ".agendaGoogleHeaderSummary"
      );

      if (!resumo) {
        resumo = document.createElement("div");
        resumo.className = "agendaGoogleHeaderSummary";
        resumo.innerHTML = `
          <span class="agendaGoogleStatusDot" aria-hidden="true"></span>
          <div class="agendaGoogleHeaderText">
            <strong>Google Calendar</strong>
            <small></small>
          </div>
        `;
        blocoTitulo.appendChild(resumo);
      }

      const status = texto(cardGoogle.querySelector(".pill"));
      const email = texto(cardGoogle.querySelector(".mini span:not(.pill)"));
      const conectado =
        status.toLowerCase().includes("conectado") &&
        !status.toLowerCase().includes("desconectado");
      const detalhe = resumo.querySelector("small");
      const ponto = resumo.querySelector(".agendaGoogleStatusDot");

      resumo.classList.toggle("isConnected", conectado);
      ponto?.classList.toggle("isConnected", conectado);
      if (detalhe) {
        const novoDetalhe = conectado
          ? email || "Sincronização ativa"
          : "Não conectado · abra Configuração";

        if (detalhe.textContent !== novoDetalhe) {
          detalhe.textContent = novoDetalhe;
        }
      }
    }

    function ajustarBotaoConfiguracao() {
      const botoes = Array.from(
        shell.querySelectorAll<HTMLButtonElement>(".a2 .head .actions button")
      );
      const botao = botoes.find((item) =>
        texto(item).toLowerCase().includes("configurar")
      );

      if (botao && !texto(botao).includes("Configuração")) {
        alterarTextoBotao(botao, "Configuração");
      }
    }

    function ajustarMaisEventos() {
      shell.querySelectorAll<HTMLElement>(".a2 .day > .pill").forEach((item) => {
        const correspondencia = texto(item).match(/\+\s*(\d+)\s+eventos?/i);
        if (correspondencia) item.textContent = `Mais ${correspondencia[1]}`;
      });
    }

    function devolverGoogleCard() {
      if (
        googleCardOriginal &&
        googleCardParentOriginal &&
        googleCardOriginal.parentElement !== googleCardParentOriginal
      ) {
        googleCardOriginal.classList.remove("agendaGoogleConfigCard");
        googleCardParentOriginal.appendChild(googleCardOriginal);
      }
    }

    function localizarCampoDescricao(modal: HTMLElement) {
      return Array.from(
        modal.querySelectorAll<HTMLElement>(".body > .form > .field")
      ).find(
        (campo) =>
          texto(campo.querySelector("label")).toLocaleLowerCase("pt-BR") ===
          "descrição"
      );
    }

    function inserirDepoisDaDescricao(
      modal: HTMLElement,
      elemento: HTMLElement
    ) {
      const campoDescricao = localizarCampoDescricao(modal);
      const formulario = modal.querySelector<HTMLElement>(".body > .form");

      if (campoDescricao?.parentElement) {
        campoDescricao.insertAdjacentElement("afterend", elemento);
      } else if (formulario) {
        formulario.appendChild(elemento);
      } else {
        modal.querySelector<HTMLElement>(".body")?.appendChild(elemento);
      }
    }

    function inserirGoogleNaConfiguracao(modal: HTMLElement) {
      const titulo = texto(modal.querySelector(".dhead h2"));
      const corpo = modal.querySelector<HTMLElement>(".body");
      if (!corpo) return;

      if (titulo.includes("Configurar agenda")) {
        const cardGoogle = localizarGoogleCard();
        if (cardGoogle && !cardGoogle.classList.contains("agendaGoogleConfigCard")) {
          cardGoogle.classList.add("agendaGoogleConfigCard");
          inserirDepoisDaDescricao(modal, cardGoogle);
        }
        return;
      }

      if (!titulo.includes("Nova agenda")) return;
      if (corpo.querySelector(".agendaGoogleCreateOption")) return;

      const secao = document.createElement("section");
      secao.className = "agendaGoogleCreateOption";
      secao.innerHTML = `
        <div class="agendaGoogleCreateIcon" aria-hidden="true">G</div>
        <div class="agendaGoogleCreateText">
          <strong>Google Calendar</strong>
          <span>Conecte a nova agenda ao Google logo após salvar.</span>
        </div>
        <label class="agendaGoogleCreateToggle">
          <input type="checkbox" />
          <span>Conectar após criar</span>
        </label>
      `;
      inserirDepoisDaDescricao(modal, secao);

      const botaoSalvar = Array.from(
        modal.querySelectorAll<HTMLButtonElement>(".foot button")
      ).find((botao) => texto(botao) === "Salvar");
      const botaoCancelar = Array.from(
        modal.querySelectorAll<HTMLButtonElement>(".foot button, .dhead button")
      ).filter(
        (botao) => texto(botao) === "Cancelar" || Boolean(botao.closest(".dhead"))
      );

      if (botaoSalvar && botaoSalvar.dataset.googleCreateBound !== "true") {
        botaoSalvar.dataset.googleCreateBound = "true";
        botaoSalvar.addEventListener("click", () => {
          const marcado = secao.querySelector<HTMLInputElement>("input")?.checked;
          if (!marcado) return;

          const agendaAnteriorId =
            shell.querySelector<HTMLSelectElement>(".a2 .head .select")?.value ||
            "";
          aguardarAgendaCriada(agendaAnteriorId);
        });
      }

      botaoCancelar.forEach((botao) => {
        if (botao.dataset.googleCancelBound === "true") return;
        botao.dataset.googleCancelBound = "true";
        botao.addEventListener("click", () => {
          window.sessionStorage.removeItem(CONNECT_FLAG);
        });
      });
    }

    function aplicarAjustes() {
      atualizarResumoGoogle();
      ajustarBotaoConfiguracao();
      ajustarMaisEventos();

      const modal = shell.querySelector<HTMLElement>(".a2 .modalbg .modal");
      if (modal) inserirGoogleNaConfiguracao(modal);
      else devolverGoogleCard();
    }

    aplicarAjustes();

    const observer = new MutationObserver(() => aplicarAjustes());
    observer.observe(shell, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      devolverGoogleCard();
    };
  }, []);

  return null;
}
