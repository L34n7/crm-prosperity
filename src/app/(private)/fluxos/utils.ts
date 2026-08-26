import type { Node } from "@xyflow/react";
import {
  LIMITE_DELAY_SEGUNDOS,
  TIPO_NO_PERGUNTA_LIVRE_IA,
} from "./constants";
import {
  SAIDAS_CONSULTA_ESTOQUE,
  TIPO_NO_CONSULTAR_ESTOQUE,
} from "./consultar-estoque-editor";
import {
  SAIDAS_CHECKOUT_PAGAMENTO,
  TIPO_NO_CHECKOUT_PAGAMENTO,
} from "./checkout-pagamento-editor";

export type OpcaoRespostaConexao = {
  valor: string;
  titulo: string;
};

export function labelTipoNo(tipo: string) {
  if (tipo === "inicio") return "Início";
  if (tipo === "enviar_texto") return "Mensagem";
  if (tipo === "pergunta_opcoes") return "Pergunta";
  if (tipo === TIPO_NO_PERGUNTA_LIVRE_IA) return "Pergunta IA";
  if (tipo === "transferir_setor") return "Transferir";
  if (tipo === "encerrar") return "Encerrar";
  if (tipo === "enviar_imagem") return "Imagem";
  if (tipo === "enviar_video") return "Vídeo";
  if (tipo === "enviar_audio") return "Áudio";
  if (tipo === "enviar_arquivo") return "Arquivo";
  if (tipo === "enviar_botoes") return "Botões";
  if (tipo === "botao_redirect") return "Botão redirect";
  if (tipo === "avaliacao") return "Avaliação";
  if (tipo === "capturar_resposta") return "Captura";
  if (tipo === "agendar_disparo") return "Agendar disparo";
  if (tipo === TIPO_NO_CONSULTAR_ESTOQUE) return "Consultar estoque";
  if (tipo === TIPO_NO_CHECKOUT_PAGAMENTO) return "Checkout / pagamento";
  if (tipo === "agenda_buscar_agendamento") return "Buscar agenda";
  if (tipo === "agenda_escolher_horario") return "Escolher horário";
  if (tipo === "agenda_criar_agendamento") return "Criar agendamento";
  if (tipo === "agenda_remarcar_agendamento") return "Remarcar";
  if (tipo === "agenda_cancelar_agendamento") return "Cancelar agenda";
  if (tipo === "interpretar_arquivo_ia") return "Interp. arquivo IA";
  return tipo;
}

export function tituloPadraoTipoNo(tipo: string) {
  if (tipo === "inicio") return "Início";
  if (tipo === "enviar_texto") return "Nova mensagem";
  if (tipo === "pergunta_opcoes") return "Nova pergunta";
  if (tipo === TIPO_NO_PERGUNTA_LIVRE_IA) return "Pergunta aberta IA";
  if (tipo === "enviar_botoes") return "Pergunta botões";
  if (tipo === "botao_redirect") return "Botão redirect";
  if (tipo === "transferir_setor") return "Transferir setor";
  if (tipo === "encerrar") return "Encerrar";
  if (tipo === "enviar_imagem") return "Nova imagem";
  if (tipo === "enviar_video") return "Novo vídeo";
  if (tipo === "enviar_audio") return "Novo áudio";
  if (tipo === "enviar_arquivo") return "Novo arquivo";
  if (tipo === "avaliacao") return "Avaliação";
  if (tipo === "capturar_resposta") return "Capturar resposta";
  if (tipo === "agendar_disparo") return "Agendar disparo";
  if (tipo === TIPO_NO_CONSULTAR_ESTOQUE) return "Consultar estoque";
  if (tipo === TIPO_NO_CHECKOUT_PAGAMENTO) return "Checkout / pagamento";
  if (tipo === "agenda_buscar_agendamento") return "Buscar agendamento";
  if (tipo === "agenda_escolher_horario") return "Escolher horário";
  if (tipo === "agenda_criar_agendamento") return "Criar agendamento";
  if (tipo === "agenda_remarcar_agendamento") return "Remarcar agendamento";
  if (tipo === "agenda_cancelar_agendamento") return "Cancelar agendamento";
  if (tipo === "interpretar_arquivo_ia") return "Interpretar arquivo IA";
  return "Novo bloco";
}

export function tituloEhPadraoDoSistema(titulo: string, tipoNoAtual: string) {
  const tituloLimpo = String(titulo || "").trim();

  if (!tituloLimpo) return true;

  return (
    tituloLimpo === tituloPadraoTipoNo(tipoNoAtual) ||
    tituloLimpo === labelTipoNo(tipoNoAtual)
  );
}

export function cortarTextoCard(texto: string, limite = 34) {
  const textoLimpo = String(texto || "").replace(/\s+/g, " ").trim();

  if (!textoLimpo) return "";

  return textoLimpo.length > limite
    ? `${textoLimpo.slice(0, limite)}...`
    : textoLimpo;
}

export function tituloVisivelCard(data: any) {
  const tipoNo = String(data?.tipo_no || "");
  const titulo = String(data?.titulo || "").trim();
  const tituloPadrao = tituloPadraoTipoNo(tipoNo);
  const labelPadrao = labelTipoNo(tipoNo);

  const mensagensPadrao = [
    "Digite a mensagem aqui.",
    "Escolha uma opção:",
    "Como posso te ajudar?",
    "",
  ];

  const mensagem = String(data?.configuracao_json?.mensagem || "").trim();
  const mensagemEhPadrao = mensagensPadrao.includes(mensagem);

  const tituloEhPadrao =
    !titulo || titulo === tituloPadrao || titulo === labelPadrao;

  if (!tituloEhPadrao) {
    return titulo;
  }

  if (mensagem && !mensagemEhPadrao) {
    return cortarTextoCard(mensagem);
  }

  return tituloPadrao;
}

export function normalizarDelaySegundos(
  valor: string | number | null | undefined
) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return null;
  }

  return Math.max(0, Math.min(LIMITE_DELAY_SEGUNDOS, Math.floor(numero)));
}

export function opcoesRespostaDoNo(
  node?: Node | null
): OpcaoRespostaConexao[] {
  const tipoNo = String(node?.data?.tipo_no || "");
  const configuracao = (node?.data?.configuracao_json || {}) as {
    opcoes?: Array<Record<string, unknown>>;
    botoes?: Array<Record<string, unknown>>;
  };

  if (tipoNo === TIPO_NO_CONSULTAR_ESTOQUE) {
    return SAIDAS_CONSULTA_ESTOQUE.map((saida) => ({
      valor: saida.valor,
      titulo: saida.titulo,
    }));
  }

  if (tipoNo === TIPO_NO_CHECKOUT_PAGAMENTO) {
    return SAIDAS_CHECKOUT_PAGAMENTO.map((saida) => ({
      valor: saida.valor,
      titulo: saida.titulo,
    }));
  }

  if (tipoNo === "pergunta_opcoes") {
    return Array.isArray(configuracao.opcoes)
      ? configuracao.opcoes
          .map((opcao) => ({
            valor: String(opcao.valor || "").trim(),
            titulo: String(opcao.titulo || "").trim(),
          }))
          .filter((opcao) => Boolean(opcao.valor))
      : [];
  }

  if (tipoNo === "enviar_botoes") {
    return Array.isArray(configuracao.botoes)
      ? configuracao.botoes
          .map((botao) => ({
            valor: String(botao.id || "").trim(),
            titulo: String(botao.titulo || "").trim(),
          }))
          .filter((botao) => Boolean(botao.valor))
      : [];
  }

  return [];
}
