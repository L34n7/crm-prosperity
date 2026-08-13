"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ExternalLink, FileText, Link2, MapPin } from "lucide-react";
import CatalogPropertyModal from "@/components/imoveis/CatalogPropertyModal";
import type { AgendaAppointmentDetailLink } from "./AgendaAppointmentDetails.types";
import propertyStyles from "./AgendaAppointmentDetailsProperty.module.css";
import styles from "./AgendaAppointmentDetails.module.css";

type Props = {
  links: AgendaAppointmentDetailLink[];
  relatedTypeLabels: Record<string, string>;
};

type CatalogoBuscaItem = {
  catalogo_id?: string;
  codigo?: string | null;
};

function catalogoIdDoVinculo(link: AgendaAppointmentDetailLink) {
  const id = link.dados_json?.catalogo_id?.trim();
  if (id) return id;

  const href = link.dados_json?.href?.trim();
  if (!href) return "";

  try {
    return (
      new URL(href, "https://crm.local").searchParams.get("imovel")?.trim() ||
      ""
    );
  } catch {
    return "";
  }
}

function valorDoImovel(valor?: string) {
  if (!valor) return "";
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numero);
}

function normalizarCodigo(valor?: string | null) {
  return String(valor ?? "").trim().toLocaleUpperCase("pt-BR");
}

async function resolverCatalogoId(link: AgendaAppointmentDetailLink) {
  const catalogoIdSalvo = catalogoIdDoVinculo(link);
  const codigo = link.dados_json?.codigo?.trim();

  if (!codigo) return catalogoIdSalvo;

  try {
    const params = new URLSearchParams({ busca: codigo, limite: "100" });
    const response = await fetch(`/api/imoveis/catalogo?${params}`, {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok || !data?.ok) return catalogoIdSalvo;

    const codigoNormalizado = normalizarCodigo(codigo);
    const correspondente = (data.imoveis ?? []).find(
      (item: CatalogoBuscaItem) =>
        normalizarCodigo(item.codigo) === codigoNormalizado && item.catalogo_id,
    ) as CatalogoBuscaItem | undefined;

    return correspondente?.catalogo_id?.trim() || catalogoIdSalvo;
  } catch {
    return catalogoIdSalvo;
  }
}

export default function AgendaAppointmentRelatedSection({
  links,
  relatedTypeLabels,
}: Props) {
  const [catalogoImovelAberto, setCatalogoImovelAberto] = useState<string | null>(
    null,
  );
  const [abrindoVinculo, setAbrindoVinculo] = useState<string | null>(null);

  async function abrirImovel(link: AgendaAppointmentDetailLink, key: string) {
    setAbrindoVinculo(key);
    try {
      const catalogoId = await resolverCatalogoId(link);
      if (catalogoId) setCatalogoImovelAberto(catalogoId);
    } finally {
      setAbrindoVinculo(null);
    }
  }

  if (links.length === 0) return null;

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <Link2 size={17} />
          <div>
            <h3>Registros relacionados</h3>
            <p>Imóveis, prontuários, odontogramas e outros vínculos.</p>
          </div>
        </div>

        <div className={styles.relatedList}>
          {links.map((link, index) => {
            const isProperty = link.entidade_tipo === "imovel";
            const catalogoId = isProperty ? catalogoIdDoVinculo(link) : "";
            const key = `${link.entidade_tipo}-${link.entidade_id}-${index}`;
            const abrindo = abrindoVinculo === key;
            const address = [
              [link.dados_json?.logradouro, link.dados_json?.numero]
                .filter(Boolean)
                .join(", "),
              link.dados_json?.complemento,
              link.dados_json?.bairro,
              [link.dados_json?.cidade, link.dados_json?.estado]
                .filter(Boolean)
                .join(" - "),
              link.dados_json?.cep ? `CEP ${link.dados_json.cep}` : "",
            ]
              .filter(Boolean)
              .join(" · ");
            const valor = valorDoImovel(link.dados_json?.valor);

            const content = (
              <>
                <div
                  className={`${styles.relatedVisual} ${
                    isProperty ? styles.propertyVisual : ""
                  }`}
                >
                  {link.imagem_url ? (
                    <Image
                      loader={({ src }) => src}
                      unoptimized
                      src={link.imagem_url}
                      alt=""
                      width={112}
                      height={92}
                    />
                  ) : (
                    <FileText size={24} />
                  )}
                </div>

                <div className={styles.relatedBody}>
                  <div>
                    <span>
                      {relatedTypeLabels[link.entidade_tipo] || link.entidade_tipo}
                    </span>
                    {link.principal ? <span>Principal</span> : null}
                  </div>
                  <strong>{link.titulo || "Registro relacionado"}</strong>

                  {isProperty ? (
                    <>
                      <p className={styles.propertyAddress}>
                        <MapPin size={15} />
                        {address || link.subtitulo || "Endereço não informado"}
                      </p>
                      <div
                        className={`${styles.propertyMeta} ${propertyStyles.propertyMetaReadable}`}
                      >
                        {link.dados_json?.codigo ? (
                          <span>Cód. {link.dados_json.codigo}</span>
                        ) : null}
                        {link.dados_json?.tipo ? (
                          <span>{link.dados_json.tipo}</span>
                        ) : null}
                        {link.dados_json?.finalidade ? (
                          <span>{link.dados_json.finalidade}</span>
                        ) : null}
                        {valor ? <span>{valor}</span> : null}
                      </div>
                    </>
                  ) : (
                    <p>{link.subtitulo || "Sem informações adicionais"}</p>
                  )}
                </div>

                {catalogoId || link.dados_json?.href ? (
                  <span className={styles.openRelated}>
                    {abrindo
                      ? "Abrindo..."
                      : isProperty && catalogoId
                        ? "Ver imóvel"
                        : "Abrir"}{" "}
                    <ExternalLink size={15} />
                  </span>
                ) : null}
              </>
            );

            if (isProperty && catalogoId) {
              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.relatedCard} ${styles.propertyCard} ${propertyStyles.propertyButton}`}
                  onClick={() => void abrirImovel(link, key)}
                  disabled={abrindo}
                  aria-label={`Abrir imóvel ${
                    link.dados_json?.codigo || link.titulo || "relacionado"
                  }`}
                >
                  {content}
                </button>
              );
            }

            return link.dados_json?.href ? (
              <Link
                key={key}
                className={`${styles.relatedCard} ${
                  isProperty ? styles.propertyCard : ""
                }`}
                href={link.dados_json.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {content}
              </Link>
            ) : (
              <article key={key} className={styles.relatedCard}>
                {content}
              </article>
            );
          })}
        </div>
      </section>

      {catalogoImovelAberto ? (
        <CatalogPropertyModal
          catalogoId={catalogoImovelAberto}
          onClose={() => setCatalogoImovelAberto(null)}
        />
      ) : null}
    </>
  );
}
