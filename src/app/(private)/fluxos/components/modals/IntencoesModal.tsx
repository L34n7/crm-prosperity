"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AtendenteOpcao,
  Fluxo,
  MidiaOpcao,
  PreviaGeracaoDescricaoIa,
  SetorOpcao,
} from "../../types";
import IaTokenEstimateModal from "./IaTokenEstimateModal";
import styles from "../../fluxos.module.css";

type TipoAcaoIntencao =
  | "enviar_texto"
  | "enviar_imagem"
  | "enviar_video"
  | "enviar_audio"
  | "enviar_arquivo"
  | "enviar_botoes"
  | "botao_redirect"
  | "transferir_setor"
  | "parar_fluxo"
  | "encerrar";

type BotaoAcaoIntencao = {
  id?: string;
  titulo?: string;
};

type ConfiguracaoAcaoIntencao = {
  mensagem?: string;
  botoes?: BotaoAcaoIntencao[];
  botao_texto?: string;
  url?: string;
  escopo_fila?: string;
  setor_id?: string;
  estrategia_transferencia?: string;
  atendente_id?: string;
  incluir_administradores_distribuicao?: boolean;
  midia_url?: string;
  midia_nome?: string;
  [chave: string]: unknown;
};

type AcaoIntencao = {
  id: string;
  tipo: TipoAcaoIntencao;
  configuracao_json: ConfiguracaoAcaoIntencao;
};

type Intencao = {
  id: string;
  titulo: string;
  resposta: string;
  contexto_ia: string;
  status: "ativa" | "pausada";
  ordem: number;
  acoes_json: AcaoIntencao[];
};

type IntencoesModalProps = {
  fluxo: Fluxo;
  podeEditar: boolean;
  onFechar: () => void;
};

type ModoEditor = "lista" | "nova" | "editar";

const ACOES_DISPONIVEIS: Array<{ tipo: TipoAcaoIntencao; label: string }> = [
  { tipo: "enviar_texto", label: "Enviar texto" },
  { tipo: "enviar_imagem", label: "Enviar imagem" },
  { tipo: "enviar_video", label: "Enviar vídeo" },
  { tipo: "enviar_audio", label: "Enviar áudio" },
  { tipo: "enviar_arquivo", label: "Enviar arquivo/documento" },
  { tipo: "enviar_botoes", label: "Enviar botões" },
  { tipo: "botao_redirect", label: "Botão redirect / link" },
  { tipo: "transferir_setor", label: "Transferir para atendimento" },
  { tipo: "parar_fluxo", label: "Parar fluxo" },
  { tipo: "encerrar", label: "Encerrar atendimento" },
];

function criarId(prefixo: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefixo}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function labelAcao(tipo: TipoAcaoIntencao) {
  return ACOES_DISPONIVEIS.find((item) => item.tipo === tipo)?.label || tipo;
}

function configuracaoInicial(tipo: TipoAcaoIntencao): ConfiguracaoAcaoIntencao {
  if (tipo === "enviar_botoes") {
    return {
      mensagem: "",
      botoes: [
        { id: criarId("botao"), titulo: "" },
        { id: criarId("botao"), titulo: "" },
      ],
    };
  }

  if (tipo === "botao_redirect") {
    return { mensagem: "", botao_texto: "Abrir link", url: "" };
  }

  if (tipo === "transferir_setor") {
    return {
      escopo_fila: "setor",
      setor_id: "",
      estrategia_transferencia: "fila_setor",
      atendente_id: "",
      incluir_administradores_distribuicao: false,
    };
  }

  return {};
}

function resumoResposta(texto: string) {
  const limpo = String(texto || "").replace(/\s+/g, " ").trim();
  return limpo.length > 100 ? `${limpo.slice(0, 100)}…` : limpo;
}

function formatarTokens(valor: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, valor || 0));
}

export default function IntencoesModal({
  fluxo,
  podeEditar,
  onFechar,
}: IntencoesModalProps) {
  const [intencoes, setIntencoes] = useState<Intencao[]>([]);
  const [midias, setMidias] = useState<MidiaOpcao[]>([]);
  const [setores, setSetores] = useState<SetorOpcao[]>([]);
  const [atendentes, setAtendentes] = useState<AtendenteOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [modo, setModo] = useState<ModoEditor>("lista");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [resposta, setResposta] = useState("");
  const [contextoIa, setContextoIa] = useState("");
  const [status, setStatus] = useState<"ativa" | "pausada">("ativa");
  const [acoes, setAcoes] = useState<AcaoIntencao[]>([]);
  const [tipoNovaAcao, setTipoNovaAcao] =
    useState<TipoAcaoIntencao>("enviar_texto");
  const [confirmandoTokens, setConfirmandoTokens] = useState(false);
  const [excluindo, setExcluindo] = useState<Intencao | null>(null);

  const previaTokens = useMemo<PreviaGeracaoDescricaoIa>(
    () => ({
      modo: "conexao",
      titulo: `Gerar contexto da intenção${titulo ? ` “${titulo}”` : ""}`,
      conexoes: [
        {
          edgeId: "contexto_intencao",
          nome: "Contexto semântico para IA",
          tokensEstimados: 320,
        },
      ],
      tokensMin: 180,
      tokensMax: 520,
    }),
    [titulo]
  );

  async function carregar() {
    try {
      setLoading(true);
      setErro("");

      const [resIntencoes, resMidias, resSetores] = await Promise.all([
        fetch(`/api/automacoes/${fluxo.id}/intencoes`, { cache: "no-store" }),
        fetch("/api/automacoes/midias", { cache: "no-store" }),
        fetch("/api/setores/opcoes", { cache: "no-store" }),
      ]);

      const [jsonIntencoes, jsonMidias, jsonSetores] = await Promise.all([
        resIntencoes.json(),
        resMidias.json(),
        resSetores.json(),
      ]);

      if (!resIntencoes.ok || !jsonIntencoes.ok) {
        throw new Error(jsonIntencoes.error || "Erro ao carregar intenções.");
      }

      setIntencoes(Array.isArray(jsonIntencoes.intencoes) ? jsonIntencoes.intencoes : []);
      setMidias(
        resMidias.ok && jsonMidias.ok && Array.isArray(jsonMidias.midias)
          ? jsonMidias.midias
          : []
      );
      setSetores(
        resSetores.ok && jsonSetores.ok && Array.isArray(jsonSetores.setores)
          ? jsonSetores.setores
          : []
      );
      setAtendentes(
        resSetores.ok && jsonSetores.ok && Array.isArray(jsonSetores.atendentes)
          ? jsonSetores.atendentes
          : []
      );
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar intenções.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, [fluxo.id]);

  function limparFormulario() {
    setEditandoId(null);
    setTitulo("");
    setResposta("");
    setContextoIa("");
    setStatus("ativa");
    setAcoes([]);
    setTipoNovaAcao("enviar_texto");
    setErro("");
  }

  function abrirNova() {
    limparFormulario();
    setModo("nova");
  }

  function abrirEdicao(intencao: Intencao) {
    setEditandoId(intencao.id);
    setTitulo(intencao.titulo);
    setResposta(intencao.resposta);
    setContextoIa(intencao.contexto_ia);
    setStatus(intencao.status);
    setAcoes(Array.isArray(intencao.acoes_json) ? intencao.acoes_json : []);
    setErro("");
    setSucesso("");
    setModo("editar");
  }

  function voltarLista() {
    limparFormulario();
    setModo("lista");
  }

  async function criarDepoisDaConfirmacao() {
    try {
      setSalvando(true);
      setErro("");
      const res = await fetch(`/api/automacoes/${fluxo.id}/intencoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim(),
          resposta: resposta.trim(),
          acoes_json: acoes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao criar intenção.");
      }

      setIntencoes((atuais) => [...atuais, json.intencao]);
      setConfirmandoTokens(false);
      setSucesso("Intenção criada e contexto para IA gerado com sucesso.");
      voltarLista();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao criar intenção.");
      setConfirmandoTokens(false);
    } finally {
      setSalvando(false);
    }
  }

  function solicitarCriacao() {
    setErro("");
    if (!titulo.trim() || !resposta.trim()) {
      setErro("Preencha a intenção e a resposta antes de criar.");
      return;
    }
    if (salvando) return;
    setConfirmandoTokens(true);
  }

  async function salvarEdicao() {
    if (!editandoId || salvando) return;
    if (!titulo.trim() || !resposta.trim() || !contextoIa.trim()) {
      setErro("Intenção, resposta e contexto para IA são obrigatórios.");
      return;
    }

    try {
      setSalvando(true);
      setErro("");
      const res = await fetch(`/api/automacoes/${fluxo.id}/intencoes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editandoId,
          titulo: titulo.trim(),
          resposta: resposta.trim(),
          contexto_ia: contextoIa.trim(),
          status,
          acoes_json: acoes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao salvar intenção.");
      }

      setIntencoes((atuais) =>
        atuais.map((item) => (item.id === editandoId ? json.intencao : item))
      );
      setSucesso("Intenção atualizada com sucesso.");
      voltarLista();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar intenção.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarStatus(intencao: Intencao) {
    if (!podeEditar || salvando) return;
    const proximo = intencao.status === "ativa" ? "pausada" : "ativa";
    try {
      setSalvando(true);
      setErro("");
      const res = await fetch(`/api/automacoes/${fluxo.id}/intencoes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: intencao.id, status: proximo }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao alterar status.");
      setIntencoes((atuais) =>
        atuais.map((item) => (item.id === intencao.id ? json.intencao : item))
      );
      setSucesso(proximo === "ativa" ? "Intenção ativada." : "Intenção pausada.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao alterar status.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirConfirmada() {
    if (!excluindo || salvando) return;
    try {
      setSalvando(true);
      setErro("");
      const res = await fetch(`/api/automacoes/${fluxo.id}/intencoes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: excluindo.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao excluir intenção.");
      setIntencoes((atuais) => atuais.filter((item) => item.id !== excluindo.id));
      setExcluindo(null);
      setSucesso("Intenção excluída.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao excluir intenção.");
    } finally {
      setSalvando(false);
    }
  }

  function adicionarAcao() {
    setAcoes((atuais) => [
      ...atuais,
      {
        id: criarId("acao"),
        tipo: tipoNovaAcao,
        configuracao_json: configuracaoInicial(tipoNovaAcao),
      },
    ]);
  }

  function atualizarAcao(indice: number, patch: Partial<ConfiguracaoAcaoIntencao>) {
    setAcoes((atuais) =>
      atuais.map((acao, posicao) =>
        posicao === indice
          ? {
              ...acao,
              configuracao_json: { ...acao.configuracao_json, ...patch },
            }
          : acao
      )
    );
  }

  function moverAcao(indice: number, direcao: -1 | 1) {
    setAcoes((atuais) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= atuais.length) return atuais;
      const copia = [...atuais];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  function removerAcao(indice: number) {
    setAcoes((atuais) => atuais.filter((_, posicao) => posicao !== indice));
  }

  function midiasParaAcao(tipo: TipoAcaoIntencao) {
    const esperado =
      tipo === "enviar_imagem"
        ? "imagem"
        : tipo === "enviar_video"
        ? "video"
        : tipo === "enviar_audio"
        ? "audio"
        : "arquivo";
    return midias.filter((midia) => midia.tipo === esperado);
  }

  function atendentesDoSetor(setorId: string) {
    if (!setorId) return atendentes;
    return atendentes.filter(
      (atendente) =>
        atendente.is_administrador || atendente.setor_ids?.includes(setorId)
    );
  }

  function renderConfigAcao(acao: AcaoIntencao, indice: number) {
    const config = acao.configuracao_json || {};

    if (acao.tipo === "enviar_texto") {
      return (
        <label className={styles.field}>
          <span className={styles.label}>Texto adicional</span>
          <textarea
            className={styles.textarea}
            rows={3}
            value={String(config.mensagem || "")}
            onChange={(e) => atualizarAcao(indice, { mensagem: e.target.value })}
            placeholder="Mensagem enviada após a resposta principal. Variáveis {{...}} são aceitas."
          />
        </label>
      );
    }

    if (
      acao.tipo === "enviar_imagem" ||
      acao.tipo === "enviar_video" ||
      acao.tipo === "enviar_audio" ||
      acao.tipo === "enviar_arquivo"
    ) {
      const opcoes = midiasParaAcao(acao.tipo);
      return (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Arquivo da biblioteca</span>
            <select
              className={styles.input}
              value={String(config.midia_url || "")}
              onChange={(e) => {
                const selecionada = opcoes.find((midia) => midia.url === e.target.value);
                atualizarAcao(indice, {
                  midia_url: e.target.value,
                  midia_nome: selecionada?.nome || "",
                });
              }}
            >
              <option value="">Selecione uma mídia já cadastrada</option>
              {opcoes.map((midia) => (
                <option key={midia.id} value={midia.url}>
                  {midia.nome}
                </option>
              ))}
            </select>
            <span className={styles.help}>
              Usa a mesma biblioteca de mídias dos blocos do fluxo.
            </span>
          </label>
          {acao.tipo !== "enviar_audio" && (
            <label className={styles.field}>
              <span className={styles.label}>Legenda opcional</span>
              <textarea
                className={styles.textarea}
                rows={2}
                value={String(config.mensagem || "")}
                onChange={(e) => atualizarAcao(indice, { mensagem: e.target.value })}
              />
            </label>
          )}
        </>
      );
    }

    if (acao.tipo === "enviar_botoes") {
      const botoes = Array.isArray(config.botoes) ? config.botoes : [];
      return (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Mensagem dos botões</span>
            <textarea
              className={styles.textarea}
              rows={2}
              value={String(config.mensagem || "")}
              onChange={(e) => atualizarAcao(indice, { mensagem: e.target.value })}
            />
          </label>
          {botoes.slice(0, 3).map((botao: BotaoAcaoIntencao, botaoIndex: number) => (
            <label key={botao.id || botaoIndex} className={styles.field}>
              <span className={styles.label}>Botão {botaoIndex + 1}</span>
              <input
                className={styles.input}
                maxLength={20}
                value={String(botao.titulo || "")}
                onChange={(e) => {
                  const novos = [...botoes];
                  novos[botaoIndex] = { ...novos[botaoIndex], titulo: e.target.value };
                  atualizarAcao(indice, { botoes: novos });
                }}
              />
            </label>
          ))}
          {botoes.length < 3 && (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() =>
                atualizarAcao(indice, {
                  botoes: [...botoes, { id: criarId("botao"), titulo: "" }],
                })
              }
            >
              + Botão
            </button>
          )}
        </>
      );
    }

    if (acao.tipo === "botao_redirect") {
      return (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Mensagem</span>
            <textarea
              className={styles.textarea}
              rows={2}
              value={String(config.mensagem || "")}
              onChange={(e) => atualizarAcao(indice, { mensagem: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Texto do botão</span>
            <input
              className={styles.input}
              maxLength={20}
              value={String(config.botao_texto || "")}
              onChange={(e) => atualizarAcao(indice, { botao_texto: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>URL</span>
            <input
              className={styles.input}
              value={String(config.url || "")}
              onChange={(e) => atualizarAcao(indice, { url: e.target.value })}
              placeholder="https://..."
            />
          </label>
        </>
      );
    }

    if (acao.tipo === "transferir_setor") {
      const escopo = String(config.escopo_fila || "setor");
      const setorId = String(config.setor_id || "");
      const estrategia = String(config.estrategia_transferencia || "fila_setor");
      return (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Escopo da fila</span>
            <select
              className={styles.input}
              value={escopo}
              onChange={(e) =>
                atualizarAcao(indice, {
                  escopo_fila: e.target.value,
                  setor_id: e.target.value === "geral" ? "" : setorId,
                  atendente_id: "",
                })
              }
            >
              <option value="geral">Fila geral</option>
              <option value="setor">Setor específico</option>
            </select>
          </label>
          {escopo !== "geral" && (
            <label className={styles.field}>
              <span className={styles.label}>Setor</span>
              <select
                className={styles.input}
                value={setorId}
                onChange={(e) =>
                  atualizarAcao(indice, { setor_id: e.target.value, atendente_id: "" })
                }
              >
                <option value="">Selecione um setor</option>
                {setores.map((setor) => (
                  <option key={setor.id} value={setor.id}>
                    {setor.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {escopo !== "geral" && setorId && (
            <>
              <label className={styles.field}>
                <span className={styles.label}>Distribuição</span>
                <select
                  className={styles.input}
                  value={estrategia}
                  onChange={(e) =>
                    atualizarAcao(indice, {
                      estrategia_transferencia: e.target.value,
                      atendente_id: "",
                    })
                  }
                >
                  <option value="fila_setor">Somente fila do setor</option>
                  <option value="atendente_especifico">Atendente específico</option>
                  <option value="rodizio_aleatorio">Rodízio aleatório</option>
                  <option value="menos_conversas">Atendente com menos conversas</option>
                </select>
              </label>
              {estrategia === "atendente_especifico" && (
                <label className={styles.field}>
                  <span className={styles.label}>Atendente</span>
                  <select
                    className={styles.input}
                    value={String(config.atendente_id || "")}
                    onChange={(e) => atualizarAcao(indice, { atendente_id: e.target.value })}
                  >
                    <option value="">Selecione um atendente</option>
                    {atendentesDoSetor(setorId).map((atendente) => (
                      <option key={atendente.id} value={atendente.id}>
                        {atendente.nome}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className={styles.switchField}>
                <input
                  type="checkbox"
                  checked={config.incluir_administradores_distribuicao === true}
                  onChange={(e) =>
                    atualizarAcao(indice, {
                      incluir_administradores_distribuicao: e.target.checked,
                    })
                  }
                />
                <div>
                  <strong>Incluir administradores na distribuição</strong>
                  <p>Segue a mesma regra do bloco de transferência.</p>
                </div>
              </label>
            </>
          )}
        </>
      );
    }

    if (acao.tipo === "parar_fluxo") {
      return (
        <div className={styles.warningBox}>
          <strong>Esta ação interrompe a execução atual.</strong>
          <p>As intenções não param o fluxo por padrão. Somente esta ação explícita cancela a execução e seus agendamentos pendentes.</p>
        </div>
      );
    }

    return (
      <div className={styles.warningBox}>
        <strong>Esta ação encerra o atendimento.</strong>
        <p>A conversa e a execução atual serão encerradas seguindo o comportamento de encerramento automático do sistema.</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.modalOverlay} onClick={onFechar}>
        <div
          className={`${styles.modalCard} ${styles.variableManagerModal}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles.modalHeader}>
            <div>
              <p className={styles.eyebrow}>Fluxo · {fluxo.nome}</p>
              <h3 className={styles.modalTitle}>Intenções</h3>
              <p className={styles.modalSubtitle}>
                Intenções respondem perguntas pontuais durante qualquer etapa deste fluxo. A IA identifica a pergunta e executa a resposta e as ações configuradas sem interromper o fluxo principal, exceto quando você adicionar uma ação como “Parar fluxo”.
              </p>
              <p className={styles.modalSubtitle}>
                Ex.: enquanto o fluxo pergunta uma data, o contato pode perguntar “Qual o valor?”. A intenção responde o preço e o fluxo continua aguardando a data.
              </p>
            </div>
            <button type="button" className={styles.closePanelButton} onClick={onFechar}>
              ×
            </button>
          </div>

          <div className={styles.modalBody}>
            {erro && <div className={styles.errorAlert}>{erro}</div>}
            {sucesso && <div className={styles.variablePreviewBox}>{sucesso}</div>}

            {modo === "lista" ? (
              <>
                <div className={styles.variableFormActions}>
                  {podeEditar && (
                    <button type="button" className={styles.primaryButton} onClick={abrirNova}>
                      Nova intenção
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className={styles.emptyMini}>Carregando intenções...</div>
                ) : intencoes.length === 0 ? (
                  <div className={styles.emptyMini}>
                    Nenhuma intenção cadastrada neste fluxo.
                  </div>
                ) : (
                  <div className={styles.variablesList}>
                    {intencoes.map((intencao) => (
                      <div key={intencao.id} className={styles.variableItem}>
                        <div className={styles.variableMain}>
                          <strong className={styles.variableCode}>{intencao.titulo}</strong>
                          <p className={styles.variablePerson}>
                            <strong>Status: </strong>
                            {intencao.status === "ativa" ? "ATIVA" : "PAUSADA"}
                          </p>
                          <p className={styles.variablePerson}>
                            <strong>Resposta: </strong>{resumoResposta(intencao.resposta)}
                          </p>
                          <p className={styles.variablePerson}>
                            <strong>Ações adicionais: </strong>
                            {Array.isArray(intencao.acoes_json) && intencao.acoes_json.length
                              ? intencao.acoes_json.map((acao) => labelAcao(acao.tipo)).join(" · ")
                              : "Nenhuma"}
                          </p>
                        </div>
                        <div className={styles.variableActions}>
                          <button
                            type="button"
                            className={styles.variableUseButton}
                            onClick={() => abrirEdicao(intencao)}
                          >
                            {podeEditar ? "Editar" : "Ver"}
                          </button>
                          {podeEditar && (
                            <>
                              <button
                                type="button"
                                className={styles.variableUseButton}
                                disabled={salvando}
                                onClick={() => void alternarStatus(intencao)}
                              >
                                {intencao.status === "ativa" ? "Pausar" : "Ativar"}
                              </button>
                              <button
                                type="button"
                                className={styles.variableDeleteButton}
                                disabled={salvando}
                                onClick={() => setExcluindo(intencao)}
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={styles.modalSection}>
                  <h4 className={styles.modalSectionTitle}>
                    {modo === "nova" ? "Nova intenção" : "Editar intenção"}
                  </h4>
                  <label className={styles.field}>
                    <span className={styles.label}>Intenção</span>
                    <input
                      className={styles.input}
                      value={titulo}
                      disabled={!podeEditar}
                      onChange={(e) => setTitulo(e.target.value)}
                      placeholder="Ex.: Preço da limpeza"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Resposta</span>
                    <textarea
                      className={styles.textarea}
                      rows={4}
                      value={resposta}
                      disabled={!podeEditar}
                      onChange={(e) => setResposta(e.target.value)}
                      placeholder="Ex.: A limpeza odontológica está por R$ 180 😊"
                    />
                    <span className={styles.help}>
                      Você pode usar as mesmas variáveis de texto do fluxo, como {"{{nome_contato}}"}.
                    </span>
                  </label>

                  {modo === "editar" && (
                    <>
                      <label className={styles.field}>
                        <span className={styles.label}>Contexto para IA</span>
                        <textarea
                          className={styles.textarea}
                          rows={6}
                          value={contextoIa}
                          disabled={!podeEditar}
                          onChange={(e) => setContextoIa(e.target.value)}
                        />
                        <span className={styles.help}>
                          Gerado automaticamente na criação. Edite apenas se quiser refinar quando esta intenção deve ser identificada.
                        </span>
                      </label>
                      <label className={styles.field}>
                        <span className={styles.label}>Status</span>
                        <select
                          className={styles.input}
                          value={status}
                          disabled={!podeEditar}
                          onChange={(e) => setStatus(e.target.value === "pausada" ? "pausada" : "ativa")}
                        >
                          <option value="ativa">ATIVA</option>
                          <option value="pausada">PAUSADA</option>
                        </select>
                      </label>
                    </>
                  )}
                </div>

                <div className={styles.modalSection}>
                  <h4 className={styles.modalSectionTitle}>Ações adicionais</h4>
                  <p className={styles.help}>
                    A resposta acima é sempre a primeira ação. As ações abaixo executam na ordem mostrada e não alteram o nó atual, exceto transferência, parada ou encerramento.
                  </p>

                  {acoes.length === 0 ? (
                    <div className={styles.emptyMini}>Nenhuma ação adicional.</div>
                  ) : (
                    <div className={styles.variablesList}>
                      {acoes.map((acao, indice) => (
                        <div key={acao.id} className={styles.variableItem}>
                          <div className={styles.variableMain}>
                            <strong className={styles.variableCode}>
                              {indice + 2}. {labelAcao(acao.tipo)}
                            </strong>
                            {renderConfigAcao(acao, indice)}
                          </div>
                          {podeEditar && (
                            <div className={styles.variableActions}>
                              <button
                                type="button"
                                className={styles.variableUseButton}
                                disabled={indice === 0}
                                onClick={() => moverAcao(indice, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={styles.variableUseButton}
                                disabled={indice === acoes.length - 1}
                                onClick={() => moverAcao(indice, 1)}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className={styles.variableDeleteButton}
                                onClick={() => removerAcao(indice)}
                              >
                                Remover
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {podeEditar && (
                    <div className={styles.variableFormGrid}>
                      <label className={styles.field}>
                        <span className={styles.label}>Adicionar ação</span>
                        <select
                          className={styles.input}
                          value={tipoNovaAcao}
                          onChange={(e) => setTipoNovaAcao(e.target.value as TipoAcaoIntencao)}
                        >
                          {ACOES_DISPONIVEIS.map((item) => (
                            <option key={item.tipo} value={item.tipo}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className={styles.secondaryButton} onClick={adicionarAcao}>
                        + Adicionar
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className={styles.modalFooter}>
            {modo === "lista" ? (
              <button type="button" className={styles.secondaryButton} onClick={onFechar}>
                Fechar
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={salvando}
                  onClick={voltarLista}
                >
                  Voltar
                </button>
                {podeEditar && (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={salvando}
                    onClick={modo === "nova" ? solicitarCriacao : () => void salvarEdicao()}
                  >
                    {salvando ? "Salvando..." : modo === "nova" ? "Criar" : "Salvar alterações"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {confirmandoTokens && (
        <IaTokenEstimateModal
          previa={previaTokens}
          processando={salvando}
          formatarTokens={formatarTokens}
          itemSingular="contexto"
          itemPlural="contextos"
          acaoLabel="geração do contexto"
          onCancelar={() => !salvando && setConfirmandoTokens(false)}
          onConfirmar={() => void criarDepoisDaConfirmacao()}
        />
      )}

      {excluindo && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Confirmação</p>
                <h3 className={styles.modalTitle}>Excluir intenção?</h3>
                <p className={styles.modalSubtitle}>
                  A intenção “{excluindo.titulo}” e suas ações serão removidas. O fluxo principal não será alterado.
                </p>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={salvando}
                onClick={() => setExcluindo(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={salvando}
                onClick={() => void excluirConfirmada()}
              >
                {salvando ? "Excluindo..." : "Excluir intenção"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
