"use client";

import { useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { Check, Pencil, Sparkles, X } from "lucide-react";
import styles from "./fluxos.module.css";

type AssistenteAutomacaoNo = {
  id: string;
  tipo_no: string;
  titulo: string;
  descricao: string | null;
  posicao_x: number;
  posicao_y: number;
  configuracao_json: Record<string, unknown>;
  delay_segundos: number | null;
};

type AssistenteAutomacaoConexao = {
  id: string;
  no_origem_id: string;
  no_destino_id: string;
  rotulo: string | null;
  ordem: number;
  condicao_json: Record<string, unknown>;
  usar_ia?: boolean;
  descricao_ia?: string | null;
};

type ModoAssistenteFluxos =
  | "criar_fluxo"
  | "adicionar_etapa"
  | "melhorar_mensagens"
  | "analisar_fluxo";

type ValidacaoItem = {
  codigo: string;
  mensagem: string;
  no_id?: string;
  conexao_id?: string;
};

type RespostaAssistente = {
  proposta_id?: string;
  sessao_id?: string;
  fase?: "coletando" | "pronto" | "concluido";
  mensagem?: string;
  pergunta?: {
    id: string;
    etapa_ref: string;
    campo: "clarificacao" | "setor_id" | "midia_id" | "url";
    tipo: "selecao" | "texto";
    mensagem: string;
    ajuda: string | null;
    obrigatoria: boolean;
    bloqueada: boolean;
    valor_sugerido: string | null;
    opcoes: Array<{
      id: string;
      label: string;
      descricao: string | null;
    }>;
  } | null;
  progresso?: {
    respondidas: number;
    total: number;
  };
  historico?: Array<{
    pergunta: string;
    resposta: string;
  }>;
  modo: ModoAssistenteFluxos;
  resumo: string;
  materializado?: boolean;
  fluxo_criado?: AssistenteFluxosFluxoCriado | null;
  fluxo_gerado?: {
    nos: AssistenteAutomacaoNo[];
    conexoes: AssistenteAutomacaoConexao[];
  };
  estatisticas?: {
    blocos: number;
    conexoes: number;
    variaveis_sugeridas: number;
    blocos_criados: number;
    mensagens_revisadas: number;
  };
  validacao?: {
    valido: boolean;
    erros: ValidacaoItem[];
    avisos: ValidacaoItem[];
  };
  plano?: {
    etapas?: Array<{
      ref: string;
      tipo: string;
      titulo?: string | null;
      mensagem?: string | null;
    }>;
    mensagens_revisadas?: Array<{
      ref: string;
      mensagem: string;
      motivo?: string | null;
    }>;
    variaveis_sugeridas?: Array<{
      chave: string;
      descricao?: string | null;
    }>;
  };
  avisos?: string[];
};

type FluxoResumo = {
  id: string;
  nome: string;
  status: string;
} | null;

type PreviaTokensAssistente = {
  titulo: string;
  descricao: string;
  tokensEstimados: number;
  tokensMin: number;
  tokensMax: number;
  detalhes: Array<{
    id: string;
    nome: string;
    tokensEstimados: number;
  }>;
};

type RespostaApiAssistente = Partial<RespostaAssistente> & {
  ok?: boolean;
  error?: string;
};

async function lerRespostaAssistente(
  response: Response,
  mensagemPadrao: string
): Promise<RespostaApiAssistente> {
  const corpo = await response.text();

  if (corpo.trim()) {
    try {
      return JSON.parse(corpo) as RespostaApiAssistente;
    } catch {
      // Timeouts da Vercel podem chegar como texto puro (por exemplo,
      // "An error occurred..."). Nao exponha o erro de JSON ao usuario.
    }
  }

  return {
    ok: false,
    error:
      response.status >= 500 || response.status === 0
        ? "A geração demorou mais que o limite do servidor. Tente novamente; nenhum fluxo incompleto foi criado."
        : mensagemPadrao,
  };
}

export type AssistenteFluxosFluxoCriado = {
  id: string;
  nome: string;
  descricao: string | null;
  status: "rascunho" | "ativo" | "pausado" | "arquivado";
  canal: string;
  fluxo_padrao?: boolean;
  created_at?: string;
  updated_at?: string;
  configuracao_json?: Record<string, unknown> | null;
};

type AssistenteFluxosPanelProps = {
  fluxoSelecionado: FluxoResumo;
  nodes: Node[];
  edges: Edge[];
  onFechar: () => void;
  onFluxoCriado: (fluxo: AssistenteFluxosFluxoCriado) => void;
};

const MODOS: Array<{
  id: ModoAssistenteFluxos;
  label: string;
  descricao: string;
}> = [
  {
    id: "criar_fluxo",
    label: "Criar fluxo completo",
    descricao: "Monta o fluxo, confirma detalhes e salva somente no final.",
  },
  {
    id: "adicionar_etapa",
    label: "Adicionar etapa",
    descricao: "Clona o fluxo atual, adiciona etapas e salva a copia.",
  },
  {
    id: "melhorar_mensagens",
    label: "Melhorar mensagens",
    descricao: "Clona o fluxo atual, reescreve mensagens e salva a copia.",
  },
  {
    id: "analisar_fluxo",
    label: "Encontrar problemas",
    descricao: "Lista erros, avisos e oportunidades de melhoria.",
  },
];

const TOKENS_PROMPT_FIXO_ASSISTENTE_ESTIMADOS = 1800;
const TOKENS_SAIDA_MAX_ASSISTENTE = 4200;
const CHAVE_SESSAO_ASSISTENTE_FLUXOS = "prosperity:assistente-fluxos:sessao";

function nodeParaNo(node: Node): AssistenteAutomacaoNo {
  const data = (node.data || {}) as Record<string, unknown>;

  return {
    id: node.id,
    tipo_no: String(data.tipo_no || ""),
    titulo: String(data.titulo || "Bloco"),
    descricao: data.descricao ? String(data.descricao) : null,
    posicao_x: Math.round(Number(node.position?.x || 0)),
    posicao_y: Math.round(Number(node.position?.y || 0)),
    configuracao_json:
      data.configuracao_json &&
      typeof data.configuracao_json === "object" &&
      !Array.isArray(data.configuracao_json)
        ? (data.configuracao_json as Record<string, unknown>)
        : {},
    delay_segundos:
      data.delay_segundos === null || data.delay_segundos === undefined
        ? null
        : Number(data.delay_segundos),
  };
}

function edgeParaConexao(edge: Edge, index: number): AssistenteAutomacaoConexao {
  const data = (edge.data || {}) as Record<string, unknown>;
  const label = typeof edge.label === "string" ? edge.label : "";
  const rotulo = String(data.rotulo || label || "");

  return {
    id: edge.id,
    no_origem_id: edge.source,
    no_destino_id: edge.target,
    rotulo: rotulo || null,
    ordem: index + 1,
    condicao_json:
      data.condicao_json &&
      typeof data.condicao_json === "object" &&
      !Array.isArray(data.condicao_json)
        ? (data.condicao_json as Record<string, unknown>)
        : {},
    usar_ia: data.usar_ia === true,
    descricao_ia: data.descricao_ia ? String(data.descricao_ia) : null,
  };
}

function placeholderPorModo(modo: ModoAssistenteFluxos) {
  if (modo === "adicionar_etapa") {
    return "Ex.: Depois da pergunta sobre procedimento, pergunte o melhor horário e salve em horario_preferido.";
  }

  if (modo === "melhorar_mensagens") {
    return "Ex.: Deixe as mensagens mais curtas, profissionais e amigaveis.";
  }

  if (modo === "analisar_fluxo") {
    return "Opcional: destaque problemas de conversao, caminhos incompletos e excesso de etapas.";
  }

  return "Ex.: Crie um fluxo para uma clinica de estetica que descubra o procedimento desejado, capture nome e telefone, colete horário preferido e transfira para uma consultora.";
}

function tituloBotaoGerar(modo: ModoAssistenteFluxos) {
  if (modo === "analisar_fluxo") return "Analisar fluxo";
  if (modo === "criar_fluxo") return "Iniciar assistente de criacao";
  return "Otimizar com IA";
}

function tituloPreviaTokens(modo: ModoAssistenteFluxos) {
  if (modo === "criar_fluxo") return "Criar fluxo IA";
  if (modo === "adicionar_etapa") return "Criar cópia com nova etapa";
  if (modo === "melhorar_mensagens") return "Criar cópia com mensagens melhores";
  return "Analisar fluxo com IA";
}

function descricaoPreviaTokens(modo: ModoAssistenteFluxos) {
  if (modo === "criar_fluxo") {
    return "A IA vai preparar o rascunho. Detalhes técnicos são confirmados sem IA; ambiguidades relevantes podem exigir uma revisão adicional do plano.";
  }

  if (modo === "adicionar_etapa") {
    return "A IA vai analisar o fluxo atual, gerar os novos blocos/conexões e salvar uma cópia rascunho.";
  }

  if (modo === "melhorar_mensagens") {
    return "A IA vai revisar os textos do fluxo atual e salvar uma cópia rascunho com as mensagens ajustadas.";
  }

  return "A IA vai analisar a estrutura atual e apontar erros, avisos e oportunidades de melhoria.";
}

function formatarTokens(valor: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.round(valor)));
}

function estimarTokensAssistente(payload: unknown) {
  const tokensEntrada = Math.ceil(JSON.stringify(payload).length / 3.5);
  const base =
    TOKENS_PROMPT_FIXO_ASSISTENTE_ESTIMADOS +
    tokensEntrada +
    TOKENS_SAIDA_MAX_ASSISTENTE;

  return Math.ceil(base * 1.2);
}

export default function AssistenteFluxosPanel({
  fluxoSelecionado,
  nodes,
  edges,
  onFechar,
  onFluxoCriado,
}: AssistenteFluxosPanelProps) {
  const [modo, setModo] = useState<ModoAssistenteFluxos>("criar_fluxo");
  const [instrucao, setInstrucao] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [resposta, setResposta] = useState<RespostaAssistente | null>(null);
  const [respostaPergunta, setRespostaPergunta] = useState("");
  const [previaTokens, setPreviaTokens] =
    useState<PreviaTokensAssistente | null>(null);

  const fluxoAtual = useMemo(
    () => ({
      nos: nodes.map(nodeParaNo),
      conexoes: edges.map(edgeParaConexao),
    }),
    [nodes, edges]
  );

  const precisaFluxoAtual = modo !== "criar_fluxo";

  function montarPayloadAssistente() {
    return {
      acao: modo === "criar_fluxo" ? "preparar" : "gerar",
      modo,
      instrucao,
      fluxo_id: precisaFluxoAtual ? fluxoSelecionado?.id || null : null,
      fluxo_atual: precisaFluxoAtual ? fluxoAtual : null,
    };
  }

  function abrirPreviaTokens() {
    if (precisaFluxoAtual && !fluxoSelecionado) {
      setErro("Selecione um fluxo para clonar, melhorar ou análisar.");
      return;
    }

    if (
      modo !== "analisar_fluxo" &&
      modo !== "melhorar_mensagens" &&
      !instrucao.trim()
    ) {
      setErro("Descreva o que a IA deve criar ou alterar.");
      return;
    }

    const payload = montarPayloadAssistente();
    const tokensEstimados = estimarTokensAssistente(payload);
    const detalhes = [
      {
        id: "contexto",
        nome: precisaFluxoAtual
          ? `${fluxoAtual.nos.length} blocos e ${fluxoAtual.conexoes.length} conexões no contexto`
          : "Criação a partir do pedido informado",
        tokensEstimados,
      },
    ];

    setErro("");
    setResposta(null);
    setPreviaTokens({
      titulo: tituloPreviaTokens(modo),
      descricao: descricaoPreviaTokens(modo),
      tokensEstimados,
      tokensMin: Math.ceil(tokensEstimados * 0.85),
      tokensMax: Math.ceil(tokensEstimados * 1.15),
      detalhes,
    });
  }

  function cancelarPreviaTokens() {
    if (gerando) return;

    setPreviaTokens(null);
  }

  async function confirmarPreviaTokens() {
    if (!previaTokens) return;

    await gerarSugestao();
  }

  async function gerarSugestao() {
    try {
      setGerando(true);
      setErro("");
      setResposta(null);
      setPreviaTokens(null);

      const res = await fetch("/api/automacoes/assistente/gerar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(montarPayloadAssistente()),
      });

      const json = await lerRespostaAssistente(
        res,
        "Erro ao gerar sugestão."
      );

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao gerar sugestão.");
      }

      const respostaAssistente = json as RespostaAssistente;
      setResposta(respostaAssistente);
      setRespostaPergunta(respostaAssistente.pergunta?.valor_sugerido || "");

      if (respostaAssistente.sessao_id) {
        window.localStorage.setItem(
          CHAVE_SESSAO_ASSISTENTE_FLUXOS,
          respostaAssistente.sessao_id
        );
      }

      if (respostaAssistente.fluxo_criado) {
        onFluxoCriado(respostaAssistente.fluxo_criado);
      }
    } catch (error: unknown) {
      setErro(
        error instanceof Error ? error.message : "Erro ao gerar sugestão."
      );
    } finally {
      setGerando(false);
    }
  }

  async function enviarAcaoConversa(
    acao: "responder" | "atualizar" | "criar",
    payload: Record<string, unknown> = {}
  ) {
    if (!resposta?.sessao_id) return;

    try {
      setGerando(true);
      setErro("");

      const res = await fetch("/api/automacoes/assistente/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: "criar_fluxo",
          acao,
          sessao_id: resposta.sessao_id,
          ...payload,
        }),
      });
      const json = await lerRespostaAssistente(
        res,
        "Erro ao continuar o assistente."
      );

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao continuar o assistente.");
      }

      const atualizada = json as RespostaAssistente;
      setResposta(atualizada);
      setRespostaPergunta(atualizada.pergunta?.valor_sugerido || "");

      if (atualizada.fase === "concluido") {
        window.localStorage.removeItem(CHAVE_SESSAO_ASSISTENTE_FLUXOS);
      }

      if (atualizada.fluxo_criado) {
        onFluxoCriado(atualizada.fluxo_criado);
      }
    } catch (error: unknown) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao continuar o assistente."
      );
    } finally {
      setGerando(false);
    }
  }

  async function responderPerguntaAssistente() {
    if (!resposta?.pergunta) return;

    await enviarAcaoConversa("responder", {
      pergunta_id: resposta.pergunta.id,
      resposta: respostaPergunta,
    });
  }

  function reiniciarConversa() {
    window.localStorage.removeItem(CHAVE_SESSAO_ASSISTENTE_FLUXOS);
    setResposta(null);
    setRespostaPergunta("");
    setErro("");
  }

  useEffect(() => {
    const sessaoId = window.localStorage.getItem(
      CHAVE_SESSAO_ASSISTENTE_FLUXOS
    );

    if (!sessaoId) return;

    let cancelado = false;

    async function retomarSessao() {
      try {
        setGerando(true);
        const res = await fetch("/api/automacoes/assistente/gerar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modo: "criar_fluxo",
            acao: "retomar",
            sessao_id: sessaoId,
          }),
        });
        const json = await lerRespostaAssistente(
          res,
          "Sessão indisponível."
        );

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Sessao indisponivel.");
        }

        if (cancelado) return;

        const retomada = json as RespostaAssistente;
        setModo("criar_fluxo");
        setResposta(retomada);
        setRespostaPergunta(retomada.pergunta?.valor_sugerido || "");
      } catch {
        window.localStorage.removeItem(CHAVE_SESSAO_ASSISTENTE_FLUXOS);
      } finally {
        if (!cancelado) setGerando(false);
      }
    }

    void retomarSessao();

    return () => {
      cancelado = true;
    };
  }, []);

  const conversaAtiva =
    modo === "criar_fluxo" &&
    Boolean(resposta?.sessao_id) &&
    resposta?.fase !== "concluido";

  return (
    <aside className={styles.assistantPanel}>
      <div className={styles.assistantHeader}>
        <div>
          <p className={styles.eyebrow}>Assistente de fluxos</p>
          <h3 className={styles.assistantTitle}>Criar com IA</h3>
        </div>

        <button
          type="button"
          className={styles.closePanelButton}
          onClick={onFechar}
          title="Fechar"
          aria-label="Fechar assistente"
        >
          <X size={18} />
        </button>
      </div>

      <div className={styles.assistantBody}>
        {precisaFluxoAtual && !fluxoSelecionado && (
          <div className={styles.errorAlert}>
            Selecione um fluxo para clonar, melhorar ou analisar.
          </div>
        )}

        {!conversaAtiva && (
          <div className={styles.assistantModeGrid}>
            {MODOS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  modo === item.id
                    ? styles.assistantModeActive
                    : styles.assistantModeButton
                }
                onClick={() => {
                  setModo(item.id);
                  setResposta(null);
                  setRespostaPergunta("");
                  setErro("");
                }}
              >
                <strong>{item.label}</strong>
                <span>{item.descricao}</span>
              </button>
            ))}
          </div>
        )}

        <div className={styles.assistantManualNotice}>
          <Pencil size={15} aria-hidden="true" />
          <p>
            As informações geradas pela IA são sugestões. Depois da criação,
            você poderá alterar manualmente qualquer texto, bloco, conexão,
            setor, mídia ou link no editor do fluxo.
          </p>
        </div>

        {!conversaAtiva && (
          <label className={styles.field}>
            <span className={styles.label}>Pedido para a IA</span>
            <textarea
              className={styles.textarea}
              rows={6}
              value={instrucao}
              onChange={(event) => setInstrucao(event.target.value)}
              placeholder={placeholderPorModo(modo)}
            />
          </label>
        )}

        {erro && <div className={styles.errorAlert}>{erro}</div>}

        {!conversaAtiva && (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={abrirPreviaTokens}
            disabled={(precisaFluxoAtual && !fluxoSelecionado) || gerando}
          >
            <Sparkles size={16} />
            {gerando ? "Gerando..." : tituloBotaoGerar(modo)}
          </button>
        )}

        {conversaAtiva && resposta && (
          <div className={styles.assistantConversation}>
            {(resposta.historico || []).slice(-8).map((item, index) => (
              <div
                key={`${item.pergunta}-${index}`}
                className={styles.assistantHistoryTurn}
              >
                <div className={styles.assistantChatBubble}>
                  <strong>Assistente</strong>
                  <p>{item.pergunta}</p>
                </div>
                <div className={styles.assistantUserBubble}>
                  <strong>Você</strong>
                  <p>{item.resposta}</p>
                </div>
              </div>
            ))}

            <div className={styles.assistantChatBubble}>
              <strong>Assistente</strong>
              <p>{resposta.mensagem}</p>
            </div>

            {(resposta.progresso?.total || 0) > 0 && (
              <div className={styles.assistantProgress}>
                <span>
                  Detalhes confirmados: {resposta.progresso?.respondidas || 0} de{" "}
                  {resposta.progresso?.total || 0}
                </span>
                <div>
                  <i
                    style={{
                      width: `${Math.round(
                        ((resposta.progresso?.respondidas || 0) /
                          Math.max(1, resposta.progresso?.total || 1)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {resposta.pergunta && (
              <div className={styles.assistantQuestionCard}>
                <strong>{resposta.pergunta.mensagem}</strong>
                {resposta.pergunta.ajuda && <p>{resposta.pergunta.ajuda}</p>}

                {resposta.pergunta.tipo === "selecao" && (
                  <div className={styles.assistantAnswerOptions}>
                    {resposta.pergunta.opcoes.map((opcao) => (
                      <button
                        key={opcao.id}
                        type="button"
                        className={
                          respostaPergunta === opcao.id
                            ? styles.assistantAnswerOptionActive
                            : styles.assistantAnswerOption
                        }
                        onClick={() => setRespostaPergunta(opcao.id)}
                        disabled={gerando}
                      >
                        <span>{opcao.label}</span>
                        {opcao.descricao && <small>{opcao.descricao}</small>}
                      </button>
                    ))}
                  </div>
                )}

                {resposta.pergunta.tipo === "texto" && (
                  <input
                    className={styles.input}
                    value={respostaPergunta}
                    onChange={(event) => setRespostaPergunta(event.target.value)}
                    placeholder={
                      resposta.pergunta.campo === "url"
                        ? "https://exemplo.com.br"
                        : "Digite sua resposta"
                    }
                    disabled={gerando}
                  />
                )}

                {resposta.pergunta.bloqueada ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => enviarAcaoConversa("atualizar")}
                    disabled={gerando}
                  >
                    {gerando ? "Atualizando..." : "Atualizar opções"}
                  </button>
                ) : (
                  <div className={styles.assistantQuestionActions}>
                    {!resposta.pergunta.obrigatoria && (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => {
                          setRespostaPergunta("");
                          void enviarAcaoConversa("responder", {
                            pergunta_id: resposta.pergunta?.id,
                            resposta: "",
                          });
                        }}
                        disabled={gerando}
                      >
                        Continuar sem mídia
                      </button>
                    )}

                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={responderPerguntaAssistente}
                      disabled={
                        gerando ||
                        (resposta.pergunta.obrigatoria &&
                          !respostaPergunta.trim()) ||
                        (!resposta.pergunta.obrigatoria &&
                          resposta.pergunta.tipo === "selecao" &&
                          !respostaPergunta.trim())
                      }
                    >
                      {gerando ? "Salvando..." : "Confirmar resposta"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {(resposta.plano?.etapas || []).length > 0 && (
              <div className={styles.assistantPlanList}>
                <strong>Rascunho do fluxo</strong>
                {(resposta.plano?.etapas || []).slice(0, 16).map((etapa) => (
                  <div key={etapa.ref} className={styles.assistantPlanItem}>
                    <Check size={14} />
                    <span>{etapa.titulo || etapa.tipo}</span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.assistantActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={reiniciarConversa}
                disabled={gerando}
              >
                Começar de novo
              </button>

              {resposta.fase === "pronto" && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => enviarAcaoConversa("criar")}
                  disabled={gerando}
                >
                  <Sparkles size={16} />
                  {gerando ? "Criando..." : "Criar fluxo rascunho"}
                </button>
              )}
            </div>
          </div>
        )}

        {resposta && !conversaAtiva && (
          <div className={styles.assistantResult}>
            <div className={styles.assistantResultHeader}>
              <strong>Sugestao da IA</strong>
              <span>{resposta.proposta_id?.slice(0, 8) || "IA"}</span>
            </div>

            <p className={styles.assistantSummary}>{resposta.resumo}</p>

            {resposta.fluxo_criado && (
              <div className={styles.assistantStats}>
                <span>Rascunho salvo</span>
                <span>{resposta.fluxo_criado.nome}</span>
              </div>
            )}

            {resposta.estatisticas && (
              <div className={styles.assistantStats}>
                <span>{resposta.estatisticas.blocos} blocos</span>
                <span>{resposta.estatisticas.conexoes} conexoes</span>
                {resposta.estatisticas.blocos_criados > 0 && (
                  <span>{resposta.estatisticas.blocos_criados} novos</span>
                )}
                {resposta.estatisticas.mensagens_revisadas > 0 && (
                  <span>
                    {resposta.estatisticas.mensagens_revisadas} mensagens
                  </span>
                )}
              </div>
            )}

            {(resposta.validacao?.erros.length || 0) > 0 && (
              <div className={styles.assistantIssues}>
                <strong>Erros</strong>
                {resposta.validacao?.erros.map((item, index) => (
                  <p key={`${item.codigo}-${index}`}>{item.mensagem}</p>
                ))}
              </div>
            )}

            {(resposta.validacao?.avisos.length || 0) > 0 && (
              <div className={styles.assistantWarnings}>
                <strong>Avisos</strong>
                {resposta.validacao?.avisos.slice(0, 8).map((item, index) => (
                  <p key={`${item.codigo}-${index}`}>{item.mensagem}</p>
                ))}
              </div>
            )}

            {(resposta.avisos || []).length > 0 && (
              <div className={styles.assistantWarnings}>
                <strong>Observacoes da IA</strong>
                {(resposta.avisos || []).slice(0, 6).map((item, index) => (
                  <p key={`${item}-${index}`}>{item}</p>
                ))}
              </div>
            )}

            {(resposta.plano?.etapas || []).length > 0 && (
              <div className={styles.assistantPlanList}>
                <strong>Plano</strong>
                {(resposta.plano?.etapas || []).slice(0, 12).map((etapa) => (
                  <div key={etapa.ref} className={styles.assistantPlanItem}>
                    <Check size={14} />
                    <span>{etapa.titulo || etapa.tipo}</span>
                  </div>
                ))}
              </div>
            )}

            {(resposta.plano?.mensagens_revisadas || []).length > 0 && (
              <div className={styles.assistantPlanList}>
                <strong>Mensagens revisadas</strong>
                {(resposta.plano?.mensagens_revisadas || [])
                  .slice(0, 8)
                  .map((item) => (
                    <div key={item.ref} className={styles.assistantMessageItem}>
                      <span>{item.ref}</span>
                      <p>{item.mensagem}</p>
                    </div>
                  ))}
              </div>
            )}

            <div className={styles.assistantActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setResposta(null)}
              >
                Ajustar pedido
              </button>
            </div>
          </div>
        )}
      </div>

      {previaTokens && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Consumo de tokens</p>
                <h3 className={styles.modalTitle}>{previaTokens.titulo}</h3>
              </div>

              <button
                type="button"
                className={styles.closePanelButton}
                onClick={cancelarPreviaTokens}
                disabled={gerando}
                title="Fechar"
                aria-label="Fechar previa de tokens"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.tokenEstimateBox}>
                <span>Consumo estimado</span>
                <strong>
                  {formatarTokens(previaTokens.tokensMin)} ~{" "}
                  {formatarTokens(previaTokens.tokensMax)} tokens
                </strong>
                <small>{previaTokens.descricao}</small>
              </div>

              <div className={styles.warningBox}>
                <strong>Essa e uma estimativa antes da chamada a IA.</strong>
                <p>
                  O consumo real pode variar e será registrado automaticamente
                  apos a geração. A operação so começa depois da confirmação.
                </p>
              </div>

              <div className={styles.tokenEstimateList}>
                {previaTokens.detalhes.map((item) => (
                  <div key={item.id} className={styles.tokenEstimateItem}>
                    <span>{item.nome}</span>
                    <strong>
                      ~{formatarTokens(item.tokensEstimados)} tokens
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={cancelarPreviaTokens}
                disabled={gerando}
              >
                Cancelar
              </button>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={confirmarPreviaTokens}
                disabled={gerando}
              >
                {gerando ? "Gerando..." : "Confirmar geracao"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
