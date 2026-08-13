"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RadioTower, Send, SquareCheckBig, X } from "lucide-react";
import LeadPortalModal from "@/components/imoveis/LeadPortalModal";
import {
  CANAIS_IMOBILIARIOS,
  getStatusPublicacaoLabel,
} from "@/lib/imoveis/publicacao";
import type { PublicacaoImovelResumo } from "../imoveis/IntegracoesImobiliarias";
import styles from "./meus-imoveis.module.css";

type ImovelResumo = {
  id: string;
  titulo: string;
  codigo: string | null;
  bairro: string | null;
  cidade: string | null;
  imagem_url?: string | null;
  publicacoes?: PublicacaoImovelResumo[];
};

type Props = {
  imoveis: ImovelResumo[];
  permissoes: string[];
  modal: "publicacao" | "fila" | "leads" | null;
  imovelInicialId?: string | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (mensagem: string) => void;
  onMessage: (mensagem: string) => void;
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

function statusClass(status?: string | null) {
  if (status === "publicado") return styles.statusSuccess;
  if (status === "rejeitado") return styles.statusDanger;
  if (status === "pendente" || status === "em_analise") return styles.statusWarning;
  return styles.statusMuted;
}

export default function ImoveisOperacoesModais({
  imoveis,
  permissoes,
  modal,
  imovelInicialId,
  onClose,
  onChanged,
  onError,
  onMessage,
}: Props) {
  const [imovelId, setImovelId] = useState("");
  const [processando, setProcessando] = useState("");

  const podePublicar = permissoes.includes("imoveis.publicar");

  useEffect(() => {
    if (!modal) return;
    setImovelId(imovelInicialId || imoveis[0]?.id || "");
  }, [modal, imovelInicialId, imoveis]);

  const imovelSelecionado = useMemo(
    () => imoveis.find((item) => item.id === imovelId) ?? imoveis[0] ?? null,
    [imoveis, imovelId]
  );

  const publicacoesPorCanal = useMemo(
    () =>
      new Map(
        (imovelSelecionado?.publicacoes ?? []).map((publicacao) => [
          publicacao.canal_codigo,
          publicacao,
        ])
      ),
    [imovelSelecionado]
  );

  async function executarPublicacao(
    canalCodigo: string,
    acao: "publicar" | "despublicar" | "marcar_publicado"
  ) {
    if (!imovelSelecionado) return;
    const chave = `${imovelSelecionado.id}:${canalCodigo}:${acao}`;
    setProcessando(chave);
    onError("");

    try {
      const response = await fetch(
        `/api/imoveis/${imovelSelecionado.id}/publicacoes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canal_codigo: canalCodigo, acao }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || data?.message || "Erro ao publicar imóvel.");
      }
      onMessage(data.message || "Publicação atualizada.");
      await onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao publicar imóvel.");
    } finally {
      setProcessando("");
    }
  }

  if (!modal) return null;

  if (modal === "leads") {
    return <LeadPortalModal onClose={onClose} />;
  }

  const titulo = modal === "publicacao" ? "Publicar imóvel" : "Fila de publicação";

  return (
    <div className={styles.modalOverlay} role="presentation" onMouseDown={onClose}>
      <section
        className={`${styles.modal} ${modal === "fila" ? styles.modalWide : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.modalHeader}>
          <div>
            <span className={styles.eyebrow}>Integrações imobiliárias</span>
            <h2>{titulo}</h2>
            <p>Acompanhe e controle o envio dos imóveis para cada plataforma.</p>
          </div>
          <button className={styles.iconButton} type="button" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>

        <div className={styles.modalBody}>
          <label className={styles.field}>
            <span>Imóvel</span>
            <select value={imovelSelecionado?.id ?? ""} onChange={(e) => setImovelId(e.target.value)}>
              {imoveis.map((imovel) => (
                <option key={imovel.id} value={imovel.id}>
                  {imovel.codigo ? `${imovel.codigo} - ` : ""}{imovel.titulo}
                </option>
              ))}
            </select>
          </label>

          {!imovelSelecionado ? (
            <div className={styles.empty}>Cadastre um imóvel para iniciar a publicação.</div>
          ) : (
            <>
              <div className={styles.selectedProperty}>
                <div className={styles.propertyThumb}>
                  {imovelSelecionado.imagem_url ? (
                    <img src={imovelSelecionado.imagem_url} alt="" />
                  ) : (
                    <RadioTower size={24} />
                  )}
                </div>
                <div>
                  <strong>{imovelSelecionado.titulo}</strong>
                  <span>{imovelSelecionado.bairro || "Bairro não informado"}{imovelSelecionado.cidade ? ` · ${imovelSelecionado.cidade}` : ""}</span>
                </div>
              </div>

              <div className={styles.publicationList}>
                {CANAIS_IMOBILIARIOS.map((canal) => {
                  const publicacao = publicacoesPorCanal.get(canal.codigo);
                  const status = publicacao?.status ?? null;
                  const busy = processando.startsWith(`${imovelSelecionado.id}:${canal.codigo}:`);
                  return (
                    <article key={canal.codigo} className={styles.publicationRow}>
                      <div className={styles.portalIdentity}>
                        <span className={styles.portalIcon}><RadioTower size={18} /></span>
                        <div>
                          <strong>{canal.nome}</strong>
                          <small>{canal.modo.toUpperCase()} · {canal.descricao}</small>
                        </div>
                      </div>
                      <div className={styles.publicationState}>
                        <span className={`${styles.statusBadge} ${statusClass(status)}`}>
                          {getStatusPublicacaoLabel(status)}
                        </span>
                        <small>{formatarData(publicacao?.updated_at)}</small>
                        {publicacao?.erro ? <small className={styles.errorText}>{publicacao.erro}</small> : null}
                      </div>
                      <div className={styles.rowActions}>
                        {publicacao?.external_url ? (
                          <a className={styles.iconButton} href={publicacao.external_url} target="_blank" rel="noreferrer" aria-label="Abrir anúncio">
                            <ExternalLink size={17} />
                          </a>
                        ) : null}
                        <button className={styles.primaryButton} type="button" disabled={!podePublicar || busy} onClick={() => void executarPublicacao(canal.codigo, "publicar")}>
                          <Send size={16} /> Enviar
                        </button>
                        <button className={styles.secondaryButton} type="button" disabled={!podePublicar || busy} onClick={() => void executarPublicacao(canal.codigo, "marcar_publicado")}>
                          <SquareCheckBig size={16} /> Publicado
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
