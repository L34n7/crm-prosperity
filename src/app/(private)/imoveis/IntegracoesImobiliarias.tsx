"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ExternalLink,
  RadioTower,
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
  titulo: string;
  external_url: string | null;
  valor: number | string | null;
  bairro: string | null;
  cidade: string | null;
  recebido_em: string;
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
  const [externos, setExternos] = useState<ImovelExterno[]>([]);

  const podePublicar = permissoes.includes("imoveis.publicar");
  const podeGerenciarLeads = permissoes.includes("imoveis.leads_gerenciar");
  const podeImportar = permissoes.includes("imoveis.importar");

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
      const [leadsResponse, externosResponse] = await Promise.all([
        fetch("/api/imoveis/leads-portais?limite=8", { cache: "no-store" }),
        fetch("/api/imoveis/externos?limite=8", { cache: "no-store" }),
      ]);
      const [leadsData, externosData] = await Promise.all([
        leadsResponse.json(),
        externosResponse.json(),
      ]);

      if (!leadsResponse.ok) {
        throw new Error(leadsData?.error || "Erro ao carregar leads.");
      }

      if (!externosResponse.ok) {
        throw new Error(
          externosData?.error || "Erro ao carregar imoveis externos."
        );
      }

      setLeads(leadsData.leads ?? []);
      setExternos(externosData.imoveis_externos ?? []);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Erro ao carregar integracoes imobiliarias."
      );
    } finally {
      setCarregandoApoio(false);
    }
  }, [onError]);

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
      await carregarApoio();
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
              <span className={styles.eyebrow}>Imoveis externos</span>
              <h2>Importacao autorizada</h2>
              <p>Cadastre um imovel recebido por parceiro ou feed homologado.</p>
            </div>
          </div>

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
                <div key={imovel.id} className={styles.compactItem}>
                  <div>
                    <strong>{imovel.titulo}</strong>
                    <span>
                      {imovel.canal_nome} · {imovel.bairro || "Bairro nao inf."}
                      {imovel.cidade ? ` · ${imovel.cidade}` : ""}
                    </span>
                    <small>{formatarMoeda(imovel.valor)}</small>
                  </div>
                  <div className={styles.compactMeta}>
                    <small>{formatarData(imovel.recebido_em)}</small>
                    {imovel.external_url ? (
                      <a
                        href={imovel.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.inlineLink}
                      >
                        <ExternalLink size={15} strokeWidth={2.2} />
                        Abrir
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.muted}>Nenhum imovel externo registrado.</p>
          )}
        </aside>
      </section>
    </>
  );
}
