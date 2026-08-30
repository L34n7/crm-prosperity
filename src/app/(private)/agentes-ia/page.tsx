"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  BookOpen,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wrench,
  Zap,
} from "lucide-react";
import styles from "./page.module.css";

type Ferramenta = {
  id?: string;
  tipo: string;
  ativo: boolean;
  config_json: Record<string, unknown>;
};

type Conhecimento = {
  id: string;
  titulo: string;
  categoria?: string | null;
  conteudo: string;
  palavras_chave?: string[];
  prioridade?: number;
};

type Agente = {
  id: string;
  nome: string;
  descricao?: string | null;
  status: "rascunho" | "ativo" | "inativo";
  modelo: string;
  prompt_sistema: string;
  tom_voz?: string | null;
  instrucoes?: string | null;
  max_mensagens_contexto: number;
  debounce_ms: number;
  fallback_fluxo_id?: string | null;
  integracoes_whatsapp_ids?: string[];
  ferramentas: Ferramenta[];
  conhecimentos: Conhecimento[];
};

type OpcaoIntegracao = {
  id: string;
  nome_conexao?: string | null;
  numero?: string | null;
  phone_number_display_name?: string | null;
  verified_name?: string | null;
  status?: string | null;
};

type Opcao = { id: string; nome: string };

type RespostaLista = {
  ok: boolean;
  agentes: Agente[];
  opcoes: {
    integracoes: OpcaoIntegracao[];
    fluxos: Opcao[];
    setores: Opcao[];
  };
  error?: string;
};

const FERRAMENTAS = [
  {
    tipo: "consultar_conhecimento",
    titulo: "Consultar conhecimento",
    descricao: "Busca até 5 trechos relevantes da base aprovada do agente.",
  },
  {
    tipo: "consultar_contato",
    titulo: "Consultar contato",
    descricao: "Lê somente os dados do contato da conversa atual.",
  },
  {
    tipo: "consultar_agenda",
    titulo: "Consultar agenda",
    descricao: "Consulta disponibilidade real do CRM e Google Calendar.",
  },
  {
    tipo: "criar_agendamento",
    titulo: "Criar agendamento",
    descricao: "Cria somente após revalidar o horário no backend.",
  },
  {
    tipo: "remarcar_agendamento",
    titulo: "Remarcar agendamento",
    descricao: "Move um agendamento do contato com validação de conflito.",
  },
  {
    tipo: "cancelar_agendamento",
    titulo: "Cancelar agendamento",
    descricao: "Cancela de forma idempotente um agendamento do contato.",
  },
  {
    tipo: "transferir_humano",
    titulo: "Transferir para humano",
    descricao: "Encerra o controle do bot e envia para fila ou setor humano.",
  },
] as const;

function cloneAgente(agente: Agente): Agente {
  return JSON.parse(JSON.stringify(agente));
}

export default function AgentesIaPage() {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [selecionadoId, setSelecionadoId] = useState("");
  const [editor, setEditor] = useState<Agente | null>(null);
  const [integracoes, setIntegracoes] = useState<OpcaoIntegracao[]>([]);
  const [fluxos, setFluxos] = useState<Opcao[]>([]);
  const [setores, setSetores] = useState<Opcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [novoConhecimento, setNovoConhecimento] = useState({
    titulo: "",
    categoria: "",
    conteudo: "",
    palavras_chave: "",
  });
  const [teste, setTeste] = useState("");
  const [respostaTeste, setRespostaTeste] = useState("");
  const [testando, setTestando] = useState(false);

  const selecionado = useMemo(
    () => agentes.find((agente) => agente.id === selecionadoId) || null,
    [agentes, selecionadoId]
  );

  async function carregar(preferirId?: string) {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch("/api/agentes-ia", { cache: "no-store" });
      const json = (await res.json()) as RespostaLista;
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao carregar agentes.");
      setAgentes(json.agentes || []);
      setIntegracoes(json.opcoes?.integracoes || []);
      setFluxos(json.opcoes?.fluxos || []);
      setSetores(json.opcoes?.setores || []);
      const proximoId =
        (preferirId && json.agentes.some((item) => item.id === preferirId) && preferirId) ||
        (selecionadoId && json.agentes.some((item) => item.id === selecionadoId) && selecionadoId) ||
        json.agentes[0]?.id ||
        "";
      setSelecionadoId(proximoId);
      const proximo = json.agentes.find((item) => item.id === proximoId) || null;
      setEditor(proximo ? cloneAgente(proximo) : null);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar agentes.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selecionado) {
      setEditor(cloneAgente(selecionado));
      setRespostaTeste("");
      setTeste("");
    }
  }, [selecionado]);

  async function criarAgente() {
    setErro("");
    setSucesso("");
    try {
      const res = await fetch("/api/agentes-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: `Agente ${agentes.length + 1}` }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao criar agente.");
      await carregar(json.agente.id);
      setSucesso("Agente criado como rascunho.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao criar agente.");
    }
  }

  function ferramentaAtiva(tipo: string) {
    return editor?.ferramentas?.some((item) => item.tipo === tipo && item.ativo) || false;
  }

  function configFerramenta(tipo: string) {
    return editor?.ferramentas?.find((item) => item.tipo === tipo)?.config_json || {};
  }

  function alternarFerramenta(tipo: string) {
    if (!editor) return;
    const existe = editor.ferramentas.find((item) => item.tipo === tipo);
    const proxima = existe
      ? editor.ferramentas.map((item) =>
          item.tipo === tipo ? { ...item, ativo: !item.ativo } : item
        )
      : [...editor.ferramentas, { tipo, ativo: true, config_json: {} }];
    setEditor({ ...editor, ferramentas: proxima });
  }

  function atualizarConfigFerramenta(tipo: string, chave: string, valor: unknown) {
    if (!editor) return;
    const existe = editor.ferramentas.find((item) => item.tipo === tipo);
    const proxima = existe
      ? editor.ferramentas.map((item) =>
          item.tipo === tipo
            ? { ...item, config_json: { ...(item.config_json || {}), [chave]: valor } }
            : item
        )
      : [...editor.ferramentas, { tipo, ativo: true, config_json: { [chave]: valor } }];
    setEditor({ ...editor, ferramentas: proxima });
  }

  function alternarIntegracao(id: string) {
    if (!editor) return;
    const atuais = editor.integracoes_whatsapp_ids || [];
    const proximos = atuais.includes(id)
      ? atuais.filter((item) => item !== id)
      : [...atuais, id];
    setEditor({ ...editor, integracoes_whatsapp_ids: proximos });
  }

  async function salvar() {
    if (!editor) return;
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      const res = await fetch("/api/agentes-ia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editor, acao: "salvar" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao salvar agente.");
      setAgentes(json.agentes || []);
      const atualizado = (json.agentes || []).find((item: Agente) => item.id === editor.id);
      if (atualizado) setEditor(cloneAgente(atualizado));
      setSucesso("Configuração salva.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar agente.");
    } finally {
      setSalvando(false);
    }
  }

  async function adicionarConhecimento() {
    if (!editor || !novoConhecimento.titulo.trim() || !novoConhecimento.conteudo.trim()) return;
    setErro("");
    try {
      const res = await fetch("/api/agentes-ia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editor.id,
          acao: "adicionar_conhecimento",
          ...novoConhecimento,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao adicionar conhecimento.");
      setAgentes(json.agentes || []);
      const atualizado = (json.agentes || []).find((item: Agente) => item.id === editor.id);
      if (atualizado) setEditor(cloneAgente(atualizado));
      setNovoConhecimento({ titulo: "", categoria: "", conteudo: "", palavras_chave: "" });
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao adicionar conhecimento.");
    }
  }

  async function excluirConhecimento(conhecimentoId: string) {
    if (!editor) return;
    setErro("");
    try {
      const res = await fetch("/api/agentes-ia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editor.id, acao: "excluir_conhecimento", conhecimento_id: conhecimentoId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao excluir conhecimento.");
      setAgentes(json.agentes || []);
      const atualizado = (json.agentes || []).find((item: Agente) => item.id === editor.id);
      if (atualizado) setEditor(cloneAgente(atualizado));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao excluir conhecimento.");
    }
  }

  async function arquivar() {
    if (!editor || !window.confirm(`Arquivar o agente “${editor.nome}”?`)) return;
    setErro("");
    try {
      const res = await fetch(`/api/agentes-ia?id=${encodeURIComponent(editor.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao arquivar agente.");
      setSelecionadoId("");
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao arquivar agente.");
    }
  }

  async function testar() {
    if (!editor || !teste.trim()) return;
    setTestando(true);
    setErro("");
    setRespostaTeste("");
    try {
      const res = await fetch("/api/agentes-ia/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editor.id, mensagem: teste }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao testar agente.");
      setRespostaTeste(json.resposta || "Sem resposta.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao testar agente.");
    } finally {
      setTestando(false);
    }
  }

  if (carregando) {
    return (
      <div className={styles.loadingPage}>
        <Loader2 size={24} className={styles.spin} />
        <span>Carregando agentes...</span>
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}><Sparkles size={15} /> Automação inteligente</span>
          <h1>Agentes de IA</h1>
          <p>Configure atendimento conversacional com ferramentas controladas do CRM e fallback seguro para Fluxos.</p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={criarAgente}>
          <Plus size={18} /> Novo agente
        </button>
      </header>

      {(erro || sucesso) && (
        <div className={`${styles.notice} ${erro ? styles.noticeError : styles.noticeSuccess}`}>
          {erro || sucesso}
        </div>
      )}

      <div className={styles.workspace}>
        <aside className={styles.agentList}>
          <div className={styles.listHeader}>
            <strong>Seus agentes</strong>
            <span>{agentes.length}</span>
          </div>

          {agentes.length === 0 ? (
            <div className={styles.emptyList}>
              <Bot size={30} />
              <strong>Nenhum agente criado</strong>
              <p>Crie um agente e mantenha-o em rascunho até concluir as regras.</p>
            </div>
          ) : (
            agentes.map((agente) => (
              <button
                key={agente.id}
                type="button"
                className={`${styles.agentCard} ${agente.id === selecionadoId ? styles.agentCardActive : ""}`}
                onClick={() => setSelecionadoId(agente.id)}
              >
                <span className={styles.agentIcon}><Bot size={19} /></span>
                <span className={styles.agentCardText}>
                  <strong>{agente.nome}</strong>
                  <small>{agente.modelo}</small>
                </span>
                <span className={`${styles.statusDot} ${styles[`status_${agente.status}`]}`} title={agente.status} />
              </button>
            ))
          )}
        </aside>

        <section className={styles.editorArea}>
          {!editor ? (
            <div className={styles.emptyEditor}>
              <Bot size={42} />
              <h2>Crie seu primeiro agente</h2>
              <p>O agente só assume conversas depois de ser ativado.</p>
            </div>
          ) : (
            <>
              <div className={styles.editorTopbar}>
                <div>
                  <span className={styles.badge}><Zap size={13} /> {editor.status}</span>
                  <h2>{editor.nome}</h2>
                </div>
                <div className={styles.topActions}>
                  <button type="button" className={styles.dangerGhost} onClick={arquivar}><Trash2 size={16} /> Arquivar</button>
                  <button type="button" className={styles.primaryButton} onClick={salvar} disabled={salvando}>
                    {salvando ? <Loader2 size={17} className={styles.spin} /> : <Save size={17} />}
                    Salvar
                  </button>
                </div>
              </div>

              <div className={styles.gridTwo}>
                <section className={styles.panel}>
                  <div className={styles.panelTitle}><Bot size={18} /><div><h3>Identidade e comportamento</h3><p>Define como o agente conversa e quando pode ficar ativo.</p></div></div>
                  <div className={styles.formGrid}>
                    <label className={styles.field}><span>Nome</span><input value={editor.nome} onChange={(event) => setEditor({ ...editor, nome: event.target.value })} /></label>
                    <label className={styles.field}><span>Status</span><select value={editor.status} onChange={(event) => setEditor({ ...editor, status: event.target.value as Agente["status"] })}><option value="rascunho">Rascunho</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label>
                    <label className={styles.field}><span>Modelo</span><input value={editor.modelo} onChange={(event) => setEditor({ ...editor, modelo: event.target.value })} placeholder="gpt-5.4-mini" /></label>
                    <label className={styles.field}><span>Tom de voz</span><input value={editor.tom_voz || ""} onChange={(event) => setEditor({ ...editor, tom_voz: event.target.value })} /></label>
                  </div>
                  <label className={styles.field}><span>Descrição interna</span><input value={editor.descricao || ""} onChange={(event) => setEditor({ ...editor, descricao: event.target.value })} placeholder="Ex.: Atendimento comercial e agendamentos" /></label>
                  <label className={styles.field}><span>Prompt principal</span><textarea rows={7} value={editor.prompt_sistema || ""} onChange={(event) => setEditor({ ...editor, prompt_sistema: event.target.value })} placeholder="Explique o papel, limites, oferta e comportamento esperado do agente." /></label>
                  <label className={styles.field}><span>Instruções adicionais</span><textarea rows={4} value={editor.instrucoes || ""} onChange={(event) => setEditor({ ...editor, instrucoes: event.target.value })} placeholder="Regras específicas do negócio que não devem ficar na base de conhecimento." /></label>
                </section>

                <section className={styles.panel}>
                  <div className={styles.panelTitle}><MessageCircle size={18} /><div><h3>Ativação e fallback</h3><p>Escolha em quais números o agente pode assumir a conversa.</p></div></div>
                  <div className={styles.scopeHint}>Sem nenhum número marcado, o agente vale para <strong>todas as integrações WhatsApp</strong> da empresa.</div>
                  <div className={styles.checkList}>
                    {integracoes.map((integracao) => {
                      const checked = (editor.integracoes_whatsapp_ids || []).includes(integracao.id);
                      const nome = integracao.phone_number_display_name || integracao.verified_name || integracao.nome_conexao || "WhatsApp";
                      return (
                        <label key={integracao.id} className={styles.checkRow}>
                          <input type="checkbox" checked={checked} onChange={() => alternarIntegracao(integracao.id)} />
                          <span><strong>{nome}</strong><small>{integracao.numero || integracao.status || "Integração"}</small></span>
                        </label>
                      );
                    })}
                  </div>
                  <label className={styles.field}><span>Fluxo de fallback</span><select value={editor.fallback_fluxo_id || ""} onChange={(event) => setEditor({ ...editor, fallback_fluxo_id: event.target.value || null })}><option value="">Motor de Fluxos atual</option>{fluxos.map((fluxo) => <option key={fluxo.id} value={fluxo.id}>{fluxo.nome}</option>)}</select></label>
                  <div className={styles.formGrid}>
                    <label className={styles.field}><span>Contexto recente</span><input type="number" min={4} max={40} value={editor.max_mensagens_contexto} onChange={(event) => setEditor({ ...editor, max_mensagens_contexto: Number(event.target.value) })} /></label>
                    <label className={styles.field}><span>Debounce (ms)</span><input type="number" min={250} max={10000} step={50} value={editor.debounce_ms} onChange={(event) => setEditor({ ...editor, debounce_ms: Number(event.target.value) })} /></label>
                  </div>
                  <div className={styles.securityNote}><CheckCircle2 size={17} /><span>Quando um humano assume a conversa, o agente é bloqueado. O saldo oficial de tokens também é revalidado antes de cada chamada.</span></div>
                </section>
              </div>

              <section className={styles.panel}>
                <div className={styles.panelTitle}><Wrench size={18} /><div><h3>Ferramentas do agente</h3><p>Somente ferramentas habilitadas são expostas ao modelo. A escrita sempre é validada pelo backend.</p></div></div>
                <div className={styles.toolsGrid}>
                  {FERRAMENTAS.map((ferramenta) => (
                    <div key={ferramenta.tipo} className={`${styles.toolCard} ${ferramentaAtiva(ferramenta.tipo) ? styles.toolCardActive : ""}`}>
                      <label className={styles.toolToggle}>
                        <input type="checkbox" checked={ferramentaAtiva(ferramenta.tipo)} onChange={() => alternarFerramenta(ferramenta.tipo)} />
                        <span className={styles.toggleVisual} />
                      </label>
                      <div><strong>{ferramenta.titulo}</strong><p>{ferramenta.descricao}</p></div>
                      {ferramenta.tipo === "transferir_humano" && ferramentaAtiva(ferramenta.tipo) && (
                        <select className={styles.inlineSelect} value={String(configFerramenta(ferramenta.tipo).setor_id || "")} onChange={(event) => atualizarConfigFerramenta(ferramenta.tipo, "setor_id", event.target.value || null)}>
                          <option value="">Fila geral</option>
                          {setores.map((setor) => <option key={setor.id} value={setor.id}>{setor.nome}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <div className={styles.gridTwo}>
                <section className={styles.panel}>
                  <div className={styles.panelTitle}><BookOpen size={18} /><div><h3>Base de conhecimento</h3><p>Conteúdo aprovado e pesquisável pelo agente. A busca retorna no máximo 5 trechos por consulta.</p></div></div>
                  <div className={styles.knowledgeForm}>
                    <input placeholder="Título" value={novoConhecimento.titulo} onChange={(event) => setNovoConhecimento({ ...novoConhecimento, titulo: event.target.value })} />
                    <input placeholder="Categoria" value={novoConhecimento.categoria} onChange={(event) => setNovoConhecimento({ ...novoConhecimento, categoria: event.target.value })} />
                    <textarea rows={5} placeholder="Conteúdo confiável que o agente pode usar" value={novoConhecimento.conteudo} onChange={(event) => setNovoConhecimento({ ...novoConhecimento, conteudo: event.target.value })} />
                    <input placeholder="Palavras-chave separadas por vírgula" value={novoConhecimento.palavras_chave} onChange={(event) => setNovoConhecimento({ ...novoConhecimento, palavras_chave: event.target.value })} />
                    <button type="button" className={styles.secondaryButton} onClick={adicionarConhecimento}><Plus size={16} /> Adicionar conhecimento</button>
                  </div>
                  <div className={styles.knowledgeList}>
                    {(editor.conhecimentos || []).map((item) => (
                      <article key={item.id} className={styles.knowledgeItem}>
                        <div><strong>{item.titulo}</strong>{item.categoria && <small>{item.categoria}</small>}<p>{item.conteudo}</p></div>
                        <button type="button" onClick={() => excluirConhecimento(item.id)} title="Excluir"><Trash2 size={15} /></button>
                      </article>
                    ))}
                    {!editor.conhecimentos?.length && <div className={styles.emptyKnowledge}>Nenhum conhecimento cadastrado.</div>}
                  </div>
                </section>

                <section className={styles.panel}>
                  <div className={styles.panelTitle}><Sparkles size={18} /><div><h3>Testar agente</h3><p>Simula uma resposta usando o prompt e a base de conhecimento, sem executar ações no CRM.</p></div></div>
                  <div className={styles.testBox}>
                    <textarea rows={5} value={teste} onChange={(event) => setTeste(event.target.value)} placeholder="Ex.: Vocês atendem sábado?" />
                    <button type="button" className={styles.secondaryButton} onClick={testar} disabled={testando || !teste.trim()}>
                      {testando ? <Loader2 size={16} className={styles.spin} /> : <Sparkles size={16} />}
                      Testar resposta
                    </button>
                    {respostaTeste && <div className={styles.testAnswer}><span>Resposta do agente</span><p>{respostaTeste}</p></div>}
                  </div>
                </section>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
