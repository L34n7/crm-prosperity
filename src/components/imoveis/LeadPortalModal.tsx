"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageCircle,
  MessageSquareText,
  X,
} from "lucide-react";
import { bloquearScrollBody } from "@/lib/ui/body-scroll-lock";
import styles from "./LeadPortalModal.module.css";

export type LeadPortalModalScope = {
  imovelId?: string | null;
  imovelExternoId?: string | null;
  titulo?: string | null;
  codigo?: string | null;
};

type LeadPortal = {
  id: string;
  canal_nome: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  mensagem: string | null;
  recebido_em: string;
  imovel?: { titulo: string | null; codigo: string | null } | null;
};

type Props = {
  onClose: () => void;
  scope?: LeadPortalModalScope | null;
};

function formatarData(valor?: string | null) {
  if (!valor) return "Sem atualização";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Sem atualização";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function normalizarNumeroWhatsapp(valor?: string | null) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.startsWith("55")) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

function formatarTelefone(valor?: string | null) {
  const whatsapp = normalizarNumeroWhatsapp(valor);
  if (!whatsapp) return null;

  const nacional = whatsapp.startsWith("55") ? whatsapp.slice(2) : whatsapp;
  if (nacional.length === 11) {
    return `+55 (${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `+55 (${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }

  return valor?.trim() || `+${whatsapp}`;
}

function emailReal(valor?: string | null) {
  const email = String(valor ?? "").trim().toLowerCase();
  if (!email || email.startsWith("email-nao-informado@")) return null;
  return email;
}

export default function LeadPortalModal({ onClose, scope = null }: Props) {
  const [leads, setLeads] = useState<LeadPortal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [total, setTotal] = useState(0);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");

    try {
      const params = new URLSearchParams({
        pagina: String(pagina),
        limite: "50",
      });

      if (scope?.imovelId) params.set("imovel_id", scope.imovelId);
      if (scope?.imovelExternoId) {
        params.set("imovel_externo_id", scope.imovelExternoId);
      }

      const response = await fetch(`/api/imoveis/leads-portais?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar leads.");
      }

      setLeads(data.leads ?? []);
      setTotal(data.paginacao?.total ?? (data.leads ?? []).length);
      setTotalPaginas(data.paginacao?.total_paginas ?? 1);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar leads.");
    } finally {
      setCarregando(false);
    }
  }, [pagina, scope?.imovelExternoId, scope?.imovelId]);

  useEffect(() => {
    setPagina(1);
  }, [scope?.imovelExternoId, scope?.imovelId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => bloquearScrollBody(), []);

  useEffect(() => {
    function aoPressionarTecla(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", aoPressionarTecla, true);
    return () => {
      document.removeEventListener("keydown", aoPressionarTecla, true);
    };
  }, [onClose]);

  const identificacaoImovel = scope
    ? [scope.codigo ? `#${scope.codigo}` : null, scope.titulo]
        .filter(Boolean)
        .join(" · ")
    : "";
  const titulo = scope ? "Leads do imóvel" : "Leads dos portais";

  return (
    <div className={styles.modalOverlay} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.modalHeader}>
          <div>
            <span className={styles.eyebrow}>Integrações imobiliárias</span>
            <h2>{titulo}</h2>
            <p>
              {scope
                ? "Acompanhe os contatos vinculados a este imóvel."
                : "Acompanhe os contatos recebidos pelos portais."}
            </p>
            {identificacaoImovel ? (
              <span className={styles.propertyReference}>{identificacaoImovel}</span>
            ) : null}
          </div>
          <button
            className={styles.iconButton}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            autoFocus
          >
            <X size={20} />
          </button>
        </header>

        <div className={styles.modalBody}>
          {carregando ? (
            <div className={styles.empty}>Carregando leads...</div>
          ) : erro ? (
            <div className={styles.error}>
              <MessageSquareText size={22} />
              <span>{erro}</span>
              <button type="button" onClick={() => void carregar()}>
                Tentar novamente
              </button>
            </div>
          ) : leads.length === 0 ? (
            <div className={styles.empty}>Nenhum lead de portal recebido.</div>
          ) : (
            <div className={styles.leadList}>
              {leads.map((lead) => {
                const whatsapp = normalizarNumeroWhatsapp(lead.telefone);
                const telefone = formatarTelefone(lead.telefone);
                const email = emailReal(lead.email);

                return (
                  <article key={lead.id} className={styles.leadRow}>
                    <div className={styles.leadInfo}>
                      <strong>{lead.nome}</strong>
                      <span className={styles.leadOrigin}>
                        {lead.canal_nome}
                        {!scope && lead.imovel?.titulo
                          ? ` · ${lead.imovel.titulo}`
                          : ""}
                      </span>
                      {lead.mensagem ? <p>{lead.mensagem}</p> : null}
                    </div>

                    <div className={styles.leadMeta}>
                      {telefone && whatsapp ? (
                        <div className={styles.contactRow}>
                          <span className={styles.contactValue}>{telefone}</span>
                          <a
                            className={styles.contactAction}
                            href={`https://wa.me/${whatsapp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Enviar WhatsApp para ${lead.nome}`}
                          >
                            <MessageCircle size={16} /> WhatsApp
                          </a>
                        </div>
                      ) : null}

                      {email ? (
                        <div className={styles.contactRow}>
                          <span className={styles.contactValue}>{email}</span>
                          <a
                            className={styles.contactAction}
                            href={`mailto:${email}`}
                            aria-label={`Enviar e-mail para ${lead.nome}`}
                          >
                            <Mail size={16} /> E-mail
                          </a>
                        </div>
                      ) : null}

                      {!telefone && !email ? (
                        <span className={styles.noContact}>Sem contato informado</span>
                      ) : null}

                      <small className={styles.receivedAt}>
                        Recebido em {formatarData(lead.recebido_em)}
                      </small>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {!carregando && !erro && total > 0 ? (
          <footer className={styles.modalFooter}>
            <span>{total === 1 ? "1 lead" : `${total} leads`}</span>
            {totalPaginas > 1 ? (
              <div className={styles.pagination}>
                <button
                  className={styles.iconButton}
                  type="button"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
                  aria-label="Página anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <small>
                  {pagina} / {totalPaginas}
                </small>
                <button
                  className={styles.iconButton}
                  type="button"
                  disabled={pagina >= totalPaginas}
                  onClick={() =>
                    setPagina((atual) => Math.min(totalPaginas, atual + 1))
                  }
                  aria-label="Próxima página"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            ) : null}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
