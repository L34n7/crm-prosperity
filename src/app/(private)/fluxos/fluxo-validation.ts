import type { Edge, Node } from "@xyflow/react";
import {
  RESULTADOS_ENCERRAMENTO,
  TIPOS_VALOR_CONVERSAO,
  TIPO_NO_PERGUNTA_LIVRE_IA,
} from "./constants";
import {
  normalizarEscopoIntegracoesFluxo,
  normalizarTemplatesPorIntegracao,
  obterIntegracoesDoEscopoFluxo,
  rotuloIntegracaoWhatsapp,
  templateCompativelComIntegracao,
  usaTemplatesPorIntegracao,
} from "./fluxo-integracoes";
import {
  contarVariaveisObrigatoriasPreenchidas,
  contarVariaveisTemplateWhatsapp,
  templateWhatsappTemCabecalhoMidia,
} from "./template-utils";
import type {
  EstrategiaTransferenciaNode,
  Fluxo,
  IntegracaoWhatsappOpcao,
  ResultadoEncerramentoFluxo,
  TemplateWhatsappOpcao,
  TipoValorConversao,
} from "./types";

type ValidarFluxoAntesDeAtivarParams = {
  fluxo: Fluxo | null;
  nodes: Node[];
  edges: Edge[];
  integracoesWhatsapp: IntegracaoWhatsappOpcao[];
  templatesWhatsapp: TemplateWhatsappOpcao[];
};

function resultadoEncerramentoValido(
  valor: unknown
): valor is ResultadoEncerramentoFluxo {
  return RESULTADOS_ENCERRAMENTO.includes(
    valor as ResultadoEncerramentoFluxo
  );
}

function tipoValorConversaoValido(
  valor: unknown
): valor is TipoValorConversao {
  return TIPOS_VALOR_CONVERSAO.includes(valor as TipoValorConversao);
}

function normalizarValorMonetario(valor: unknown) {
  const texto = String(valor ?? "").replace(/[R$\s]/g, "").trim();

  if (!texto) return null;

  const normalizado = texto.includes(",")
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto;

  const numero = Number(normalizado);

  if (!Number.isFinite(numero) || numero < 0) return null;

  return Math.round(numero * 100) / 100;
}

function normalizarVariavelFluxo(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function urlHttpValida(valor: unknown) {
  const texto = String(valor || "").trim();

  if (!texto) return false;

  try {
    const url = new URL(texto);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function configuracaoMarcada(valor: unknown) {
  return valor === true || valor === "true" || valor === 1 || valor === "1";
}

function normalizarEstrategiaTransferenciaNode(
  valor: unknown,
  atendenteId?: unknown
): EstrategiaTransferenciaNode {
  const estrategia = String(valor || "").trim();

  if (
    estrategia === "fila_setor" ||
    estrategia === "atendente_especifico" ||
    estrategia === "rodizio_aleatorio" ||
    estrategia === "menos_conversas"
  ) {
    return estrategia;
  }

  return String(atendenteId || "").trim()
    ? "atendente_especifico"
    : "fila_setor";
}

export function validarFluxoAntesDeAtivar({
  fluxo,
  nodes,
  edges,
  integracoesWhatsapp,
  templatesWhatsapp,
}: ValidarFluxoAntesDeAtivarParams) {
  const escopoIntegracoesValidacao = normalizarEscopoIntegracoesFluxo(
    fluxo?.configuracao_json
  );
  const integracoesEscopoValidacao = obterIntegracoesDoEscopoFluxo(
    escopoIntegracoesValidacao,
    integracoesWhatsapp
  );
  const usaTemplatesPorIntegracaoValidacao = usaTemplatesPorIntegracao(
    integracoesEscopoValidacao
  );

  if (!fluxo) return "Selecione um fluxo.";

  const inicio = nodes.find((node) => node.data?.tipo_no === "inicio");
  if (!inicio) {
    return "Adicione um bloco de início antes de ativar o fluxo.";
  }

  if (!edges.some((edge) => edge.source === inicio.id)) {
    return "O bloco de início precisa estar conectado a outro bloco.";
  }

  const temBlocoFinal = nodes.some(
    (node) =>
      node.data?.tipo_no === "encerrar" ||
      node.data?.tipo_no === "transferir_setor"
  );

  if (!temBlocoFinal) {
    return "Adicione pelo menos um bloco final: Encerrar ou Transferir.";
  }

  for (const node of nodes) {
    const tipoNo = String(node.data?.tipo_no || "");
    const config = (node.data?.configuracao_json || {}) as Record<string, any>;
    const titulo = String(node.data?.titulo || "");

    if (tipoNo === "enviar_texto" && !String(config.mensagem || "").trim()) {
      return `O bloco "${titulo}" precisa ter uma mensagem.`;
    }

    if (tipoNo === "encerrar") {
      const resultadoFluxo = String(config.resultado_fluxo || "positivo");
      const tipoValorConversao = String(
        config.valor_conversao_tipo || "sem_valor"
      );

      if (!resultadoEncerramentoValido(resultadoFluxo)) {
        return `O bloco "${titulo}" precisa ter um resultado valido.`;
      }

      if (resultadoFluxo === "positivo") {
        if (!tipoValorConversaoValido(tipoValorConversao)) {
          return `O bloco "${titulo}" precisa ter um tipo de valor valido.`;
        }

        if (
          tipoValorConversao === "valor_fixo" &&
          normalizarValorMonetario(config.valor_conversao) == null
        ) {
          return `O bloco "${titulo}" precisa ter um valor fixo valido.`;
        }

        if (
          tipoValorConversao === "variavel" &&
          !normalizarVariavelFluxo(
            String(config.valor_conversao_variavel || "")
          )
        ) {
          return `O bloco "${titulo}" precisa informar a variavel do valor.`;
        }
      }
    }

    if (tipoNo === "pergunta_opcoes") {
      if (!String(config.mensagem || "").trim()) {
        return `O bloco "${titulo}" precisa ter uma pergunta.`;
      }

      if (!Array.isArray(config.opcoes) || config.opcoes.length === 0) {
        return `O bloco "${titulo}" precisa ter pelo menos uma opção.`;
      }
    }

    if (tipoNo === TIPO_NO_PERGUNTA_LIVRE_IA) {
      if (!String(config.mensagem || "").trim()) {
        return `O bloco "${titulo}" precisa ter uma pergunta.`;
      }

      const conexoesIa = edges.filter((edge) => {
        const data = edge.data as
          | { usar_ia?: boolean; descricao_ia?: string | null }
          | undefined;
        return edge.source === node.id && data?.usar_ia === true;
      });

      if (conexoesIa.length === 0) {
        return `O bloco "${titulo}" precisa ter pelo menos uma conexão com IA.`;
      }

      if (
        conexoesIa.some((edge) => {
          const data = edge.data as
            | { descricao_ia?: string | null }
            | undefined;
          return !String(data?.descricao_ia || "").trim();
        })
      ) {
        return `Todas as conexões com IA do bloco "${titulo}" precisam ter descrição para IA.`;
      }
    }

    if (tipoNo === "enviar_botoes") {
      if (!String(config.mensagem || "").trim()) {
        return `O bloco "${titulo}" precisa ter uma mensagem.`;
      }
      if (!Array.isArray(config.botoes) || config.botoes.length === 0) {
        return `O bloco "${titulo}" precisa ter pelo menos um botão.`;
      }
      if (config.botoes.length > 3) {
        return `O bloco "${titulo}" pode ter no máximo 3 botões.`;
      }

      const idsBotoes = new Set<string>();
      for (const botao of config.botoes as any[]) {
        const id = String(botao.id || "").trim();
        const tituloBotao = String(botao.titulo || "").trim();

        if (!id) return `O bloco "${titulo}" possui um botão sem ID.`;
        if (idsBotoes.has(id)) {
          return `O bloco "${titulo}" possui o ID de botão duplicado "${id}".`;
        }
        if (!tituloBotao) {
          return `O bloco "${titulo}" possui um botão sem título.`;
        }
        if (tituloBotao.length > 20) {
          return `O botão "${tituloBotao}" do bloco "${titulo}" possui ${tituloBotao.length} caracteres. O limite é 20.`;
        }

        idsBotoes.add(id);
      }
    }

    if (tipoNo === "botao_redirect") {
      if (!String(config.mensagem || "").trim()) {
        return `O bloco "${titulo}" precisa ter uma mensagem.`;
      }

      const textoBotao = String(config.botao_texto || "").trim();
      if (!textoBotao || textoBotao.length > 20) {
        return `O bloco "${titulo}" precisa ter texto do botão com até 20 caracteres.`;
      }
      if (!urlHttpValida(config.url)) {
        return `O bloco "${titulo}" precisa ter uma URL começando com http:// ou https://.`;
      }
    }

    if (
      tipoNo === "avaliacao" &&
      config.solicitar_comentario === true &&
      !String(config.mensagem_comentario || "").trim()
    ) {
      return `O bloco "${titulo}" precisa ter uma mensagem para solicitar comentário.`;
    }

    if (tipoNo === "avaliacao") {
      const notaMinima = Number(config.nota_minima);
      const notaMaxima = Number(config.nota_maxima);
      if (notaMinima >= notaMaxima) {
        return `O bloco "${titulo}" precisa ter uma nota máxima maior que a mínima.`;
      }
    }

    if (tipoNo === "capturar_resposta") {
      if (!String(config.mensagem || "").trim()) {
        return `O bloco "${titulo}" precisa ter uma pergunta.`;
      }
      if (!String(config.variavel || "").trim()) {
        return `O bloco "${titulo}" precisa informar a variável onde a resposta será salva.`;
      }
      if (!String(config.tipo_captura || "").trim()) {
        return `O bloco "${titulo}" precisa ter um tipo de captura.`;
      }
    }

    if (tipoNo === "agendar_disparo") {
      const templatesPorIntegracao = normalizarTemplatesPorIntegracao(
        config.templates_por_integracao
      );
      const templatesParaValidar = usaTemplatesPorIntegracaoValidacao
        ? integracoesEscopoValidacao.map((integracao) => {
            const templateId = String(
              templatesPorIntegracao[integracao.id] || ""
            ).trim();
            return {
              integracao,
              templateId,
              template: templatesWhatsapp.find(
                (template) => template.id === templateId
              ),
            };
          })
        : [
            {
              integracao: null,
              templateId: String(config.template_id || "").trim(),
              template: templatesWhatsapp.find(
                (template) =>
                  template.id === String(config.template_id || "").trim()
              ),
            },
          ];

      for (const item of templatesParaValidar) {
        const rotuloIntegracao = item.integracao
          ? ` para ${rotuloIntegracaoWhatsapp(item.integracao)}`
          : "";

        if (!item.templateId || !item.template) {
          return `O bloco "${titulo}" precisa ter um template WhatsApp aprovado${rotuloIntegracao}.`;
        }

        if (
          item.integracao &&
          !templateCompativelComIntegracao(item.template, item.integracao)
        ) {
          return `O bloco "${titulo}" usa um template de outra WABA${rotuloIntegracao}.`;
        }

        if (
          !usaTemplatesPorIntegracaoValidacao &&
          integracoesEscopoValidacao.length > 0 &&
          !integracoesEscopoValidacao.some((integracao) =>
            templateCompativelComIntegracao(item.template, integracao)
          )
        ) {
          return `O bloco "${titulo}" usa um template fora do escopo do fluxo.`;
        }

        if (templateWhatsappTemCabecalhoMidia(item.template)) {
          return `O bloco "${titulo}" usa um template com cabecalho de midia. Use um template apenas com texto para disparos agendados.`;
        }

        const totalVariaveisTemplate =
          contarVariaveisTemplateWhatsapp(item.template);
        const totalVariaveisConfiguradas =
          contarVariaveisObrigatoriasPreenchidas(
            Array.isArray(config.variaveis) ? config.variaveis : [],
            totalVariaveisTemplate
          );

        if (totalVariaveisTemplate > 3) {
          return `O bloco "${titulo}" usa um template com mais de 3 variaveis.`;
        }
        if (totalVariaveisConfiguradas < totalVariaveisTemplate) {
          return `O bloco "${titulo}" precisa informar ${totalVariaveisTemplate} variavel(is) do template WhatsApp.`;
        }
      }

      const quantidade = Number(config.tempo_quantidade || 0);
      if (!Number.isFinite(quantidade) || quantidade <= 0) {
        return `O bloco "${titulo}" precisa ter um tempo válido para agendar o disparo.`;
      }
      if (!["horas", "dias"].includes(String(config.tempo_unidade || ""))) {
        return `O bloco "${titulo}" precisa ter uma unidade válida.`;
      }
    }

    if (
      tipoNo === "agenda_escolher_horario" &&
      !String(config.agenda_id || "").trim() &&
      config.usar_agenda_contexto !== true &&
      config.usar_agenda_contexto !== "true"
    ) {
      return `O bloco "${titulo}" precisa ter um calendário.`;
    }

    if (
      tipoNo === "agenda_escolher_horario" &&
      !String(config.mensagem || "").trim()
    ) {
      return `O bloco "${titulo}" precisa ter uma mensagem para pedir o dia.`;
    }

    if (tipoNo === "agenda_criar_agendamento") {
      const lembreteAtivo = configuracaoMarcada(
        config.lembrete_agendamento_ativo
      );
      const lembreteWhatsapp = configuracaoMarcada(
        config.lembrete_agendamento_whatsapp
      );
      const lembreteEmail = configuracaoMarcada(
        config.lembrete_agendamento_email
      );

      if (lembreteAtivo) {
        const quantidade = Number(
          config.lembrete_agendamento_quantidade || 0
        );
        const templateLembreteId = String(
          config.lembrete_agendamento_template_id || ""
        ).trim();
        const templateLembreteSelecionado = templatesWhatsapp.find(
          (template) => template.id === templateLembreteId
        );

        if (!Number.isFinite(quantidade) || quantidade <= 0) {
          return `O bloco "${titulo}" precisa ter uma antecedencia valida para o lembrete.`;
        }
        if (
          !["minutos", "horas", "dias"].includes(
            String(config.lembrete_agendamento_unidade || "")
          )
        ) {
          return `O bloco "${titulo}" precisa ter uma unidade valida para o lembrete.`;
        }
        if (!lembreteWhatsapp && !lembreteEmail) {
          return `O bloco "${titulo}" precisa ter pelo menos um canal de lembrete.`;
        }
        if (
          lembreteWhatsapp &&
          (!templateLembreteId || !templateLembreteSelecionado)
        ) {
          return "Selecione um template WhatsApp para o lembrete.";
        }

        if (lembreteWhatsapp && templateLembreteSelecionado) {
          if (
            templateWhatsappTemCabecalhoMidia(
              templateLembreteSelecionado
            )
          ) {
            return `O bloco "${titulo}" usa um template de lembrete com cabecalho de midia. Use um template apenas com texto.`;
          }

          const totalVariaveisTemplate =
            contarVariaveisTemplateWhatsapp(templateLembreteSelecionado);
          const totalVariaveisConfiguradas =
            contarVariaveisObrigatoriasPreenchidas(
              Array.isArray(config.lembrete_agendamento_variaveis)
                ? config.lembrete_agendamento_variaveis
                : [],
              totalVariaveisTemplate
            );

          if (totalVariaveisTemplate > 3) {
            return `O bloco "${titulo}" usa um template de lembrete com mais de 3 variaveis.`;
          }
          if (totalVariaveisConfiguradas < totalVariaveisTemplate) {
            return `O bloco "${titulo}" precisa informar ${totalVariaveisTemplate} variavel(is) do template de lembrete.`;
          }
        }
      }
    }

    if (tipoNo === "interpretar_arquivo_ia") {
      if (!String(config.mensagem || "").trim()) {
        return `O bloco "${titulo}" precisa ter uma mensagem solicitando o arquivo.`;
      }
      if (!String(config.instrucao_ia || "").trim()) {
        return `O bloco "${titulo}" precisa ter uma instrução para IA.`;
      }
    }

    if (
      tipoNo === "transferir_setor" &&
      String(config.escopo_fila || "setor").trim() !== "geral" &&
      !String(config.setor_id || "").trim()
    ) {
      return `O bloco "${titulo}" precisa ter um setor destino.`;
    }

    if (
      tipoNo === "transferir_setor" &&
      normalizarEstrategiaTransferenciaNode(
        config.estrategia_transferencia,
        config.atendente_id
      ) === "atendente_especifico" &&
      !String(config.atendente_id || "").trim()
    ) {
      return `O bloco "${titulo}" precisa ter um atendente destino.`;
    }

    const usaTransferenciaPorTentativas = [
      "pergunta_opcoes",
      TIPO_NO_PERGUNTA_LIVRE_IA,
      "enviar_botoes",
      "capturar_resposta",
      "agenda_buscar_agendamento",
      "agenda_escolher_horario",
      "avaliacao",
      "interpretar_arquivo_ia",
    ].includes(tipoNo);

    if (
      usaTransferenciaPorTentativas &&
      String(
        config.acao_excesso_tentativas || "transferir_atendimento"
      ) === "transferir_atendimento" &&
      String(
        config.escopo_fila_excesso_tentativas || "setor"
      ).trim() !== "geral" &&
      !String(config.setor_excesso_tentativas || "").trim()
    ) {
      return `O bloco "${titulo}" precisa ter um setor para transferência por excesso de tentativas ou timeout.`;
    }

    if (
      usaTransferenciaPorTentativas &&
      String(
        config.acao_excesso_tentativas || "transferir_atendimento"
      ) === "transferir_atendimento" &&
      normalizarEstrategiaTransferenciaNode(
        config.estrategia_excesso_tentativas,
        config.atendente_excesso_tentativas
      ) === "atendente_especifico" &&
      !String(config.atendente_excesso_tentativas || "").trim()
    ) {
      return `O bloco "${titulo}" precisa ter um atendente para transferência por excesso de tentativas ou timeout.`;
    }

    if (
      (
        tipoNo === "enviar_imagem" ||
        tipoNo === "enviar_video" ||
        tipoNo === "enviar_audio" ||
        tipoNo === "enviar_arquivo"
      ) &&
      !String(config.midia_url || "").trim()
    ) {
      return `O bloco "${titulo}" precisa ter uma mídia selecionada.`;
    }
  }

  return "";
}
