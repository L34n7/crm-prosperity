import type {
  AssistenteAutomacaoConexao,
  AssistenteAutomacaoNo,
  ValidacaoItemAssistente,
} from "./assistente-fluxos-base";
import {
  ehOpcaoNavegacaoFaq,
  marcarIntencaoFaqNoDestino,
  respostaFaqCompativel,
} from "./assistente-fluxos-faq-semantica";
import {
  conteudoNo,
  ehAbrirLocalizacao,
  ehEncerrar,
  ehEspecialista,
  ehFaq,
  ehMenuPrincipal,
  ehPergunta,
  intencaoFaq,
  normalizar,
  normalizarId,
  opcoesNo,
} from "./assistente-fluxos-reparador-semantica";

const TIPOS_TERMINAIS = new Set(["encerrar", "transferir_setor"]);

function saidasInterativas(
  noId: string,
  conexoes: AssistenteAutomacaoConexao[]
) {
  return conexoes.filter(
    (conexao) =>
      conexao.no_origem_id === noId &&
      conexao.condicao_json?.tipo !== "timeout_sem_resposta"
  );
}

function opcaoDaConexao(
  no: AssistenteAutomacaoNo,
  conexao: AssistenteAutomacaoConexao
) {
  const valor = normalizarId(
    conexao.condicao_json?.valor || conexao.rotulo || ""
  );
  return opcoesNo(no).find(
    (opcao) => opcao.id === valor || normalizarId(opcao.titulo) === valor
  );
}

function alcancaTipo(params: {
  inicio: string;
  tipos: Set<string>;
  porId: Map<string, AssistenteAutomacaoNo>;
  conexoes: AssistenteAutomacaoConexao[];
  limite?: number;
}) {
  const fila = [{ id: params.inicio, nivel: 0 }];
  const visitados = new Set<string>();

  while (fila.length > 0) {
    const atual = fila.shift();
    if (!atual || visitados.has(atual.id)) continue;
    visitados.add(atual.id);
    const no = params.porId.get(atual.id);
    if (no && params.tipos.has(no.tipo_no)) return true;
    if (atual.nivel >= (params.limite ?? 3)) continue;

    for (const conexao of params.conexoes) {
      if (conexao.no_origem_id !== atual.id) continue;
      fila.push({ id: conexao.no_destino_id, nivel: atual.nivel + 1 });
    }
  }

  return false;
}

/**
 * Mantem como erros apenas incoerencias tecnicas do grafo. Interpretacoes
 * semanticas de linguagem natural sao registradas como avisos, pois a IA e a
 * fonte de verdade para a intencao conversacional e o rascunho pode ser revisto
 * antes da ativacao.
 */
export function validarExperienciaConversacional(params: {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}) {
  const erros: ValidacaoItemAssistente[] = [];
  const avisos: ValidacaoItemAssistente[] = [];
  const porId = new Map(params.nos.map((no) => [no.id, no]));

  for (const no of params.nos) {
    const saidas = saidasInterativas(no.id, params.conexoes);

    if (TIPOS_TERMINAIS.has(no.tipo_no) && saidas.length > 0) {
      erros.push({
        codigo: "UX_TERMINAL_COM_SAIDA",
        mensagem: `O bloco terminal “${no.titulo}” não pode continuar o fluxo.`,
        no_id: no.id,
        conexao_id: saidas[0]?.id,
      });
    }

    const mensagem = String(no.configuracao_json?.mensagem || "").trim();
    if (mensagem.length > 1100) {
      avisos.push({
        codigo: "UX_MENSAGEM_EXTENSA",
        mensagem: `A mensagem “${no.titulo}” pode ficar cansativa no WhatsApp; considere dividi-la em telas menores.`,
        no_id: no.id,
      });
    }

    if (!ehPergunta(no)) continue;

    const destinos = new Map<string, AssistenteAutomacaoConexao[]>();
    for (const saida of saidas) {
      const lista = destinos.get(saida.no_destino_id) || [];
      lista.push(saida);
      destinos.set(saida.no_destino_id, lista);
    }
    for (const lista of destinos.values()) {
      if (lista.length <= 1) continue;
      erros.push({
        codigo: "UX_OPCOES_MESMO_DESTINO",
        mensagem: `Duas opções de “${no.titulo}” executam a mesma ação. Cada escolha precisa cumprir sua própria promessa.`,
        no_id: no.id,
        conexao_id: lista[1]?.id,
      });
    }

    for (const saida of saidas) {
      const opcao = opcaoDaConexao(no, saida);
      const destino = porId.get(saida.no_destino_id);
      if (!opcao || !destino) continue;
      const titulo = opcao.titulo;
      const tituloNormalizado = normalizar(titulo);

      if (/\b(voltar ao menu principal|menu principal)\b/.test(tituloNormalizado)) {
        if (!ehMenuPrincipal(destino)) {
          avisos.push({
            codigo: "UX_RETORNO_MENU_INCORRETO",
            mensagem: `A opção “${titulo}” de “${no.titulo}” não retorna ao Menu Principal.`,
            no_id: no.id,
            conexao_id: saida.id,
          });
        }
        continue;
      }

      if (ehAbrirLocalizacao(titulo) && destino.tipo_no !== "botao_redirect") {
        avisos.push({
          codigo: "UX_ACAO_LOCALIZACAO_INCORRETA",
          mensagem: `A opção “${titulo}” deveria abrir uma localização real.`,
          no_id: no.id,
          conexao_id: saida.id,
        });
        continue;
      }

      if (
        ehEspecialista(titulo) &&
        !alcancaTipo({
          inicio: destino.id,
          tipos: new Set(["transferir_setor"]),
          porId,
          conexoes: params.conexoes,
        })
      ) {
        avisos.push({
          codigo: "UX_TRANSFERENCIA_AUSENTE",
          mensagem: `A opção “${titulo}” parece oferecer atendimento humano, mas não termina em transferência.`,
          no_id: no.id,
          conexao_id: saida.id,
        });
        continue;
      }

      if (
        ehEncerrar(titulo) &&
        !alcancaTipo({
          inicio: destino.id,
          tipos: new Set(["encerrar"]),
          porId,
          conexoes: params.conexoes,
        })
      ) {
        avisos.push({
          codigo: "UX_ENCERRAMENTO_AUSENTE",
          mensagem: `A opção “${titulo}” parece indicar encerramento, mas não chega a um bloco de encerramento.`,
          no_id: no.id,
          conexao_id: saida.id,
        });
        continue;
      }

      const origemEhFaq = ehFaq(`${no.titulo} ${conteudoNo(no)}`);
      const intencaoPergunta = intencaoFaq(`${opcao.id} ${titulo}`);

      if (origemEhFaq && ehOpcaoNavegacaoFaq(opcao)) {
        continue;
      }

      if (origemEhFaq && intencaoPergunta) {
        marcarIntencaoFaqNoDestino(opcao, destino);

        if (!respostaFaqCompativel(opcao, destino)) {
          avisos.push({
            codigo: "UX_FAQ_RESPOSTA_INCOMPATIVEL",
            mensagem: `Revise se a resposta escolhida para “${titulo}” atende exatamente essa dúvida.`,
            no_id: no.id,
            conexao_id: saida.id,
          });
        }
      }
    }
  }

  return { erros, avisos };
}
