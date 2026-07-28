"use client";

import { useEffect } from "react";
import AgendaAutomationEnhancer from "./AgendaAutomationEnhancer";
import AgendaAutomationRuntimeStatus from "./AgendaAutomationRuntimeStatus";
import AgendaEnhancerLegacy from "./AgendaEnhancerLegacy";
import AgendaGoogleAgendaBindingFix from "./AgendaGoogleAgendaBindingFix";

const HEADER_ACTION_ALIGNMENT_STYLES = `
  .agendaTemplateShell .a2 .head.agendaHeadPremium .agendaRefreshBtn {
    margin-left: 0 !important;
  }

  .agendaTemplateShell .a2 .head.agendaHeadPremium .agendaNewBtn {
    margin-left: auto !important;
  }

  @media (max-width: 860px) {
    .agendaTemplateShell .a2 .head.agendaHeadPremium .agendaNewBtn {
      margin-left: 0 !important;
    }
  }
`;

const AGENDA_OVERVIEW_STYLES = `
  .agendaTemplateShell .agendaOverviewDrawer {
    width: min(760px, 97vw) !important;
    background: var(--crm-surface) !important;
  }

  .agendaTemplateShell .agendaOverviewDrawer .agendaOverviewHeader {
    min-height: 78px;
    padding: 15px 18px;
    border-bottom: 1px solid var(--crm-border);
    background: var(--header);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .agendaTemplateShell .agendaOverviewHeaderIcon {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    border: 1px solid var(--crm-primary-border);
    border-radius: 13px;
    background: var(--crm-primary-soft);
    color: var(--crm-primary-text);
    display: grid;
    place-items: center;
  }

  .agendaTemplateShell .agendaOverviewHeaderCopy {
    min-width: 0;
    flex: 1;
  }

  .agendaTemplateShell .agendaOverviewHeaderCopy h2 {
    margin: 0;
    color: var(--crm-text-strong);
    font-size: 19px;
    font-weight: 900;
    line-height: 1.25;
  }

  .agendaTemplateShell .agendaOverviewHeaderCopy p {
    margin: 4px 0 0;
    color: var(--crm-text-muted);
    font-size: 11px;
  }

  .agendaTemplateShell .agendaOverviewClose {
    width: 40px;
    min-width: 40px;
    padding: 0 !important;
  }

  .agendaTemplateShell .agendaOverviewBody {
    padding: 16px 18px 22px;
    overflow-y: auto;
    flex: 1;
    background: var(--crm-surface-soft);
  }

  .agendaTemplateShell .agendaOverviewHero {
    position: relative;
    margin-bottom: 13px;
    padding: 17px;
    border: 1px solid var(--crm-primary-border);
    border-radius: 18px;
    background: linear-gradient(135deg, var(--crm-primary-soft), var(--crm-surface) 66%);
    overflow: hidden;
  }

  .agendaTemplateShell .agendaOverviewHero::after {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 3px;
    background: linear-gradient(90deg, var(--crm-primary-strong), var(--crm-success-strong));
  }

  .agendaTemplateShell .agendaOverviewHeroTop {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .agendaTemplateShell .agendaOverviewHero h3 {
    margin: 0;
    color: var(--crm-text-strong);
    font-size: 21px;
    font-weight: 900;
    line-height: 1.25;
  }

  .agendaTemplateShell .agendaOverviewHeroType {
    margin: 5px 0 0;
    color: var(--crm-text-muted);
    font-size: 12px;
  }

  .agendaTemplateShell .agendaOverviewStatus {
    min-height: 27px;
    padding: 0 10px;
    border: 1px solid var(--crm-primary-border);
    border-radius: 999px;
    background: var(--crm-primary-soft);
    color: var(--crm-primary-text);
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    font-weight: 900;
    white-space: nowrap;
  }

  .agendaTemplateShell .agendaOverviewStatus[data-status="confirmado"],
  .agendaTemplateShell .agendaOverviewStatus[data-status="realizado"] {
    border-color: var(--crm-success-border);
    background: var(--crm-success-bg);
    color: var(--crm-success-text);
  }

  .agendaTemplateShell .agendaOverviewStatus[data-status="cancelado"],
  .agendaTemplateShell .agendaOverviewStatus[data-status="faltou"] {
    border-color: var(--crm-danger-border);
    background: var(--crm-danger-bg);
    color: var(--crm-danger-text);
  }

  .agendaTemplateShell .agendaOverviewMetrics {
    margin-top: 15px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }

  .agendaTemplateShell .agendaOverviewMetric {
    min-width: 0;
    padding: 11px 12px;
    border: 1px solid color-mix(in srgb, var(--crm-primary-border) 58%, var(--crm-border));
    border-radius: 13px;
    background: color-mix(in srgb, var(--crm-surface) 88%, transparent);
  }

  .agendaTemplateShell .agendaOverviewMetric span {
    display: block;
    margin-bottom: 4px;
    color: var(--crm-text-muted);
    font-size: 9px;
    font-weight: 850;
    letter-spacing: 0.035em;
    text-transform: uppercase;
  }

  .agendaTemplateShell .agendaOverviewMetric strong {
    display: block;
    color: var(--crm-text-strong);
    font-size: 12px;
    font-weight: 850;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .agendaTemplateShell .agendaOverviewGrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .agendaTemplateShell .agendaOverviewSection {
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--crm-border);
    border-radius: 17px;
    background: var(--crm-surface);
    box-shadow: var(--crm-shadow-xs);
  }

  .agendaTemplateShell .agendaOverviewSection.isFull {
    grid-column: 1 / -1;
  }

  .agendaTemplateShell .agendaOverviewSection h4 {
    margin: 0 0 11px;
    color: var(--crm-text-strong);
    font-size: 13px;
    font-weight: 900;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .agendaTemplateShell .agendaOverviewSection h4::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--crm-primary-strong);
    box-shadow: 0 0 0 4px var(--crm-primary-soft);
  }

  .agendaTemplateShell .agendaOverviewRows {
    display: grid;
    gap: 9px;
  }

  .agendaTemplateShell .agendaOverviewRow {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(105px, 0.7fr) minmax(0, 1.3fr);
    gap: 12px;
    align-items: start;
  }

  .agendaTemplateShell .agendaOverviewRow > span {
    color: var(--crm-text-muted);
    font-size: 10px;
    font-weight: 750;
  }

  .agendaTemplateShell .agendaOverviewRow > strong,
  .agendaTemplateShell .agendaOverviewRow > div {
    min-width: 0;
    color: var(--crm-text-strong);
    font-size: 11px;
    font-weight: 750;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .agendaTemplateShell .agendaOverviewText {
    margin: 0;
    color: var(--crm-text);
    font-size: 11px;
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .agendaTemplateShell .agendaOverviewList {
    display: grid;
    gap: 8px;
  }

  .agendaTemplateShell .agendaOverviewListItem {
    padding: 10px 11px;
    border: 1px solid var(--crm-border);
    border-radius: 12px;
    background: var(--crm-surface-soft);
  }

  .agendaTemplateShell .agendaOverviewListItem > b {
    display: block;
    margin-bottom: 7px;
    color: var(--crm-text-strong);
    font-size: 11px;
    font-weight: 900;
  }

  .agendaTemplateShell .agendaOverviewHistoryItem {
    position: relative;
    padding: 0 0 12px 18px;
    border-left: 1px solid var(--crm-border-strong);
  }

  .agendaTemplateShell .agendaOverviewHistoryItem:last-child {
    padding-bottom: 0;
  }

  .agendaTemplateShell .agendaOverviewHistoryItem::before {
    content: "";
    position: absolute;
    top: 3px;
    left: -5px;
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--crm-success-strong);
    box-shadow: 0 0 0 4px var(--crm-success-bg);
  }

  .agendaTemplateShell .agendaOverviewHistoryItem b {
    display: block;
    color: var(--crm-text-strong);
    font-size: 11px;
    text-transform: capitalize;
  }

  .agendaTemplateShell .agendaOverviewHistoryItem p {
    margin: 3px 0;
    color: var(--crm-text-muted);
    font-size: 10px;
    line-height: 1.45;
  }

  .agendaTemplateShell .agendaOverviewHistoryItem small {
    color: var(--crm-text-soft);
    font-size: 9px;
  }

  .agendaTemplateShell .agendaOverviewEmpty {
    padding: 8px 0;
    color: var(--crm-text-muted);
    font-size: 10px;
  }

  .agendaTemplateShell .agendaOverviewLink {
    color: var(--crm-primary-text);
    font-weight: 850;
    text-decoration: none;
  }

  .agendaTemplateShell .agendaOverviewLink:hover {
    text-decoration: underline;
  }

  .agendaTemplateShell .agendaOverviewFooter {
    min-height: 70px;
    padding: 13px 17px;
    border-top: 1px solid var(--crm-border);
    background: var(--header);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .agendaTemplateShell .agendaOverviewFooterGroup {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-wrap: wrap;
  }

  .agendaTemplateShell .agendaOverviewFooter .btn {
    min-width: 120px;
  }

  @media (max-width: 680px) {
    .agendaTemplateShell .agendaOverviewMetrics,
    .agendaTemplateShell .agendaOverviewGrid {
      grid-template-columns: 1fr;
    }

    .agendaTemplateShell .agendaOverviewSection.isFull {
      grid-column: auto;
    }

    .agendaTemplateShell .agendaOverviewFooter {
      align-items: stretch;
      flex-direction: column-reverse;
    }

    .agendaTemplateShell .agendaOverviewFooterGroup,
    .agendaTemplateShell .agendaOverviewFooter .btn {
      width: 100%;
    }

    .agendaTemplateShell .agendaOverviewFooter .btn {
      flex: 1;
    }
  }
`;

function normalizarTexto(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function texto(elemento: Element | null) {
  return elemento?.textContent?.trim() || "";
}

function escaparHtml(valor: string) {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function encontrarSecao(drawer: HTMLElement, titulo: string) {
  const tituloNormalizado = normalizarTexto(titulo);
  return Array.from(drawer.querySelectorAll<HTMLElement>(".body > .section")).find(
    (secao) => normalizarTexto(texto(secao.querySelector("h3"))).includes(tituloNormalizado)
  );
}

function valorControle(controle: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) {
  if (!controle) return "";
  if (controle instanceof HTMLSelectElement) {
    return controle.selectedOptions[0]?.textContent?.trim() || controle.value.trim();
  }
  return controle.value.trim();
}

function valorCampo(secao: HTMLElement | undefined, rotulo: string) {
  if (!secao) return "";
  const rotuloNormalizado = normalizarTexto(rotulo);
  const campo = Array.from(secao.querySelectorAll<HTMLElement>(".field")).find(
    (item) => normalizarTexto(texto(item.querySelector("label"))) === rotuloNormalizado
  );
  return valorControle(
    campo?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input, select, textarea"
    ) || null
  );
}

function formatarDataHora(valor: string) {
  if (!valor) return "Não informado";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(data);
}

function formatarDuracao(inicio: string, fim: string) {
  const dataInicio = new Date(inicio);
  const dataFim = new Date(fim);
  const minutos = Math.round((dataFim.getTime() - dataInicio.getTime()) / 60000);
  if (!Number.isFinite(minutos) || minutos <= 0) return "Não informada";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const restante = minutos % 60;
  return restante ? `${horas}h ${restante}min` : `${horas}h`;
}

function linhaPanorama(rotulo: string, valor: string, html = false) {
  const conteudo = valor || "Não informado";
  return `<div class="agendaOverviewRow"><span>${escaparHtml(rotulo)}</span><strong>${
    html ? conteudo : escaparHtml(conteudo)
  }</strong></div>`;
}

function lerCamposDoItem(item: HTMLElement) {
  return Array.from(item.querySelectorAll<HTMLElement>(".field"))
    .map((campo) => {
      const rotulo = texto(campo.querySelector("label"));
      const valor = valorControle(
        campo.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input, select, textarea"
        )
      );
      return rotulo && valor ? { rotulo, valor } : null;
    })
    .filter((campo): campo is { rotulo: string; valor: string } => Boolean(campo));
}

function listaRepeticoes(secao: HTMLElement | undefined, vazio: string) {
  const itens = Array.from(secao?.querySelectorAll<HTMLElement>(".repeat") || []);
  if (!itens.length) return `<div class="agendaOverviewEmpty">${escaparHtml(vazio)}</div>`;

  return `<div class="agendaOverviewList">${itens
    .map((item, indice) => {
      const titulo = texto(item.querySelector(".row b")) || `Item ${indice + 1}`;
      const linhas = lerCamposDoItem(item)
        .map((campo) => linhaPanorama(campo.rotulo, campo.valor))
        .join("");
      return `<article class="agendaOverviewListItem"><b>${escaparHtml(
        titulo
      )}</b><div class="agendaOverviewRows">${linhas}</div></article>`;
    })
    .join("")}</div>`;
}

function criarPanorama(source: HTMLElement) {
  const overlay = source.parentElement;
  if (!overlay || source.dataset.agendaOverviewBound === "true") return;

  const titulo = texto(source.querySelector(".dhead h2"));
  if (!titulo || normalizarTexto(titulo).includes("novo agendamento")) return;

  const informacoes = encontrarSecao(source, "Informações principais");
  const cliente = encontrarSecao(source, "Cliente");
  const participantes = encontrarSecao(source, "Participantes");
  const relacionados =
    encontrarSecao(source, "Registros relacionados") ||
    encontrarSecao(source, "Registro relacionado") ||
    encontrarSecao(source, "Imóvel relacionado") ||
    encontrarSecao(source, "Procedimento relacionado");
  const lembretes = encontrarSecao(source, "Lembretes e confirmação");
  const resultado = encontrarSecao(source, "Resultado e informações internas");
  const historico = encontrarSecao(source, "Histórico");

  const inicio = valorCampo(informacoes, "Início");
  const fim = valorCampo(informacoes, "Fim");
  const status = valorCampo(informacoes, "Status");
  const tipo = valorCampo(informacoes, "Tipo") || "Sem tipo";
  const responsavel = valorCampo(informacoes, "Responsável") || "Sem responsável";
  const prioridade = valorCampo(informacoes, "Prioridade") || "Normal";
  const local = valorCampo(informacoes, "Local / endereço");
  const linkReuniao = valorCampo(informacoes, "Link da reunião");
  const descricao = valorCampo(informacoes, "Descrição");
  const nomeCliente = valorCampo(cliente, "Nome") || texto(cliente?.querySelector(".contact b"));
  const telefoneCliente = valorCampo(cliente, "Telefone");
  const emailCliente = valorCampo(cliente, "E-mail");
  const confirmacao = valorCampo(lembretes, "Status da confirmação");
  const statusFinal = valorCampo(resultado, "Status final");
  const resumoResultado = valorCampo(resultado, "Resumo do resultado");
  const observacoesInternas = valorCampo(resultado, "Observações internas");
  const statusNormalizado = normalizarTexto(status);

  const contatoLink = cliente?.querySelector<HTMLAnchorElement>('a[href^="/contatos"]')?.href || "";
  const whatsappLink = cliente?.querySelector<HTMLAnchorElement>('a[href*="wa.me"]')?.href || "";
  const googleLink = source.querySelector<HTMLAnchorElement>(".agendaGoogleEventOpen")?.href || "";

  const historicoHtml = Array.from(historico?.querySelectorAll<HTMLElement>(".hist") || [])
    .map(
      (item) => `<article class="agendaOverviewHistoryItem"><b>${escaparHtml(
        texto(item.querySelector("b")).replaceAll("_", " ") || "Alteração"
      )}</b><p>${escaparHtml(
        texto(item.querySelector("p")) || "Alteração registrada."
      )}</p><small>${escaparHtml(texto(item.querySelector("small")))}</small></article>`
    )
    .join("");

  const panorama = document.createElement("aside");
  panorama.className = "drawer agendaOverviewDrawer";
  panorama.setAttribute("role", "dialog");
  panorama.setAttribute("aria-modal", "true");
  panorama.setAttribute("aria-label", `Panorama do agendamento ${titulo}`);
  panorama.innerHTML = `
    <header class="agendaOverviewHeader">
      <div class="agendaOverviewHeaderIcon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
      </div>
      <div class="agendaOverviewHeaderCopy">
        <h2>Panorama do agendamento</h2>
        <p>Visualize todas as informações antes de realizar alterações.</p>
      </div>
      <button type="button" class="btn agendaOverviewClose" data-overview-action="close" aria-label="Fechar panorama">×</button>
    </header>

    <div class="agendaOverviewBody">
      <section class="agendaOverviewHero">
        <div class="agendaOverviewHeroTop">
          <div>
            <h3>${escaparHtml(titulo)}</h3>
            <p class="agendaOverviewHeroType">${escaparHtml(tipo)}</p>
          </div>
          <span class="agendaOverviewStatus" data-status="${escaparHtml(
            statusNormalizado
          )}">${escaparHtml(status || "Sem status")}</span>
        </div>
        <div class="agendaOverviewMetrics">
          <div class="agendaOverviewMetric"><span>Início</span><strong>${escaparHtml(
            formatarDataHora(inicio)
          )}</strong></div>
          <div class="agendaOverviewMetric"><span>Duração</span><strong>${escaparHtml(
            formatarDuracao(inicio, fim)
          )}</strong></div>
          <div class="agendaOverviewMetric"><span>Cliente</span><strong>${escaparHtml(
            nomeCliente || "Cliente não informado"
          )}</strong></div>
          <div class="agendaOverviewMetric"><span>Responsável</span><strong>${escaparHtml(
            responsavel
          )}</strong></div>
        </div>
      </section>

      <div class="agendaOverviewGrid">
        <section class="agendaOverviewSection">
          <h4>Informações principais</h4>
          <div class="agendaOverviewRows">
            ${linhaPanorama("Término", formatarDataHora(fim))}
            ${linhaPanorama("Prioridade", prioridade)}
            ${linhaPanorama("Confirmação", confirmacao || "Não informada")}
            ${linhaPanorama("Local", local || "Não informado")}
            ${
              linkReuniao
                ? linhaPanorama(
                    "Reunião",
                    `<a class="agendaOverviewLink" href="${escaparHtml(
                      linkReuniao
                    )}" target="_blank" rel="noopener noreferrer">Abrir link da reunião</a>`,
                    true
                  )
                : linhaPanorama("Reunião", "Não informada")
            }
          </div>
        </section>

        <section class="agendaOverviewSection">
          <h4>Cliente</h4>
          <div class="agendaOverviewRows">
            ${linhaPanorama("Nome", nomeCliente || "Não informado")}
            ${linhaPanorama("Telefone", telefoneCliente || "Não informado")}
            ${linhaPanorama("E-mail", emailCliente || "Não informado")}
          </div>
        </section>

        <section class="agendaOverviewSection isFull">
          <h4>Descrição</h4>
          <p class="agendaOverviewText">${escaparHtml(
            descricao || "Nenhuma descrição foi adicionada."
          )}</p>
        </section>

        <section class="agendaOverviewSection">
          <h4>Participantes</h4>
          ${listaRepeticoes(participantes, "Nenhum participante adicional.")}
        </section>

        <section class="agendaOverviewSection">
          <h4>Registros relacionados</h4>
          ${listaRepeticoes(relacionados, "Nenhum registro relacionado.")}
        </section>

        <section class="agendaOverviewSection isFull">
          <h4>Lembretes</h4>
          ${listaRepeticoes(lembretes, "Nenhum lembrete ativo.")}
        </section>

        <section class="agendaOverviewSection isFull">
          <h4>Resultado e informações internas</h4>
          <div class="agendaOverviewRows">
            ${linhaPanorama("Status final", statusFinal || status || "Não informado")}
            ${linhaPanorama("Resultado", resumoResultado || "Não informado")}
          </div>
          <p class="agendaOverviewText" style="margin-top:11px">${escaparHtml(
            observacoesInternas || "Nenhuma observação interna."
          )}</p>
        </section>

        <section class="agendaOverviewSection isFull">
          <h4>Histórico</h4>
          <div>${
            historicoHtml || '<div class="agendaOverviewEmpty">Sem alterações registradas.</div>'
          }</div>
        </section>
      </div>
    </div>

    <footer class="agendaOverviewFooter">
      <div class="agendaOverviewFooterGroup">
        ${
          whatsappLink
            ? `<a class="btn" href="${escaparHtml(
                whatsappLink
              )}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`
            : ""
        }
        ${
          contatoLink
            ? `<a class="btn" href="${escaparHtml(contatoLink)}">Abrir contato</a>`
            : ""
        }
        ${
          googleLink
            ? `<a class="btn" href="${escaparHtml(
                googleLink
              )}" target="_blank" rel="noopener noreferrer">Abrir no Google</a>`
            : ""
        }
      </div>
      <div class="agendaOverviewFooterGroup">
        <button type="button" class="btn" data-overview-action="close">Fechar</button>
        <button type="button" class="btn primary" data-overview-action="edit">Editar agendamento</button>
      </div>
    </footer>
  `;

  source.dataset.agendaOverviewBound = "true";
  source.hidden = true;
  overlay.appendChild(panorama);

  panorama.querySelectorAll<HTMLButtonElement>('[data-overview-action="close"]').forEach(
    (botao) => {
      botao.addEventListener("click", () => {
        source.querySelector<HTMLButtonElement>(".dhead > button")?.click();
      });
    }
  );

  panorama
    .querySelector<HTMLButtonElement>('[data-overview-action="edit"]')
    ?.addEventListener("click", () => {
      source.dataset.agendaOverviewEditMode = "true";
      source.hidden = false;
      panorama.remove();
      window.requestAnimationFrame(() => {
        source.querySelector<HTMLInputElement>(".body input")?.focus();
      });
    });
}

function AgendaOverviewEnhancer() {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".agendaTemplateShell");
    if (!shell) return;

    let frame = 0;
    let disposed = false;

    const aplicar = () => {
      frame = 0;
      if (disposed) return;

      const drawers = Array.from(
        shell.querySelectorAll<HTMLElement>(
          ".a2 .overlay > .drawer:not(.agendaOverviewDrawer)"
        )
      );

      drawers.forEach((drawer) => {
        if (drawer.dataset.agendaOverviewEditMode === "true") return;
        criarPanorama(drawer);
      });
    };

    const agendar = () => {
      if (disposed || frame) return;
      frame = window.requestAnimationFrame(aplicar);
    };

    const observer = new MutationObserver(agendar);
    observer.observe(shell, { childList: true, subtree: true });

    const fecharComEscape = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      const panorama = shell.querySelector<HTMLElement>(".agendaOverviewDrawer");
      panorama
        ?.querySelector<HTMLButtonElement>('[data-overview-action="close"]')
        ?.click();
    };

    document.addEventListener("keydown", fecharComEscape);
    aplicar();

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("keydown", fecharComEscape);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

export default function AgendaEnhancer() {
  return (
    <>
      <style>{HEADER_ACTION_ALIGNMENT_STYLES}</style>
      <style>{AGENDA_OVERVIEW_STYLES}</style>
      <AgendaEnhancerLegacy />
      <AgendaAutomationEnhancer />
      <AgendaAutomationRuntimeStatus />
      <AgendaGoogleAgendaBindingFix />
      <AgendaOverviewEnhancer />
    </>
  );
}
