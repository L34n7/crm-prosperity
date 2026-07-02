"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Copy,
  ExternalLink,
  KeyRound,
  Power,
  RadioTower,
  RefreshCw,
  Send,
  SquareCheckBig,
  UploadCloud,
} from "lucide-react";
import {
  CANAIS_IMOBILIARIOS,
  getStatusPublicacaoLabel,
} from "@/lib/imoveis/publicacao";
import styles from "./imoveis.module.css";

export type PublicacaoImovelResumo = {
  id: string;
  imovel_id: string;
  canal_codigo: string;
  canal_nome: string;
  modo_integracao: string;
  status: string;
  erro: string | null;
  external_url: string | null;
  updated_at: string;
};

export type ImovelIntegracaoResumo = {
  id: string;
  titulo: string;
  codigo: string | null;
  bairro: string | null;
  cidade: string | null;
  publicacoes?: PublicacaoImovelResumo[];
  total_leads_portal?: number;
};

type LeadPortal = {
  id: string;
  canal_nome: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  mensagem: string | null;
  recebido_em: string;
  imovel?: {
    titulo: string | null;
    codigo: string | null;
  } | null;
};

type ImovelExterno = {
  id: string;
  canal_nome: string;
  codigo: string | null;
  titulo: string;
  external_url: string | null;
  imagem_url: string | null;
  tipo: string | null;
  finalidade: string | null;
  status_origem: string | null;
  valor: number | string | null;
  bairro: string | null;
  cidade: string | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
  area_m2: number | string | null;
  recebido_em: string;
};

type IntegracaoWebhook = {
  id: string;
  nome: string;
  canal_codigo: string;
  status: "ativo" | "inativo";
  token_hint: string;
  ultimo_evento_em: string | null;
  webhook_url: string;
};

type CredencialWebhook = {
  integracaoId: string;
  secret: string;
};

type IntegracoesImobiliariasProps = {
  imoveis: ImovelIntegracaoResumo[];
  permissoes: string[];
  onChanged: () => Promise<void>;
  onError: (mensagem: string) => void;
  onMessage: (mensagem: string) => void;
};

const LEAD_INICIAL = {
  canal_codigo: "grupo_olx",
  imovel_id: "",
  nome: "",
  email: "",
  telefone: "",
  mensagem: "",
};

const EXTERNO_INICIAL = {
  canal_codigo: "grupo_olx",
  external_id: "",
  external_url: "",
  titulo: "",
  tipo: "apartamento",
  finalidade: "venda",
  valor: "",
  bairro: "",
  cidade: "",
  estado: "",
};

function formatarData(valor: string | null | undefined) {
  if (!valor) return "";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function formatarMoeda(valor: number | string | null) {
  const numero = Number(valor ?? 0);
  if (!Number.isFinite(numero) || numero <= 0) return "Valor nao informado";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numero);
}

function getStatusClass(status: string | null | undefined) {
  if (status === "publicado") return styles.statusSuccess;
  if (status === "rejeitado") return styles.statusDanger;
  if (status === "despublicado") return styles.statusMuted;
  if (status === "pendente" || status === "em_analise") {
    return styles.statusWarning;
  }
  return "";
}

export default function IntegracoesImobiliarias({
  imoveis,
  permissoes,
  onChanged,
  onError,
  onMessage,
}: IntegracoesImobiliariasProps) {
  const [imovelSelecionadoId, setImovelSelecionadoId] = useState("");
  const [processando, setProcessando] = useState("");
  const [carregandoApoio, setCarregandoApoio] = useState(false);
  const [salvandoLead, setSalvandoLead] = useState(false);
  const [salvandoExterno, setSalvandoExterno] = useState(false);
  const [leadForm, setLeadForm] = useState(LEAD_INICIAL);
  const [externoForm, setExternoForm] = useState(EXTERNO_INICIAL);
  const [leads, setLeads] = useState<LeadPortal[]>([]);
  const [externos] = useState<ImovelExterno[]>([]);
  const [integracoesWebhook, setIntegracoesWebhook] = useState<
    IntegracaoWebhook[]
  >([]);
  const [nomeParceiro, setNomeParceiro] = useState("");
  const [configurandoWebhook, setConfigurandoWebhook] = useState("");
  const [credencialWebhook, setCredencialWebhook] =
    useState<CredencialWebhook | null>(null);

  const podePublicar = permissoes.includes("imoveis.publicar");
  const podeGerenciarLeads = permissoes.includes("imoveis.leads_gerenciar");
  const podeImportar = permissoes.includes("imoveis.importar");
  const mostrarImportacaoManual = false;

  const imovelSelecionado = useMemo(() => {
    return (
      imoveis.find((imovel) => imovel.id === imovelSelecionadoId) ??
      imoveis[0] ??
      null
    );
  }, [imoveis, imovelSelecionadoId]);

  const publicacoesPorCanal = useMemo(() => {
    return new Map(
      (imovelSelecionado?.publicacoes ?? []).map((publicacao) => [
        publicacao.canal_codigo,
        publicacao,
      ])
    );
  }, [imovelSelecionado]);

  const carregarApoio = useCallback(async () => {
    setCarregandoApoio(true);

    try {
      const [leadsResponse, webhookResponse] = await Promise.all([
        fetch("/api/imoveis/leads-portais?limite=8", { cache: "no-store" }),
        podeImportar
          ? fetch("/api/imoveis/integracoes-webhook", { cache: "no-store" })
          : Promise.resolve(null),
      ]);
      const [leadsData, webhookData] = await Promise.all([
        leadsResponse.json(),
        webhookResponse?.json() ?? Promise.resolve(null),
      ]);

      if (!leadsResponse.ok) {
        throw new Error(leadsData?.error || "Erro ao carregar leads.");
      }

      if (webhookResponse && !webhookResponse.ok) {
        throw new Error(
          webhookData?.error || "Erro ao carregar webhooks de imoveis."
        );
      }

      setLeads(leadsData.leads ?? []);
      setIntegracoesWebhook(webhookData?.integracoes ?? []);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao carregar integracoes imobiliarias."
      );
    } finally {
      setCarregandoApoio(false);
    }
  }, [onError, podeImportar]);

  useEffect(() => {
    if (!imovelSelecionadoId && imoveis[0]?.id) {
      setImovelSelecionadoId(imoveis[0].id);
    }
  }, [imoveis, imovelSelecionadoId]);

  useEffect(() => {
    void carregarApoio();
  }, [carregarApoio]);

  async function executarPublicacao(
    canalCodigo: string,
    acao: "publicar" | "despublicar" | "marcar_publicado"
  ) {
    if (!imovelSelecionado) {
      onError("Selecione um imovel para publicar.");
      return;
    }

    const chave = `${imovelSelecionado.id}:${canalCodigo}:${acao}`;
    setProcessando(chave);
    onError("");

    try {
      const response = await fetch(
        `/api/imoveis/${imovelSelecionado.id}/publicacoes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canal_codigo: canalCodigo,
            acao,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || data?.message || "Erro ao processar publicacao."
        );
      }

      onMessage(data.message || "Publicacao atualizada.");
      await onChanged();
      await carregarApoio();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao processar publicacao."
      );
    } finally {
      setProcessando("");
    }
  }

  async function salvarLead() {
    setSalvandoLead(true);
    onError("");

    try {
      const response = await fetch("/api/imoveis/leads-portais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...leadForm,
          imovel_id: leadForm.imovel_id,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao registrar lead.");
      }

      setLeadForm(LEAD_INICIAL);
      onMessage(data.message || "Lead registrado.");
      await carregarApoio();
      await onChanged();
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Erro ao registrar lead."
      );
    } finally {
      setSalvandoLead(false);
    }
  }

  async function salvarExterno() {
    setSalvandoExterno(true);
    onError("");

    try {
      const response = await fetch("/api/imoveis/externos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(externoForm),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao registrar imovel externo.");
      }

      setExternoForm(EXTERNO_INICIAL);
      onMessage(data.message || "Imovel externo registrado.");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao registrar imovel externo."
      );
    } finally {
      setSalvandoExterno(false);
    }
  }

  async function configurarWebhook(integracao?: IntegracaoWebhook) {
    const nome = nomeParceiro.trim();

    if (!integracao && nome.length < 2) {
      onError("Informe o nome da empresa de origem.");
      return;
    }

    if (
      integracao &&
      !window.confirm(
        `Gerar um novo segredo para "${integracao.nome}"? O segredo atual deixara de funcionar.`
      )
    ) {
      return;
    }

    setConfigurandoWebhook(integracao?.id ?? "novo");
    setCredencialWebhook(null);
    onError("");

    try {
      const response = await fetch("/api/imoveis/integracoes-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integracao_id: integracao?.id,
          nome: integracao?.nome ?? nome,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao configurar o webhook.");
      }

      setCredencialWebhook({
        integracaoId: data.integracao.id,
        secret: data.secret,
      });
      setNomeParceiro("");
      onMessage(
        integracao
          ? "Novo segredo gerado. Copie antes de sair da pagina."
          : "Webhook criado. Copie a URL e o segredo."
      );
      await carregarApoio();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao configurar o webhook."
      );
    } finally {
      setConfigurandoWebhook("");
    }
  }

  async function copiarTexto(valor: string, descricao: string) {
    try {
      await navigator.clipboard.writeText(valor);
      onMessage(`${descricao} copiado.`);
    } catch {
      onError(`Nao foi possivel copiar ${descricao.toLowerCase()}.`);
    }
  }

  async function desativarWebhook(integracao: IntegracaoWebhook) {
    if (
      !window.confirm(
        `Desativar o webhook de "${integracao.nome}"? Novos eventos serao recusados.`
      )
    ) {
      return;
    }

    setConfigurandoWebhook(integracao.id);
    onError("");

    try {
      const response = await fetch("/api/imoveis/integracoes-webhook", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integracao_id: integracao.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao desativar o webhook.");
      }

      if (credencialWebhook?.integracaoId === integracao.id) {
        setCredencialWebhook(null);
      }

      onMessage(data.message || "Webhook desativado.");
      await carregarApoio();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao desativar o webhook."
      );
    } finally {
      setConfigurandoWebhook("");
    }
  }

  return (
    <>
      <section className={styles.twoColumns}>
        <div className={styles.contentCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Publicacao multiportal</span>
              <h2>Fila de portais</h2>
              <p>
                Gere o envio por canal e acompanhe o status operacional ate a
                homologacao do portal.
              </p>
            </div>
            <span className={styles.badge}>
              {CANAIS_IMOBILIARIOS.length} canais
            </span>
          </div>

          <label className={`${styles.field} ${styles.fullField}`}>
            <span>Imovel</span>
            <select
              value={imovelSelecionado?.id ?? ""}
              onChange={(event) => setImovelSelecionadoId(event.target.value)}
            >
              {imoveis.map((imovel) => (
                <option key={imovel.id} value={imovel.id}>
                  {imovel.codigo ? `${imovel.codigo} - ` : ""}
                  {imovel.titulo}
                </option>
              ))}
            </select>
          </label>

          {!imovelSelecionado ? (
            <div className={styles.empty}>
              Cadastre um imovel para liberar a publicacao em portais.
            </div>
          ) : (
            <div className={styles.portalList}>
              {CANAIS_IMOBILIARIOS.map((canal) => {
                const publicacao = publicacoesPorCanal.get(canal.codigo);
                const status = publicacao?.status ?? null;
                const statusLabel = getStatusPublicacaoLabel(status);
                const processandoCanal = processando.startsWith(
                  `${imovelSelecionado.id}:${canal.codigo}:`
                );

                return (
                  <div key={canal.codigo} className={styles.portalRow}>
                    <div className={styles.portalInfo}>
                      <span className={styles.portalIcon}>
                        <RadioTower size={18} strokeWidth={2.2} />
                      </span>
                      <div>
                        <strong>{canal.nome}</strong>
                        <small>
                          {canal.modo.toUpperCase()} · {canal.descricao}
                        </small>
                      </div>
                    </div>

                    <div className={styles.portalState}>
                      <span
                        className={`${styles.statusBadge} ${getStatusClass(
                          status
                        )}`}
                      >
                        {statusLabel}
                      </span>
                      {publicacao?.updated_at ? (
                        <small>{formatarData(publicacao.updated_at)}</small>
                      ) : null}
                      {publicacao?.erro ? (
                        <small className={styles.dangerText}>
                          {publicacao.erro}
                        </small>
                      ) : null}
                    </div>

                    <div className={styles.portalActions}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={!podePublicar || processandoCanal}
                        onClick={() =>
                          void executarPublicacao(canal.codigo, "publicar")
                        }
                      >
                        <Send size={16} strokeWidth={2.2} />
                        Enviar
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={!podePublicar || processandoCanal}
                        onClick={() =>
                          void executarPublicacao(
                            canal.codigo,
                            "marcar_publicado"
                          )
                        }
                      >
                        <SquareCheckBig size={16} strokeWidth={2.2} />
                        Publicado
                      </button>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        disabled={!podePublicar || processandoCanal}
                        onClick={() =>
                          void executarPublicacao(
                            canal.codigo,
                            "despublicar"
                          )
                        }
                      >
                        Despublicar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className={styles.formCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Entrada de leads</span>
              <h2>Registrar lead de portal</h2>
              <p>Use este formulario ate o webhook oficial do portal entrar.</p>
            </div>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Canal</span>
              <select
                value={leadForm.canal_codigo}
                onChange={(event) =>
                  setLeadForm((atual) => ({
                    ...atual,
                    canal_codigo: event.target.value,
                  }))
                }
              >
                {CANAIS_IMOBILIARIOS.map((canal) => (
                  <option key={canal.codigo} value={canal.codigo}>
                    {canal.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Imovel</span>
              <select
                value={leadForm.imovel_id}
                onChange={(event) =>
                  setLeadForm((atual) => ({
                    ...atual,
                    imovel_id: event.target.value,
                  }))
                }
              >
                <option value="">Sem vinculo</option>
                {imoveis.map((imovel) => (
                  <option key={imovel.id} value={imovel.id}>
                    {imovel.titulo}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Nome *</span>
              <input
                value={leadForm.nome}
                onChange={(event) =>
                  setLeadForm((atual) => ({
                    ...atual,
                    nome: event.target.value,
                  }))
                }
              />
            </label>

            <label className={styles.field}>
              <span>Telefone</span>
              <input
                value={leadForm.telefone}
                onChange={(event) =>
                  setLeadForm((atual) => ({
                    ...atual,
                    telefone: event.target.value,
                  }))
                }
              />
            </label>

            <label className={`${styles.field} ${styles.fullField}`}>
              <span>Email</span>
              <input
                value={leadForm.email}
                onChange={(event) =>
                  setLeadForm((atual) => ({
                    ...atual,
                    email: event.target.value,
                  }))
                }
              />
            </label>

            <label className={`${styles.field} ${styles.fullField}`}>
              <span>Mensagem</span>
              <textarea
                value={leadForm.mensagem}
                onChange={(event) =>
                  setLeadForm((atual) => ({
                    ...atual,
                    mensagem: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <button
            type="button"
            className={styles.primaryButton}
            disabled={!podeGerenciarLeads || salvandoLead}
            onClick={() => void salvarLead()}
          >
            <ArrowDownToLine size={16} strokeWidth={2.2} />
            {salvandoLead ? "Registrando..." : "Registrar lead"}
          </button>

          {!podeGerenciarLeads ? (
            <p className={styles.muted}>
              Seu usuario nao possui permissao para gerenciar leads de portal.
            </p>
          ) : null}
        </aside>
      </section>

      <section className={styles.twoColumns}>
        <div className={styles.contentCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Leads recentes</span>
              <h2>Retorno dos portais</h2>
              <p>
                {carregandoApoio
                  ? "Atualizando registros..."
                  : `${leads.length} leads carregados.`}
              </p>
            </div>
          </div>

          {leads.length === 0 ? (
            <div className={styles.empty}>
              Nenhum lead de portal registrado ainda.
            </div>
          ) : (
            <div className={styles.compactList}>
              {leads.map((lead) => (
                <div key={lead.id} className={styles.compactItem}>
                  <div>
                    <strong>{lead.nome}</strong>
                    <span>
                      {lead.canal_nome}
                      {lead.imovel?.titulo ? ` · ${lead.imovel.titulo}` : ""}
                    </span>
                    {lead.mensagem ? <small>{lead.mensagem}</small> : null}
                  </div>
                  <div className={styles.compactMeta}>
                    <span>{lead.telefone || lead.email || "Sem contato"}</span>
                    <small>{formatarData(lead.recebido_em)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className={styles.formCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Integração de entrada</span>
              <h2>Recebimento por parceiros</h2>
              <p>
                Os imóveis recebidos aparecem no catálogo global e nunca são
                adicionados à carteira da empresa.
              </p>
            </div>
          </div>

          <div className={styles.webhookSetup}>
            <div className={styles.webhookSetupHeader}>
              <div>
                <strong>Webhook de entrada</strong>
                <small>
                  O nome informado identifica a empresa de origem no catálogo.
                </small>
              </div>
              <KeyRound size={19} strokeWidth={2.1} />
            </div>

            {integracoesWebhook.map((integracao) => (
              <div key={integracao.id} className={styles.webhookIntegration}>
                <div className={styles.webhookIntegrationTitle}>
                  <strong>{integracao.nome}</strong>
                  <span
                    className={`${styles.statusBadge} ${
                      integracao.status === "ativo"
                        ? styles.statusSuccess
                        : styles.statusMuted
                    }`}
                  >
                    {integracao.status === "ativo" ? "Ativo" : "Inativo"}
                  </span>
                </div>

                <label className={styles.field}>
                  <span>URL do webhook</span>
                  <div className={styles.copyField}>
                    <input readOnly value={integracao.webhook_url} />
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() =>
                        void copiarTexto(
                          integracao.webhook_url,
                          "URL do webhook"
                        )
                      }
                      aria-label="Copiar URL do webhook"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </label>

                {credencialWebhook?.integracaoId === integracao.id ? (
                  <label className={styles.field}>
                    <span>Segredo — exibido somente agora</span>
                    <div className={styles.copyField}>
                      <input
                        readOnly
                        value={credencialWebhook.secret}
                        className={styles.secretInput}
                      />
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() =>
                          void copiarTexto(
                            credencialWebhook.secret,
                            "Segredo do webhook"
                          )
                        }
                        aria-label="Copiar segredo do webhook"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </label>
                ) : (
                  <small>
                    Segredo atual termina em <code>{integracao.token_hint}</code>.
                  </small>
                )}

                <div className={styles.webhookIntegrationFooter}>
                  <small>
                    {integracao.ultimo_evento_em
                      ? `Ultimo evento: ${formatarData(
                          integracao.ultimo_evento_em
                        )}`
                      : "Nenhum evento recebido."}
                  </small>
                  <div className={styles.webhookActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={configurandoWebhook === integracao.id}
                      onClick={() => void configurarWebhook(integracao)}
                    >
                      <RefreshCw size={15} />
                      {integracao.status === "ativo"
                        ? "Trocar segredo"
                        : "Reativar"}
                    </button>
                    {integracao.status === "ativo" ? (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        disabled={configurandoWebhook === integracao.id}
                        onClick={() => void desativarWebhook(integracao)}
                      >
                        <Power size={15} />
                        Desativar
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            <label className={styles.field}>
              <span>Nome da empresa de origem</span>
              <input
                value={nomeParceiro}
                placeholder="Ex.: Imobiliária Horizonte"
                onChange={(event) => setNomeParceiro(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={
                !podeImportar ||
                configurandoWebhook === "novo" ||
                nomeParceiro.trim().length < 2
              }
              onClick={() => void configurarWebhook()}
            >
              <KeyRound size={16} />
              {configurandoWebhook === "novo"
                ? "Gerando..."
                : "Gerar novo webhook"}
            </button>
          </div>

          {mostrarImportacaoManual ? (
            <>
              <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Canal</span>
              <select
                value={externoForm.canal_codigo}
                onChange={(event) =>
                  setExternoForm((atual) => ({
                    ...atual,
                    canal_codigo: event.target.value,
                  }))
                }
              >
                {CANAIS_IMOBILIARIOS.map((canal) => (
                  <option key={canal.codigo} value={canal.codigo}>
                    {canal.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>ID externo</span>
              <input
                value={externoForm.external_id}
                onChange={(event) =>
                  setExternoForm((atual) => ({
                    ...atual,
                    external_id: event.target.value,
                  }))
                }
              />
            </label>

            <label className={`${styles.field} ${styles.fullField}`}>
              <span>Titulo *</span>
              <input
                value={externoForm.titulo}
                onChange={(event) =>
                  setExternoForm((atual) => ({
                    ...atual,
                    titulo: event.target.value,
                  }))
                }
              />
            </label>

            <label className={styles.field}>
              <span>Valor</span>
              <input
                value={externoForm.valor}
                onChange={(event) =>
                  setExternoForm((atual) => ({
                    ...atual,
                    valor: event.target.value,
                  }))
                }
              />
            </label>

            <label className={styles.field}>
              <span>UF</span>
              <input
                value={externoForm.estado}
                maxLength={2}
                onChange={(event) =>
                  setExternoForm((atual) => ({
                    ...atual,
                    estado: event.target.value,
                  }))
                }
              />
            </label>

            <label className={styles.field}>
              <span>Bairro</span>
              <input
                value={externoForm.bairro}
                onChange={(event) =>
                  setExternoForm((atual) => ({
                    ...atual,
                    bairro: event.target.value,
                  }))
                }
              />
            </label>

            <label className={styles.field}>
              <span>Cidade</span>
              <input
                value={externoForm.cidade}
                onChange={(event) =>
                  setExternoForm((atual) => ({
                    ...atual,
                    cidade: event.target.value,
                  }))
                }
              />
            </label>

            <label className={`${styles.field} ${styles.fullField}`}>
              <span>URL publica</span>
              <input
                value={externoForm.external_url}
                onChange={(event) =>
                  setExternoForm((atual) => ({
                    ...atual,
                    external_url: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <button
            type="button"
            className={styles.primaryButton}
            disabled={!podeImportar || salvandoExterno}
            onClick={() => void salvarExterno()}
          >
            <UploadCloud size={16} strokeWidth={2.2} />
            {salvandoExterno ? "Importando..." : "Registrar externo"}
          </button>

          {externos.length > 0 ? (
            <div className={styles.compactList}>
              {externos.map((imovel) => (
                <div
                  key={imovel.id}
                  className={`${styles.compactItem} ${styles.externalPropertyItem}`}
                >
                  <div className={styles.externalPropertyImage}>
                    <span>Sem imagem</span>
                    {imovel.imagem_url ? (
                      // A imagem permanece no servidor do parceiro; o CRM usa somente a URL.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imovel.imagem_url}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    ) : null}
                  </div>
                  <div className={styles.externalPropertyContent}>
                    <div>
                      <strong>{imovel.titulo}</strong>
                      <span>
                        {imovel.canal_nome} ·{" "}
                        {imovel.bairro || "Bairro nao inf."}
                        {imovel.cidade ? ` · ${imovel.cidade}` : ""}
                      </span>
                      {imovel.tipo ||
                      imovel.finalidade ||
                      imovel.status_origem ? (
                        <small>
                          {[
                            imovel.tipo,
                            imovel.finalidade,
                            imovel.status_origem,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      ) : null}
                      {imovel.codigo ? (
                        <small>Codigo: {imovel.codigo}</small>
                      ) : null}
                      <small>
                        {[
                          imovel.quartos
                            ? `${imovel.quartos} quarto(s)`
                            : null,
                          imovel.banheiros
                            ? `${imovel.banheiros} banheiro(s)`
                            : null,
                          imovel.vagas ? `${imovel.vagas} vaga(s)` : null,
                          imovel.area_m2 ? `${imovel.area_m2} m²` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                      <small>{formatarMoeda(imovel.valor)}</small>
                    </div>
                    <div className={styles.compactMeta}>
                      <small>{formatarData(imovel.recebido_em)}</small>
                      {imovel.external_url ? (
                        <a
                          href={imovel.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                          className={styles.inlineLink}
                        >
                          <ExternalLink size={15} strokeWidth={2.2} />
                          Ver no site
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
              ) : (
                <p className={styles.muted}>
                  Nenhum imovel externo registrado.
                </p>
              )}
            </>
          ) : null}
        </aside>
      </section>
    </>
  );
}
