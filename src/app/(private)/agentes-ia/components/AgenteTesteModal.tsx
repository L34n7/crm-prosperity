"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Coins,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { solicitarAtualizacaoSaldoTokensIa } from "@/lib/ia/tokens-client-events";
import styles from "./AgenteModals.module.css";

type AgenteTeste = {
  id: string;
  nome: string;
  prompt_sistema?: string | null;
  tom_voz?: string | null;
  instrucoes?: string | null;
  max_mensagens_contexto: number;
};

type Tokens = {
  input: number;
  output: number;
  total: number;
  fisicos_total?: number;
};

type MensagemTeste = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokens?: Tokens;
};

type Props = {
  agente: AgenteTeste;
  onClose: () => void;
};

function arredondar50(valor: number) {
  return Math.max(50, Math.round(valor / 50) * 50);
}

function estimarConsumo(agente: AgenteTeste, historico: MensagemTeste[], tamanhoMensagem = 80) {
  const limiteHistorico = Math.min(
    40,
    Math.max(4, Number(agente.max_mensagens_contexto || 6))
  );
  const contextoFixo = [
    agente.nome,
    agente.prompt_sistema || "",
    agente.tom_voz || "",
    agente.instrucoes || "",
  ].join("\n").length;
  const mensagensRecentes = historico.slice(-limiteHistorico);
  const caracteresHistorico = mensagensRecentes.reduce(
    (total, item) => total + item.content.length,
    0
  );

  // Estimativa de UX em tokens Prosperity para o modelo econômico padrão.
  // O valor real é calculado no backend com o uso devolvido pelo provider e
  // pode variar por cache, resposta, conhecimentos e dados recuperados.
  const entradaFisicaAproximada = Math.ceil(
    (contextoFixo + caracteresHistorico + Math.max(20, tamanhoMensagem)) / 4
  ) + 380;
  const custoEntradaAproximado = entradaFisicaAproximada * 0.2;
  const minimo = arredondar50(Math.max(100, custoEntradaAproximado + 30 * 1.2));
  const maximo = arredondar50(
    Math.max(minimo + 150, custoEntradaAproximado * 1.35 + 180 * 1.2 + 60)
  );
  return { minimo, maximo };
}

function idMensagem() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AgenteTesteModal({ agente, onClose }: Props) {
  const [confirmado, setConfirmado] = useState(false);
  const [mensagens, setMensagens] = useState<MensagemTeste[]>([]);
  const [texto, setTexto] = useState("");
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState("");
  const fimChatRef = useRef<HTMLDivElement | null>(null);

  const estimativaInicial = useMemo(
    () => estimarConsumo(agente, [], 80),
    [agente]
  );
  const estimativaProxima = useMemo(
    () => estimarConsumo(agente, mensagens, texto.length || 80),
    [agente, mensagens, texto.length]
  );
  const totalSessao = useMemo(
    () => mensagens.reduce((total, item) => total + Number(item.tokens?.total || 0), 0),
    [mensagens]
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !testando) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, testando]);

  useEffect(() => {
    if (!confirmado) return;
    fimChatRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [confirmado, mensagens, testando]);

  async function enviar() {
    const mensagem = texto.trim();
    if (!mensagem || testando) return;

    const historico = mensagens.map((item) => ({
      role: item.role,
      content: item.content,
    }));
    const mensagemUsuario: MensagemTeste = {
      id: idMensagem(),
      role: "user",
      content: mensagem,
    };

    setMensagens((atuais) => [...atuais, mensagemUsuario]);
    setTexto("");
    setTestando(true);
    setErro("");

    try {
      const response = await fetch("/api/agentes-ia/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agente.id,
          mensagem,
          historico,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Erro ao testar agente.");
      }

      if (json.saldo) {
        solicitarAtualizacaoSaldoTokensIa({ saldo: json.saldo });
      }

      setMensagens((atuais) => [
        ...atuais,
        {
          id: idMensagem(),
          role: "assistant",
          content: String(json.resposta || "Sem resposta."),
          tokens: {
            input: Number(json.tokens?.input || 0),
            output: Number(json.tokens?.output || 0),
            total: Number(json.tokens?.total || 0),
            fisicos_total: Number(json.tokens?.fisicos_total || 0),
          },
        },
      ]);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao testar agente.");
    } finally {
      setTestando(false);
    }
  }

  if (!confirmado) {
    return (
      <div
        className={styles.overlay}
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="confirmar-teste-title">
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <span className={styles.headerIcon}><Sparkles size={19} /></span>
              <div>
                <h2 id="confirmar-teste-title">Testar “{agente.nome}”?</h2>
                <p>Antes de iniciar, confira como o consumo do teste funciona.</p>
              </div>
            </div>
            <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Fechar">
              <X size={18} />
            </button>
          </div>

          <div className={styles.confirmBody}>
            <p className={styles.confirmLead}>
              O teste usa a IA real configurada no agente e <strong>desconta tokens do saldo da empresa</strong>, como uma resposta normal do agente.
            </p>

            <div className={styles.estimateCard}>
              <span className={styles.estimateIcon}><Coins size={20} /></span>
              <div>
                <strong>
                  Estimativa inicial: {estimativaInicial.minimo.toLocaleString("pt-BR")}–{estimativaInicial.maximo.toLocaleString("pt-BR")} tokens Prosperity por resposta
                </strong>
                <p>
                  A faixa estima o que pode ser debitado do saldo. O valor real varia conforme histórico, resposta, conhecimento recuperado, cache e dados consultados.
                </p>
              </div>
            </div>

            <ul className={styles.infoList}>
              <li>cada mensagem enviada no teste pode gerar uma nova chamada de IA;</li>
              <li>quanto maior o histórico da conversa, maior tende a ser o consumo de entrada;</li>
              <li>depois de cada resposta, o CRM mostra os tokens Prosperity realmente debitados e registrados no extrato.</li>
            </ul>

            <div className={styles.safeNote}>
              <CheckCircle2 size={17} />
              <span>O modo de teste não cria pedidos, agendamentos, transferências nem altera dados do CRM.</span>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onClose}>Cancelar</button>
            <button type="button" className={styles.primary} onClick={() => setConfirmado(true)}>
              <Sparkles size={16} /> Iniciar teste
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.chatModal} role="dialog" aria-modal="true" aria-labelledby="teste-agente-title">
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.headerIcon}><Bot size={19} /></span>
            <div>
              <h2 id="teste-agente-title">{agente.nome}</h2>
              <p>Conversa de teste · simulação de atendimento no WhatsApp</p>
              <div className={styles.chatHeaderMeta}>
                <span className={styles.metaBadge}><CheckCircle2 size={12} /> Sem ações no CRM</span>
                <span className={styles.metaBadge}><Coins size={12} /> {totalSessao.toLocaleString("pt-BR")} tokens Prosperity na sessão</span>
              </div>
            </div>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} disabled={testando} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className={styles.chatToolbar}>
          <span>O histórico desta sessão é enviado para manter a conversa natural.</span>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setMensagens([]);
              setTexto("");
              setErro("");
            }}
            disabled={testando || mensagens.length === 0}
          >
            <RotateCcw size={13} /> Nova conversa
          </button>
        </div>

        <div className={styles.chatBody}>
          {mensagens.length === 0 && !testando && (
            <div className={styles.emptyChat}>
              <MessageStartIcon />
              <strong>Envie a primeira mensagem</strong>
              <p>Converse normalmente com o agente para validar tom, conhecimento e continuidade antes de colocar em produção.</p>
            </div>
          )}

          {mensagens.map((item) => (
            <div
              key={item.id}
              className={`${styles.messageRow} ${item.role === "user" ? styles.messageRowUser : styles.messageRowAssistant}`}
            >
              <div className={`${styles.bubble} ${item.role === "user" ? styles.bubbleUser : styles.bubbleAssistant}`}>
                <p>{item.content}</p>
                <div className={styles.messageMeta}>
                  {item.role === "assistant" && item.tokens?.total ? (
                    <span>{item.tokens.total.toLocaleString("pt-BR")} tokens cobrados</span>
                  ) : (
                    <span>{item.role === "user" ? "Você" : "IA"}</span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {testando && (
            <div className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
              <div className={styles.typing} aria-label="Agente digitando">
                <i /><i /><i />
              </div>
            </div>
          )}
          <div ref={fimChatRef} />
        </div>

        {erro && <div className={styles.error}>{erro}</div>}

        <div className={styles.composer}>
          <div className={styles.nextEstimate}>
            <Coins size={13} />
            Próxima resposta: estimativa de {estimativaProxima.minimo.toLocaleString("pt-BR")}–{estimativaProxima.maximo.toLocaleString("pt-BR")} tokens Prosperity
          </div>
          <div className={styles.composerRow}>
            <textarea
              rows={1}
              value={texto}
              disabled={testando}
              onChange={(event) => setTexto(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void enviar();
                }
              }}
              placeholder="Digite uma mensagem..."
            />
            <button type="button" className={styles.sendButton} onClick={() => void enviar()} disabled={testando || !texto.trim()} aria-label="Enviar mensagem">
              {testando ? <Loader2 size={17} className={styles.spin} /> : <Send size={17} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageStartIcon() {
  return (
    <span className={styles.headerIcon} style={{ margin: "0 auto 10px" }}>
      <Sparkles size={18} />
    </span>
  );
}
