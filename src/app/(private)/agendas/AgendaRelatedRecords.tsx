"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ExternalLink,
  FileHeart,
  ImageIcon,
  Link2,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  Stethoscope,
  X,
} from "lucide-react";
import styles from "./AgendaRelatedRecords.module.css";

export type AgendaRelatedLink = {
  entidade_tipo: string;
  entidade_id: string;
  papel: string;
  titulo: string;
  subtitulo: string;
  imagem_url: string;
  principal: boolean;
  dados_json: Record<string, string>;
};

type Presentation = {
  tipos: string[];
  titulo: string;
  dica: string;
  botao: string;
};

type PropertyResult = {
  catalogo_id: string;
  origem_tipo: "crm" | "externo";
  origem_id: string;
  empresa_nome: string;
  titulo: string;
  codigo: string | null;
  tipo: string | null;
  finalidade: string | null;
  valor: number | string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  quartos: number | null;
  vagas: number | null;
  area_m2: number | string | null;
  imagem_url: string | null;
  external_url: string | null;
  pertence_empresa_atual: boolean;
};

type Props = {
  nicheCode: string;
  nicheName?: string | null;
  contactId: string;
  contactName?: string | null;
  presentation: Presentation;
  value: AgendaRelatedLink[];
  typeLabels: Record<string, string>;
  onChange: (value: AgendaRelatedLink[]) => void;
};

const supportedSearchNiches = new Set([
  "imobiliaria",
  "medicina",
  "odontologia",
]);

function formatMoney(value: number | string | null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(number);
}

function isSystemLink(link: AgendaRelatedLink) {
  return link.dados_json?.origem === "sistema";
}

function linkKey(link: AgendaRelatedLink) {
  return (
    link.dados_json?.catalogo_id ||
    `${link.entidade_tipo}:${link.entidade_id}`
  );
}

export default function AgendaRelatedRecords({
  nicheCode,
  nicheName,
  contactId,
  contactName,
  presentation,
  value,
  typeLabels,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState<"todos" | "crm" | "externo">("todos");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [properties, setProperties] = useState<PropertyResult[]>([]);
  const [healthRecords, setHealthRecords] = useState<AgendaRelatedLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const systemLinks = useMemo(() => value.filter(isSystemLink), [value]);
  const manualLinks = useMemo(() => value.filter((item) => !isSystemLink(item)), [value]);
  const selectedKeys = useMemo(
    () => new Set(systemLinks.map(linkKey)),
    [systemLinks]
  );

  const addManual = useCallback(() => {
    onChange([
      ...value,
      {
        entidade_tipo: presentation.tipos[0] || "outro",
        entidade_id: "",
        papel: "",
        titulo: "",
        subtitulo: "",
        imagem_url: "",
        principal: value.length === 0,
        dados_json: { origem: "manual" },
      },
    ]);
    setOpen(false);
  }, [onChange, presentation.tipos, value]);

  const loadProperties = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const params = new URLSearchParams({ pagina: String(page), limite: "12" });
      if (search.trim()) params.set("busca", search.trim());
      if (origin !== "todos") params.set("origem", origin);
      const response = await fetch(`/api/imoveis/catalogo?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao buscar imoveis.");
      }
      setProperties(data.imoveis ?? []);
      setTotalPages(Math.max(1, Number(data.paginacao?.total_paginas ?? 1)));
      if ((data.imoveis ?? []).length === 0) {
        setNotice("Nenhum imóvel encontrado com estes filtros.");
      }
    } catch (cause) {
      setProperties([]);
      setError(cause instanceof Error ? cause.message : "Erro ao buscar imoveis.");
    } finally {
      setLoading(false);
    }
  }, [origin, page, search]);

  const loadHealthRecords = useCallback(async () => {
    if (!contactId) {
      setHealthRecords([]);
      setNotice(
        "Selecione primeiro o paciente do agendamento para localizar os registros clínicos."
      );
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const params = new URLSearchParams({ contato_id: contactId });
      const response = await fetch(
        `/api/agendas/registros-relacionados?${params}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao buscar registros clínicos.");
      }
      setHealthRecords(data.registros ?? []);
      setNotice(data.aviso ?? "");
    } catch (cause) {
      setHealthRecords([]);
      setError(
        cause instanceof Error
          ? cause.message
          : "Erro ao buscar registros clínicos."
      );
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    if (!open || nicheCode !== "imobiliaria") return;
    const timeout = window.setTimeout(() => void loadProperties(), 300);
    return () => window.clearTimeout(timeout);
  }, [loadProperties, nicheCode, open]);

  useEffect(() => {
    if (!open || !["medicina", "odontologia"].includes(nicheCode)) return;
    void loadHealthRecords();
  }, [loadHealthRecords, nicheCode, open]);

  const addProperty = (property: PropertyResult) => {
    const subtitle = [
      property.codigo,
      property.finalidade,
      [property.bairro, property.cidade, property.estado].filter(Boolean).join(", "),
    ]
      .filter(Boolean)
      .join(" · ");
    const next: AgendaRelatedLink = {
      entidade_tipo: "imovel",
      entidade_id: property.origem_id,
      papel: "relacionado",
      titulo: property.titulo,
      subtitulo: subtitle,
      imagem_url: property.imagem_url ?? "",
      principal: value.length === 0,
      dados_json: {
        origem: "sistema",
        catalogo_id: property.catalogo_id,
        origem_tipo: property.origem_tipo,
        codigo: property.codigo ?? "",
        tipo: property.tipo ?? "",
        finalidade: property.finalidade ?? "",
        valor: String(property.valor ?? ""),
        bairro: property.bairro ?? "",
        cidade: property.cidade ?? "",
        estado: property.estado ?? "",
        empresa_nome: property.empresa_nome ?? "",
        href:
          property.external_url ||
          (property.pertence_empresa_atual
            ? `/meus-imoveis?imovel=${property.origem_id}`
            : ""),
      },
    };
    if (!selectedKeys.has(linkKey(next))) {
      onChange([...value, next]);
      setOpen(false);
      setSearch("");
      setOrigin("todos");
      setPage(1);
    }
  };

  const addHealthRecord = (record: AgendaRelatedLink) => {
    if (!selectedKeys.has(linkKey(record))) {
      onChange([
        ...value,
        { ...record, principal: value.length === 0 },
      ]);
    }
  };

  const remove = (target: AgendaRelatedLink) => {
    const targetKey = linkKey(target);
    const next = value.filter((item) =>
      isSystemLink(target) ? linkKey(item) !== targetKey : item !== target
    );
    if (target.principal && next.length > 0) next[0] = { ...next[0], principal: true };
    onChange(next);
  };

  const updateManual = (target: AgendaRelatedLink, patch: Partial<AgendaRelatedLink>) => {
    onChange(value.map((item) => (item === target ? { ...item, ...patch } : item)));
  };

  const searchable = supportedSearchNiches.has(nicheCode);
  const results = nicheCode === "imobiliaria" ? properties : healthRecords;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.titleLine}>
            <h3 className={styles.title}>
              <Link2 size={15} />
              {presentation.titulo}
            </h3>
            {nicheName ? <span className={styles.nicheBadge}>{nicheName}</span> : null}
          </div>
          <p className={styles.description}>{presentation.dica}</p>
        </div>
        <button
          type="button"
          className={styles.addButton}
          onClick={() => (searchable ? setOpen((current) => !current) : addManual())}
        >
          {open ? <X size={14} /> : <Plus size={14} />}
          {open ? "Fechar" : presentation.botao}
        </button>
      </div>

      {open ? (
        <div className={styles.picker}>
          {nicheCode === "imobiliaria" ? (
            <>
              <div className={styles.searchRow}>
                <div className={styles.searchField}>
                  <Search size={16} />
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Buscar por codigo, titulo, bairro ou cidade..."
                  />
                </div>
                <div className={styles.filters}>
                  {(["todos", "crm", "externo"] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={origin === item ? styles.filterActive : styles.filter}
                      onClick={() => {
                        setOrigin(item);
                        setPage(1);
                      }}
                    >
                      {item === "todos"
                        ? "Todos"
                        : item === "crm"
                          ? "Meus imoveis"
                          : "Externos"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className={styles.patientContext}>
              <Stethoscope size={17} />
              {contactId
                ? `Registros clínicos de ${contactName || "paciente selecionado"}`
                : "Selecione o paciente no campo Cliente"}
            </div>
          )}

          {loading ? (
            <div className={styles.message}>
              <LoaderCircle className={styles.spinner} size={18} />
              Buscando registros...
            </div>
          ) : null}
          {error ? <div className={styles.error}>{error}</div> : null}
          {!loading && !error && notice ? (
            <div className={styles.message}>{notice}</div>
          ) : null}

          {!loading && !error && results.length > 0 ? (
            <div className={styles.results}>
              {nicheCode === "imobiliaria"
                ? properties.map((property) => {
                    const selected = selectedKeys.has(property.catalogo_id);
                    return (
                      <button
                        type="button"
                        key={property.catalogo_id}
                        className={styles.result}
                        onClick={() => addProperty(property)}
                        disabled={selected}
                      >
                        <div className={styles.thumbnail}>
                          {property.imagem_url ? (
                            <Image
                              loader={({ src }) => src}
                              unoptimized
                              src={property.imagem_url}
                              alt=""
                              width={76}
                              height={62}
                            />
                          ) : (
                            <ImageIcon size={22} />
                          )}
                        </div>
                        <div className={styles.resultBody}>
                          <strong>{property.titulo}</strong>
                          <span>
                            {[property.codigo, property.finalidade]
                              .filter(Boolean)
                              .join(" · ") || "Imóvel"}
                          </span>
                          <span className={styles.location}>
                            <MapPin size={12} />
                            {[property.bairro, property.cidade, property.estado]
                              .filter(Boolean)
                              .join(", ") || "Local não informado"}
                          </span>
                          <small>{property.empresa_nome}</small>
                        </div>
                        <div className={styles.resultMeta}>
                          <span className={styles.originBadge}>
                            {property.origem_tipo === "crm" ? "CRM" : "Externo"}
                          </span>
                          <b>{formatMoney(property.valor)}</b>
                          <span>{selected ? "Vinculado" : "Selecionar"}</span>
                        </div>
                      </button>
                    );
                  })
                : healthRecords.map((record) => {
                    const selected = selectedKeys.has(linkKey(record));
                    return (
                      <button
                        type="button"
                        key={linkKey(record)}
                        className={styles.result}
                        onClick={() => addHealthRecord(record)}
                        disabled={selected}
                      >
                        <div className={styles.recordIcon}>
                          <FileHeart size={22} />
                        </div>
                        <div className={styles.resultBody}>
                          <strong>{record.titulo}</strong>
                          <span>{record.subtitulo || "Registro clínico"}</span>
                        </div>
                        <div className={styles.resultMeta}>
                          <span className={styles.originBadge}>
                            {typeLabels[record.entidade_tipo] || record.entidade_tipo}
                          </span>
                          <span>{selected ? "Vinculado" : "Selecionar"}</span>
                        </div>
                      </button>
                    );
                  })}
            </div>
          ) : null}

          {nicheCode === "imobiliaria" && !loading && totalPages > 1 ? (
            <div className={styles.pagination}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Anterior
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                Próxima
              </button>
            </div>
          ) : null}

          <div className={styles.manualPrompt}>
            <span>Não encontrou o registro?</span>
            <button type="button" onClick={addManual}>
              <Plus size={13} /> Cadastrar manualmente
            </button>
          </div>
        </div>
      ) : null}

      {systemLinks.length > 0 ? (
        <div className={styles.selectedList}>
          {systemLinks.map((link) => (
            <article className={styles.selectedCard} key={linkKey(link)}>
              <div className={styles.selectedVisual}>
                {link.imagem_url ? (
                  <Image
                    loader={({ src }) => src}
                    unoptimized
                    src={link.imagem_url}
                    alt=""
                    width={84}
                    height={70}
                  />
                ) : link.entidade_tipo === "imovel" ? (
                  <Building2 size={24} />
                ) : (
                  <FileHeart size={24} />
                )}
              </div>
              <div className={styles.selectedBody}>
                <div className={styles.selectedBadges}>
                  <span>
                    {typeLabels[link.entidade_tipo] || link.entidade_tipo}
                  </span>
                  <span>Sistema</span>
                  {link.principal ? <span>Principal</span> : null}
                </div>
                <strong>{link.titulo}</strong>
                <p>{link.subtitulo || "Registro vinculado"}</p>
              </div>
              <div className={styles.selectedActions}>
                {link.dados_json.href ? (
                  <Link
                    href={link.dados_json.href}
                    target={
                      link.dados_json.href.startsWith("http")
                        ? "_blank"
                        : undefined
                    }
                  >
                    <ExternalLink size={14} /> Abrir
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => remove(link)}
                  aria-label="Remover vínculo"
                >
                  <X size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {manualLinks.map((link, index) => {
        const extraKey =
          Object.keys(link.dados_json).find((key) => key !== "origem") || "";
        const extraValue = extraKey ? link.dados_json[extraKey] || "" : "";
        return (
          <div className={styles.manualCard} key={`manual-${index}`}>
          <div className={styles.manualHeader}>
            <b>Cadastro manual {index + 1}</b>
            <button
              type="button"
              onClick={() => remove(link)}
              aria-label="Remover cadastro"
            >
              <X size={14} />
            </button>
          </div>
          <div className={styles.manualForm}>
            <label>
              <span>Tipo</span>
              <select
                value={link.entidade_tipo}
                onChange={(event) =>
                  updateManual(link, { entidade_tipo: event.target.value })
                }
              >
                {presentation.tipos.map((type) => (
                  <option key={type} value={type}>
                    {typeLabels[type] || type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Código / ID</span>
              <input
                value={link.entidade_id}
                onChange={(event) =>
                  updateManual(link, { entidade_id: event.target.value })
                }
              />
            </label>
            <label className={styles.fullField}>
              <span>Título*</span>
              <input
                value={link.titulo}
                onChange={(event) =>
                  updateManual(link, { titulo: event.target.value })
                }
              />
            </label>
            <label>
              <span>Papel</span>
              <input
                value={link.papel}
                onChange={(event) =>
                  updateManual(link, { papel: event.target.value })
                }
              />
            </label>
            <label>
              <span>Resumo</span>
              <input
                value={link.subtitulo}
                onChange={(event) =>
                  updateManual(link, { subtitulo: event.target.value })
                }
              />
            </label>
            <label className={styles.fullField}>
              <span>URL da imagem</span>
              <input
                value={link.imagem_url}
                onChange={(event) =>
                  updateManual(link, { imagem_url: event.target.value })
                }
              />
            </label>
            <label>
              <span>Campo adicional</span>
              <input
                value={extraKey}
                onChange={(event) => {
                  const nextKey = event.target.value;
                  updateManual(link, {
                    dados_json: nextKey
                      ? { origem: "manual", [nextKey]: extraValue }
                      : { origem: "manual" },
                  });
                }}
              />
            </label>
            <label>
              <span>Valor</span>
              <input
                value={extraValue}
                onChange={(event) =>
                  updateManual(link, {
                    dados_json: extraKey
                      ? { origem: "manual", [extraKey]: event.target.value }
                      : { origem: "manual" },
                  })
                }
              />
            </label>
          </div>
          </div>
        );
      })}

      {value.length === 0 && !open ? (
        <div className={styles.empty}>Nenhum registro relacionado.</div>
      ) : null}
    </section>
  );
}
