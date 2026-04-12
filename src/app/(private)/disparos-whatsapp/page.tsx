"use client";

import { useEffect, useMemo, useState } from "react";
import CrmShell from "@/components/CrmShell";
import Header from "@/components/Header";
import styles from "./disparos-whatsapp.module.css";
import { can } from "@/lib/permissoes/frontend";

type IntegracaoWhatsApp = {
  id: string;
  nome_conexao: string;
  numero: string | null;
  status: string | null;
  waba_id: string | null;
};

type TemplateComponent = {
  type: string;
  text?: string;
  format?: string;
};

type WhatsAppTemplate = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id: string;
  waba_id: string;
  meta_template_id: string | null;
  nome: string;
  categoria: string;
  idioma: string;
  status: string;
  quality_rating: string | null;
  rejeicao_motivo: string | null;
  payload: {
    name?: string;
    category?: string;
    language?: string;
    components?: TemplateComponent[];
  } | null;
  created_at: string;
  updated_at: string;
};

type PerfilDinamico = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
};

type UsuarioSetorVinculo = {
  id?: string;
  usuario_id: string;
  setor_id: string;
  is_principal?: boolean;
  created_at?: string;
};

type UsuarioLogado = {
  id: string;
  empresa_id?: string | null;
  setores_ids?: string[];
  usuarios_setores?: UsuarioSetorVinculo[];
  setor_principal_id?: string | null;
  permissoes?: string[];
  perfis_dinamicos?: PerfilDinamico[];
};

type ResultadoDisparo = {
  numero: string;
  ok: boolean;
  status?: number;
  message_id?: string | null;
  erro?: string | null;
};

type ContatoOpcao = {
  id: string;
  empresa_id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  origem: string | null;
  campanha: string | null;
  status_lead: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function extrairBody(payload: WhatsAppTemplate["payload"]) {
  const body = payload?.components?.find((item) => item.type === "BODY");
  return body?.text || "";
}

function extrairHeader(payload: WhatsAppTemplate["payload"]) {
  const header = payload?.components?.find((item) => item.type === "HEADER");
  return header?.text || "";
}

function extrairFooter(payload: WhatsAppTemplate["payload"]) {
  const footer = payload?.components?.find((item) => item.type === "FOOTER");
  return footer?.text || "";
}

function contarVariaveisTemplate(template: WhatsAppTemplate | null) {
  if (!template?.payload?.components?.length) return 0;

  const textos = template.payload.components
    .map((item) => item.text || "")
    .join(" ");

  const matches = textos.match(/\{\{\d+\}\}/g) || [];
  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((n) => !Number.isNaN(n));

  if (numeros.length === 0) return 0;
  return Math.max(...numeros);
}

function formatarStatusIntegracao(status?: string | null) {
  if (!status) return "Sem status";

  switch (status.toLowerCase()) {
    case "ativo":
      return "Ativo";
    case "conectado":
      return "Conectado";
    case "inativo":
      return "Inativo";
    default:
      return status;
  }
}

function getTemplateStatusLabel(status: string | null | undefined) {
  if (!status) return "Sem status";

  switch (status.toUpperCase()) {
    case "PENDING":
      return "Em análise";
    case "APPROVED":
      return "Aprovado";
    case "REJECTED":
      return "Rejeitado";
    case "PAUSED":
      return "Pausado";
    case "DISABLED":
      return "Desativado";
    case "ARCHIVED":
      return "Arquivado";
    case "ERRO_ENVIO":
      return "Erro no envio";
    default:
      return status;
  }
}

function getTemplateStatusClass(status: string | null | undefined) {
  if (!status) return styles.badgeGray;

  switch (status.toUpperCase()) {
    case "PENDING":
      return styles.badgeYellow;
    case "APPROVED":
      return styles.badgeGreen;
    case "REJECTED":
      return styles.badgeRed;
    case "PAUSED":
    case "DISABLED":
    case "ARCHIVED":
      return styles.badgeGray;
    default:
      return styles.badgeBlue;
  }
}

function limparNumero(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "");
}

export default function DisparosWhatsAppPage() {
  const [usuarioLogado, setUsuarioLogado] = useState<UsuarioLogado | null>(null);

  const [integracoes, setIntegracoes] = useState<IntegracaoWhatsApp[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [contatos, setContatos] = useState<ContatoOpcao[]>([]);
  const [contatosSelecionados, setContatosSelecionados] = useState<ContatoOpcao[]>([]);

  const [loadingUsuario, setLoadingUsuario] = useState(true);
  const [loadingIntegracoes, setLoadingIntegracoes] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingContatos, setLoadingContatos] = useState(false);
  const [disparando, setDisparando] = useState(false);

  const [integracaoId, setIntegracaoId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [buscaContato, setBuscaContato] = useState("");

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [resultado, setResultado] = useState<ResultadoDisparo[]>([]);

  async function carregarUsuarioLogado() {
    try {
      setLoadingUsuario(true);

      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar usuário logado.");
      }

      setUsuarioLogado(data.usuario || null);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar usuário logado.");
    } finally {
      setLoadingUsuario(false);
    }
  }

  async function carregarIntegracoes() {
    try {
      setLoadingIntegracoes(true);
      setErro("");

      const res = await fetch("/api/integracoes-whatsapp", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar integrações.");
      }

      setIntegracoes(Array.isArray(json.data) ? json.data : []);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar integrações.");
    } finally {
      setLoadingIntegracoes(false);
    }
  }

  async function carregarTemplates(integracaoSelecionadaId: string) {
    try {
      if (!integracaoSelecionadaId) {
        setTemplates([]);
        return;
      }

      setLoadingTemplates(true);
      setErro("");

      const res = await fetch(
        `/api/whatsapp/templates?integracao_whatsapp_id=${encodeURIComponent(
          integracaoSelecionadaId
        )}`,
        { cache: "no-store" }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar templates.");
      }

      const lista = Array.isArray(json.data) ? json.data : [];
      const aprovados = lista.filter(
        (item: WhatsAppTemplate) => item.status?.toUpperCase() === "APPROVED"
      );

      setTemplates(aprovados);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function carregarContatos(busca = "") {
    try {
      setLoadingContatos(true);
      setErro("");

      const query = busca.trim()
        ? `?busca=${encodeURIComponent(busca.trim())}`
        : "";

      const res = await fetch(`/api/contatos/opcoes${query}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar contatos.");
      }

      const lista = Array.isArray(json.contatos) ? json.contatos : [];
      setContatos(lista);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar contatos.");
    } finally {
      setLoadingContatos(false);
    }
  }

  useEffect(() => {
    carregarUsuarioLogado();
    carregarIntegracoes();
    carregarContatos();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarContatos(buscaContato);
    }, 300);

    return () => clearTimeout(timer);
  }, [buscaContato]);

  useEffect(() => {
    setTemplateId("");
    setResultado([]);
    setMensagem("");
    setErro("");

    if (integracaoId) {
      carregarTemplates(integracaoId);
    } else {
      setTemplates([]);
    }
  }, [integracaoId]);

  const permissoes = usuarioLogado?.permissoes || [];
  const nomesPerfisDinamicos = Array.isArray(usuarioLogado?.perfis_dinamicos)
    ? usuarioLogado!.perfis_dinamicos!.map((perfil) => perfil.nome)
    : [];

  const ehAdministrador = nomesPerfisDinamicos.includes("Administrador");

  const podeDisparar =
    ehAdministrador ||
    can(permissoes, "whatsapp.disparos.enviar") ||
    can(permissoes, "mensagens.enviar");

  const integracaoSelecionada = useMemo(() => {
    return integracoes.find((item) => item.id === integracaoId) || null;
  }, [integracoes, integracaoId]);

  const templateSelecionado = useMemo(() => {
    return templates.find((item) => item.id === templateId) || null;
  }, [templates, templateId]);

  const totalVariaveis = useMemo(() => {
    return contarVariaveisTemplate(templateSelecionado);
  }, [templateSelecionado]);

  const contatosDisponiveis = useMemo(() => {
    const idsSelecionados = new Set(contatosSelecionados.map((item) => item.id));
    return contatos.filter((item) => !idsSelecionados.has(item.id));
  }, [contatos, contatosSelecionados]);

  function adicionarContato(contato: ContatoOpcao) {
    const telefone = limparNumero(contato.telefone);

    if (!telefone || telefone.length < 10) {
      setErro("Este contato não possui telefone válido para disparo.");
      return;
    }

    setErro("");
    setContatosSelecionados((prev) => {
      if (prev.some((item) => item.id === contato.id)) return prev;
      return [...prev, contato];
    });
  }

  function removerContato(contatoId: string) {
    setContatosSelecionados((prev) => prev.filter((item) => item.id !== contatoId));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMensagem("");
    setErro("");
    setResultado([]);

    if (!podeDisparar) {
      setErro("Você não tem permissão para realizar disparos.");
      return;
    }

    if (!integracaoId) {
      setErro("Selecione a integração WhatsApp.");
      return;
    }

    if (!templateId) {
      setErro("Selecione o template.");
      return;
    }

    if (contatosSelecionados.length === 0) {
      setErro("Selecione pelo menos um contato.");
      return;
    }

    try {
      setDisparando(true);

      const destinatarios = contatosSelecionados.map((contato) => ({
        numero: limparNumero(contato.telefone),
        variaveis: totalVariaveis > 0
          ? [
              contato.nome || "Cliente",
              contato.campanha || contato.status_lead || contato.telefone || "",
            ].slice(0, totalVariaveis)
          : [],
      }));

      const res = await fetch("/api/whatsapp/disparos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integracao_whatsapp_id: integracaoId,
          template_id: templateId,
          destinatarios,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao realizar disparo.");
      }

      setResultado(Array.isArray(json.resultados) ? json.resultados : []);

      const sucesso = Array.isArray(json.resultados)
        ? json.resultados.filter((item: ResultadoDisparo) => item.ok).length
        : 0;

      const falha = Array.isArray(json.resultados)
        ? json.resultados.filter((item: ResultadoDisparo) => !item.ok).length
        : 0;

      setMensagem(`Disparo concluído. Sucesso: ${sucesso}. Falhas: ${falha}.`);
    } catch (error: any) {
      setErro(error?.message || "Erro ao realizar disparo.");
    } finally {
      setDisparando(false);
    }
  }

  return (
    <CrmShell>
      <Header
        title="Disparos WhatsApp"
        subtitle="Selecione a integração, o template aprovado e os contatos salvos para disparar mensagens."
      />

      <div className={styles.pageContent}>
        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Operação</p>
                <h2 className={styles.cardTitle}>Novo disparo</h2>
                <p className={styles.cardSubtitle}>
                  Processo simples: escolha a integração, o template e selecione os contatos salvos no CRM.
                </p>
              </div>
            </div>

            {loadingUsuario || loadingIntegracoes ? (
              <div className={styles.emptyState}>Carregando dados...</div>
            ) : !podeDisparar ? (
              <div className={styles.errorAlert}>
                Você não tem permissão para acessar esta funcionalidade.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.field}>
                  <label className={styles.label}>Integração WhatsApp</label>
                  <select
                    value={integracaoId}
                    onChange={(e) => setIntegracaoId(e.target.value)}
                    className={styles.input}
                  >
                    <option value="">Selecione uma integração</option>
                    {integracoes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome_conexao} {item.numero ? `- ${item.numero}` : ""}
                      </option>
                    ))}
                  </select>

                  {integracaoSelecionada ? (
                    <div className={styles.infoBox}>
                      <div>
                        <strong>Status:</strong>{" "}
                        {formatarStatusIntegracao(integracaoSelecionada.status)}
                      </div>
                      <div>
                        <strong>WABA ID:</strong> {integracaoSelecionada.waba_id || "-"}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Template aprovado</label>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className={styles.input}
                    disabled={!integracaoId || loadingTemplates}
                  >
                    <option value="">
                      {!integracaoId
                        ? "Selecione a integração primeiro"
                        : loadingTemplates
                        ? "Carregando templates..."
                        : "Selecione um template"}
                    </option>

                    {templates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} - {getTemplateStatusLabel(item.status)}
                      </option>
                    ))}
                  </select>
                </div>

                {templateSelecionado ? (
                  <div className={styles.previewCard}>
                    <div className={styles.previewHeader}>
                      <div>
                        <h3 className={styles.previewTitle}>
                          {templateSelecionado.nome}
                        </h3>
                        <p className={styles.previewSubtitle}>
                          Categoria: {templateSelecionado.categoria} • Idioma:{" "}
                          {templateSelecionado.idioma}
                        </p>
                      </div>

                      <span
                        className={`${styles.badge} ${getTemplateStatusClass(
                          templateSelecionado.status
                        )}`}
                      >
                        {getTemplateStatusLabel(templateSelecionado.status)}
                      </span>
                    </div>

                    {extrairHeader(templateSelecionado.payload) ? (
                      <div className={styles.previewBlock}>
                        <span className={styles.previewLabel}>Header</span>
                        <p className={styles.previewText}>
                          {extrairHeader(templateSelecionado.payload)}
                        </p>
                      </div>
                    ) : null}

                    <div className={styles.previewBlock}>
                      <span className={styles.previewLabel}>Body</span>
                      <p className={styles.previewText}>
                        {extrairBody(templateSelecionado.payload)}
                      </p>
                    </div>

                    {extrairFooter(templateSelecionado.payload) ? (
                      <div className={styles.previewBlock}>
                        <span className={styles.previewLabel}>Footer</span>
                        <p className={styles.previewText}>
                          {extrairFooter(templateSelecionado.payload)}
                        </p>
                      </div>
                    ) : null}

                    <div className={styles.templateHint}>
                      Este template usa <strong>{totalVariaveis}</strong> variável(is).
                      No modelo atual, se existir variável, o sistema envia:
                      <strong> {"{{1}}"}</strong> = nome do contato e
                      <strong> {" {{2}}"}</strong> = campanha, status lead ou telefone.
                    </div>
                  </div>
                ) : null}

                <div className={styles.field}>
                  <label className={styles.label}>Buscar contatos salvos</label>
                  <input
                    value={buscaContato}
                    onChange={(e) => setBuscaContato(e.target.value)}
                    className={styles.input}
                    placeholder="Busque por nome, telefone, email, campanha..."
                  />
                </div>

                <div className={styles.contactsSection}>
                  <div className={styles.contactsColumn}>
                    <div className={styles.contactsHeader}>
                      <h3 className={styles.contactsTitle}>Contatos disponíveis</h3>
                      <span className={styles.contactsCount}>
                        {loadingContatos ? "Carregando..." : contatosDisponiveis.length}
                      </span>
                    </div>

                    <div className={styles.contactsList}>
                      {loadingContatos ? (
                        <div className={styles.emptyMiniState}>Carregando contatos...</div>
                      ) : contatosDisponiveis.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          Nenhum contato disponível.
                        </div>
                      ) : (
                        contatosDisponiveis.map((contato) => (
                          <div key={contato.id} className={styles.contactCard}>
                            <div className={styles.contactMain}>
                              <strong className={styles.contactName}>
                                {contato.nome || "Sem nome"}
                              </strong>
                              <p className={styles.contactMeta}>
                                {contato.telefone || "Sem telefone"}
                              </p>
                              {contato.email ? (
                                <p className={styles.contactMeta}>{contato.email}</p>
                              ) : null}
                              <div className={styles.contactBadges}>
                                {contato.origem ? (
                                  <span className={styles.contactBadge}>
                                    {contato.origem}
                                  </span>
                                ) : null}
                                {contato.status_lead ? (
                                  <span className={styles.contactBadge}>
                                    {contato.status_lead}
                                  </span>
                                ) : null}
                                {contato.campanha ? (
                                  <span className={styles.contactBadge}>
                                    {contato.campanha}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => adicionarContato(contato)}
                            >
                              Adicionar
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={styles.contactsColumn}>
                    <div className={styles.contactsHeader}>
                      <h3 className={styles.contactsTitle}>Selecionados para disparo</h3>
                      <span className={styles.contactsCount}>
                        {contatosSelecionados.length}
                      </span>
                    </div>

                    <div className={styles.contactsList}>
                      {contatosSelecionados.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          Nenhum contato selecionado.
                        </div>
                      ) : (
                        contatosSelecionados.map((contato) => (
                          <div key={contato.id} className={styles.contactCardSelected}>
                            <div className={styles.contactMain}>
                              <strong className={styles.contactName}>
                                {contato.nome || "Sem nome"}
                              </strong>
                              <p className={styles.contactMeta}>
                                {contato.telefone || "Sem telefone"}
                              </p>
                              {contato.email ? (
                                <p className={styles.contactMeta}>{contato.email}</p>
                              ) : null}
                            </div>

                            <button
                              type="button"
                              className={styles.removeButton}
                              onClick={() => removerContato(contato.id)}
                            >
                              Remover
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.summaryGrid}>
                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Contatos selecionados</span>
                    <strong className={styles.summaryValue}>
                      {contatosSelecionados.length}
                    </strong>
                  </div>

                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Template</span>
                    <strong className={styles.summaryValueSmall}>
                      {templateSelecionado?.nome || "Não selecionado"}
                    </strong>
                  </div>

                  <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Variáveis</span>
                    <strong className={styles.summaryValue}>{totalVariaveis}</strong>
                  </div>
                </div>

                {mensagem ? <div className={styles.successAlert}>{mensagem}</div> : null}
                {erro ? <div className={styles.errorAlert}>{erro}</div> : null}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      setContatosSelecionados([]);
                      setResultado([]);
                      setMensagem("");
                      setErro("");
                    }}
                    disabled={disparando}
                  >
                    Limpar seleção
                  </button>

                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={disparando}
                  >
                    {disparando ? "Disparando..." : "Disparar mensagens"}
                  </button>
                </div>
              </form>
            )}
          </section>

          <aside className={styles.resultsCard}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Retorno</p>
                <h2 className={styles.cardTitle}>Resultado do disparo</h2>
                <p className={styles.cardSubtitle}>
                  Veja rapidamente o que foi enviado com sucesso e o que falhou.
                </p>
              </div>
            </div>

            {resultado.length === 0 ? (
              <div className={styles.emptyState}>
                Nenhum disparo realizado ainda nesta tela.
              </div>
            ) : (
              <div className={styles.resultsList}>
                {resultado.map((item, index) => (
                  <div
                    key={`${item.numero}-${index}`}
                    className={`${styles.resultItem} ${
                      item.ok ? styles.resultSuccess : styles.resultError
                    }`}
                  >
                    <div className={styles.resultTop}>
                      <strong>{item.numero}</strong>
                      <span className={styles.resultStatus}>
                        {item.ok ? "Enviado" : "Falhou"}
                      </span>
                    </div>

                    {item.message_id ? (
                      <p className={styles.resultText}>
                        <strong>Message ID:</strong> {item.message_id}
                      </p>
                    ) : null}

                    {item.erro ? (
                      <p className={styles.resultText}>
                        <strong>Erro:</strong> {item.erro}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </CrmShell>
  );
}