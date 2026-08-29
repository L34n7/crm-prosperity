"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Save,
  ShieldCheck,
} from "lucide-react";
import styles from "./MapaClinicoTab.module.css";
import enhancedStyles from "./OdontogramaEnhancements.module.css";

export type OdontogramaAlteracaoDraft = {
  dente: string;
  status: string;
  procedimento: string;
  observacoes: string;
};

type DenteRegistro = {
  id: string;
  dente: string;
  status: string;
  procedimento: string | null;
  observacoes: string | null;
};

type FormDente = {
  status: string;
  procedimento: string;
  observacoes: string;
};

type OdontogramaEvolucao = {
  id: string;
  atendimento_id: string;
  dente: string;
  status_anterior: string;
  status_novo: string;
  procedimento: string | null;
  observacoes: string | null;
  created_at: string;
};

type OdontogramaTabProps = {
  pacienteId: string;
  podeEditar: boolean;
  podeRegistrarAtendimento?: boolean;
  modoAtendimento?: boolean;
  modoPreview?: boolean;
  alteracoesPendentes?: OdontogramaAlteracaoDraft[];
  onAlteracoesPendentesChange?: (alteracoes: OdontogramaAlteracaoDraft[]) => void;
  onRegistrarAtendimento?: (dente: string) => void;
  onVerOdontogramaCompleto?: () => void;
  denteInicial?: string;
  onFeedback?: (mensagem: string) => void;
};

type TipoDente = "incisivo" | "canino" | "premolar" | "molar";

const DENTES_SUPERIORES = [
  "18", "17", "16", "15", "14", "13", "12", "11",
  "21", "22", "23", "24", "25", "26", "27", "28",
];

const DENTES_INFERIORES = [
  "48", "47", "46", "45", "44", "43", "42", "41",
  "31", "32", "33", "34", "35", "36", "37", "38",
];

const STATUS_LABELS: Record<string, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  carie: "Cárie",
  restauracao: "Restauração",
  canal: "Canal",
  extraido: "Extraído",
  implante: "Implante",
  planejado: "Planejado",
  realizado: "Realizado",
};

const STATUS_ORDEM = [
  "saudavel",
  "atencao",
  "carie",
  "restauracao",
  "canal",
  "extraido",
  "implante",
  "planejado",
  "realizado",
];

const FORM_INICIAL: FormDente = {
  status: "saudavel",
  procedimento: "",
  observacoes: "",
};

const ALTERACOES_VAZIAS: OdontogramaAlteracaoDraft[] = [];

const FORMAS_DENTE: Record<TipoDente, { coroa: string; raizes: string[] }> = {
  incisivo: {
    coroa: "M14 39 C18 35 36 35 40 39 L38 69 C35 77 19 77 16 69 Z",
    raizes: ["M21 41 C20 30 20 12 27 6 C34 12 34 30 33 41 Z"],
  },
  canino: {
    coroa: "M14 42 C18 37 23 35 27 32 C31 35 36 37 40 42 L36 69 C33 77 21 77 18 69 Z",
    raizes: ["M21 42 C20 28 21 10 27 4 C34 11 35 29 33 42 Z"],
  },
  premolar: {
    coroa: "M11 42 C15 35 39 35 43 42 L40 68 C36 76 18 76 14 68 Z",
    raizes: [
      "M17 43 C16 29 17 13 23 7 C28 15 28 31 27 43 Z",
      "M28 43 C28 30 30 14 35 8 C40 17 38 32 37 43 Z",
    ],
  },
  molar: {
    coroa: "M7 43 C11 34 43 34 47 43 L44 69 C40 78 14 78 10 69 Z",
    raizes: [
      "M13 44 C11 31 12 16 19 8 C24 18 24 32 23 44 Z",
      "M23 43 C23 27 24 10 28 5 C33 13 33 29 32 43 Z",
      "M33 44 C33 31 35 17 40 10 C45 21 43 34 42 44 Z",
    ],
  },
};

function tipoDoDente(numero: string): TipoDente {
  const posicao = Number(numero.charAt(1));
  if (posicao <= 2) return "incisivo";
  if (posicao === 3) return "canino";
  if (posicao <= 5) return "premolar";
  return "molar";
}

function descricaoDente(numero: string) {
  const quadrante = Number(numero.charAt(0));
  const posicao = Number(numero.charAt(1));
  const tipo = tipoDoDente(numero);
  const tipoLabel: Record<TipoDente, string> = {
    incisivo: posicao === 1 ? "Incisivo central" : "Incisivo lateral",
    canino: "Canino",
    premolar: posicao === 4 ? "Primeiro pré-molar" : "Segundo pré-molar",
    molar:
      posicao === 6
        ? "Primeiro molar"
        : posicao === 7
          ? "Segundo molar"
          : "Terceiro molar",
  };
  const lado = quadrante === 1 || quadrante === 4 ? "direito" : "esquerdo";
  const arcada = quadrante <= 2 ? "superior" : "inferior";
  return tipoLabel[tipo] + " " + arcada + " " + lado;
}

function Dente2D({
  numero,
  status,
  destaque = false,
}: {
  numero: string;
  status: string;
  destaque?: boolean;
}) {
  const forma = FORMAS_DENTE[tipoDoDente(numero)];
  const superior = Number(numero.charAt(0)) <= 2;
  const statusClass = styles["toothStatus_" + status] ?? styles.toothStatus_saudavel;

  return (
    <svg
      className={[styles.toothSvg, statusClass, destaque ? styles.toothSvgSelected : ""].join(" ")}
      viewBox="0 0 54 84"
      aria-hidden="true"
    >
      <g transform={superior ? "rotate(180 27 42)" : undefined}>
        {forma.raizes.map((raiz, index) => (
          <path key={raiz} d={raiz} className={styles.toothRoot} data-root={index + 1} />
        ))}
        <path d={forma.coroa} className={styles.toothCrown} />
        <path d="M14 51 C21 47 33 47 40 51" className={styles.toothDetail} />
        <path d="M16 62 C22 66 32 66 38 62" className={styles.toothDetailSoft} />
        {status === "canal" ? <path d="M27 12 L27 61" className={styles.canalMark} /> : null}
        {status === "restauracao" ? <ellipse cx="27" cy="55" rx="8" ry="6" className={styles.restorationMark} /> : null}
        {status === "carie" ? <circle cx="32" cy="53" r="5" className={styles.carieMark} /> : null}
        {status === "implante" ? (
          <g className={styles.implantMark}>
            <path d="M20 17 H34 L31 43 H23 Z" />
            <path d="M21 22 H33 M22 28 H32 M22 34 H32" />
          </g>
        ) : null}
        {status === "extraido" ? (
          <g className={styles.extractedMark}>
            <path d="M10 14 L44 70 M44 14 L10 70" />
          </g>
        ) : null}
        {status === "realizado" ? <path d="M17 55 L24 62 L39 45" className={styles.doneMark} /> : null}
      </g>
    </svg>
  );
}

function ArcadaOdontologica({
  titulo,
  subtitulo,
  numeros,
  dentesPorNumero,
  selecionado,
  onSelect,
}: {
  titulo: string;
  subtitulo: string;
  numeros: string[];
  dentesPorNumero: Map<string, DenteRegistro>;
  selecionado: string;
  onSelect: (numero: string) => void;
}) {
  return (
    <section className={styles.archSection}>
      <div className={styles.archTitle}>
        <strong>{titulo}</strong>
        <span>{subtitulo}</span>
      </div>
      <div className={styles.archScroll}>
        <div className={styles.archRow}>
          {numeros.map((numero, index) => {
            const registro = dentesPorNumero.get(numero);
            const status = registro?.status ?? "saudavel";
            const ativo = numero === selecionado;
            return (
              <button
                key={numero}
                type="button"
                className={[
                  styles.toothButton,
                  ativo ? styles.toothButtonActive : "",
                  index === 7 ? styles.quadrantDivider : "",
                ].join(" ")}
                onClick={() => onSelect(numero)}
                aria-label={"Dente " + numero + ": " + (STATUS_LABELS[status] ?? status)}
                aria-pressed={ativo}
              >
                <Dente2D numero={numero} status={status} destaque={ativo} />
                <span className={styles.toothNumber}>{numero}</span>
                {registro && status !== "saudavel" ? (
                  <span className={[styles.toothStatusDot, styles["dot_" + status] ?? ""].join(" ")} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ArcadaPreview({
  titulo,
  numeros,
  dentesPorNumero,
}: {
  titulo: string;
  numeros: string[];
  dentesPorNumero: Map<string, DenteRegistro>;
}) {
  return (
    <section className={enhancedStyles.previewArchSection} aria-label={titulo}>
      <strong>{titulo}</strong>
      <div className={enhancedStyles.previewArchScroll}>
        <div className={enhancedStyles.previewArchRow}>
          {numeros.map((numero, index) => {
            const registro = dentesPorNumero.get(numero);
            const status = registro?.status ?? "saudavel";
            return (
              <div
                key={numero}
                className={[
                  enhancedStyles.previewTooth,
                  index === 7 ? enhancedStyles.previewQuadrantDivider : "",
                ].join(" ")}
                title={`Dente ${numero}: ${STATUS_LABELS[status] ?? status}`}
              >
                <Dente2D numero={numero} status={status} />
                <span>{numero}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function OdontogramaTab({
  pacienteId,
  podeEditar,
  podeRegistrarAtendimento = false,
  modoAtendimento = false,
  modoPreview = false,
  alteracoesPendentes = ALTERACOES_VAZIAS,
  onAlteracoesPendentesChange,
  onRegistrarAtendimento,
  onVerOdontogramaCompleto,
  denteInicial,
  onFeedback,
}: OdontogramaTabProps) {
  const [dentes, setDentes] = useState<DenteRegistro[]>([]);
  const [evolucoes, setEvolucoes] = useState<OdontogramaEvolucao[]>([]);
  const [denteSelecionado, setDenteSelecionado] = useState(denteInicial || "11");
  const [form, setForm] = useState<FormDente>({ ...FORM_INICIAL });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const dentesAtuaisPorNumero = useMemo(
    () => new Map(dentes.map((dente) => [dente.dente, dente])),
    [dentes],
  );

  const dentesPorNumero = useMemo(() => {
    const mapa = new Map(dentesAtuaisPorNumero);
    for (const alteracao of alteracoesPendentes) {
      mapa.set(alteracao.dente, {
        id: "pendente-" + alteracao.dente,
        ...alteracao,
      });
    }
    return mapa;
  }, [alteracoesPendentes, dentesAtuaisPorNumero]);

  const resumo = useMemo(() => {
    const registros = Array.from(dentesPorNumero.values()) as DenteRegistro[];
    const alterados = registros.filter((dente) => dente.status !== "saudavel").length;
    const planejados = registros.filter((dente) => dente.status === "planejado").length;
    const realizados = registros.filter((dente) => dente.status === "realizado").length;
    return { alterados, planejados, realizados };
  }, [dentesPorNumero]);

  const historicoDente = useMemo(
    () => evolucoes.filter((evolucao) => evolucao.dente === denteSelecionado).slice(0, 3),
    [denteSelecionado, evolucoes],
  );
  const ultimaEvolucaoDente = historicoDente[0] ?? null;

  const carregar = useCallback(async () => {
    if (!pacienteId) return;
    setCarregando(true);
    setErro("");

    try {
      const params = new URLSearchParams({ paciente_id: pacienteId });
      const response = await fetch("/api/odontograma?" + params.toString(), {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao carregar odontograma.");
      }

      setDentes(Array.isArray(data.dentes) ? data.dentes : []);
      setEvolucoes(Array.isArray(data.evolucoes) ? data.evolucoes : []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar odontograma.");
    } finally {
      setCarregando(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (denteInicial) setDenteSelecionado(denteInicial);
  }, [denteInicial]);

  useEffect(() => {
    const registro = dentesPorNumero.get(denteSelecionado);
    setForm({
      status: registro?.status ?? "saudavel",
      procedimento: registro?.procedimento ?? "",
      observacoes: registro?.observacoes ?? "",
    });
    setHistoricoAberto(false);
  }, [denteSelecionado, dentesPorNumero]);

  function adicionarAoAtendimento() {
    if (!podeEditar || !modoAtendimento || !onAlteracoesPendentesChange) return;

    const atual = dentesAtuaisPorNumero.get(denteSelecionado);
    const alteracao: OdontogramaAlteracaoDraft = {
      dente: denteSelecionado,
      status: form.status,
      procedimento: form.procedimento.trim(),
      observacoes: form.observacoes.trim(),
    };
    const semMudanca =
      (atual?.status ?? "saudavel") === alteracao.status &&
      (atual?.procedimento ?? "") === alteracao.procedimento &&
      (atual?.observacoes ?? "") === alteracao.observacoes;

    const demais = alteracoesPendentes.filter((item) => item.dente !== denteSelecionado);
    onAlteracoesPendentesChange(semMudanca ? demais : [...demais, alteracao]);
    onFeedback?.(
      semMudanca
        ? "Nenhuma mudança clínica pendente para este dente."
        : "Dente " + denteSelecionado + " incluído neste atendimento.",
    );
  }

  function formatarDataHora(valor: string) {
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return "Data não informada";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(data);
  }

  if (carregando) {
    return <div className={styles.loading}>Carregando odontograma...</div>;
  }

  if (modoPreview) {
    return (
      <section className={enhancedStyles.previewCard}>
        {erro ? <div className={styles.error}>{erro}</div> : null}
        <div className={enhancedStyles.previewHeader}>
          <div>
            <span className={styles.eyebrow}>Panorama odontológico</span>
            <h3>Odontograma</h3>
            <p>Visão rápida da situação dentária atual.</p>
          </div>
          <div className={enhancedStyles.previewStats}>
            <div><strong>{resumo.alterados}</strong><span>Alterações</span></div>
            <div><strong>{resumo.planejados}</strong><span>Planejados</span></div>
            <div><strong>{resumo.realizados}</strong><span>Realizados</span></div>
          </div>
        </div>

        <div className={enhancedStyles.previewChart}>
          <ArcadaPreview titulo="Arcada superior" numeros={DENTES_SUPERIORES} dentesPorNumero={dentesPorNumero} />
          <ArcadaPreview titulo="Arcada inferior" numeros={DENTES_INFERIORES} dentesPorNumero={dentesPorNumero} />
        </div>

        {onVerOdontogramaCompleto ? (
          <div className={enhancedStyles.previewFooter}>
            <button type="button" onClick={onVerOdontogramaCompleto}>
              Ver odontograma completo
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className={[styles.odontogramWorkspace, modoAtendimento ? styles.odontogramWorkspaceEmbedded : ""].join(" ")}>
      {erro ? <div className={styles.error}>{erro}</div> : null}

      <header className={styles.odontogramHeader}>
        <div>
          <span className={styles.eyebrow}>
            {modoAtendimento ? "Avaliação odontológica do atendimento" : "Odontograma permanente · FDI"}
          </span>
          <h3>{modoAtendimento ? "Registrar situação dos dentes" : "Mapa odontológico 2D"}</h3>
          <p>
            {modoAtendimento
              ? "As alterações abaixo serão gravadas junto com a consulta ou procedimento."
              : "Visão consolidada do estado atual. Toda evolução clínica é registrada dentro de um atendimento."}
          </p>
        </div>
        <div className={styles.odontogramStats}>
          <div><strong>{resumo.alterados}</strong><span>Com alteração</span></div>
          <div><strong>{resumo.planejados}</strong><span>Planejados</span></div>
          <div><strong>{modoAtendimento ? alteracoesPendentes.length : resumo.realizados}</strong><span>{modoAtendimento ? "Neste atendimento" : "Realizados"}</span></div>
        </div>
      </header>

      <div className={[styles.odontogramLayout, !modoAtendimento ? enhancedStyles.readOnlyLayout : ""].join(" ")}>
        <div className={modoAtendimento ? enhancedStyles.attendanceChartColumn : undefined}>
          <div className={styles.chartCard}>
            <div className={styles.orientationBar}>
              <span>Direita do paciente</span>
              <span>Linha média</span>
              <span>Esquerda do paciente</span>
            </div>

            <ArcadaOdontologica
              titulo="Arcada superior"
              subtitulo="Maxila"
              numeros={DENTES_SUPERIORES}
              dentesPorNumero={dentesPorNumero}
              selecionado={denteSelecionado}
              onSelect={setDenteSelecionado}
            />

            <div className={styles.occlusalLine}><span>Plano oclusal</span></div>

            <ArcadaOdontologica
              titulo="Arcada inferior"
              subtitulo="Mandíbula"
              numeros={DENTES_INFERIORES}
              dentesPorNumero={dentesPorNumero}
              selecionado={denteSelecionado}
              onSelect={setDenteSelecionado}
            />

            <div className={styles.legend}>
              {STATUS_ORDEM.map((status) => (
                <span key={status}>
                  <i className={styles["dot_" + status] ?? ""} />
                  {STATUS_LABELS[status]}
                </span>
              ))}
            </div>
          </div>

          {modoAtendimento ? (
            <label className={`${styles.field} ${enhancedStyles.attendanceObservations}`}>
              <span>Observações clínicas</span>
              <textarea
                value={form.observacoes}
                disabled={!podeEditar}
                onChange={(event) => setForm((atual) => ({ ...atual, observacoes: event.target.value }))}
                placeholder="Registre achados, indicação e acompanhamento."
              />
            </label>
          ) : null}
        </div>

        <aside className={styles.toothInspector}>
          <div className={styles.inspectorHeader}>
            <div className={styles.selectedToothPreview}>
              <Dente2D numero={denteSelecionado} status={form.status} destaque />
            </div>
            <div>
              <span className={styles.eyebrow}>Dente {denteSelecionado}</span>
              <h3>{descricaoDente(denteSelecionado)}</h3>
              <span className={styles.statusBadge}>{STATUS_LABELS[form.status] ?? form.status}</span>
            </div>
          </div>

          {modoAtendimento ? (
            <>
              <div className={styles.conditionSection}>
                <div className={styles.fieldLabel}>
                  <strong>Condição clínica</strong>
                  <span>Situação observada agora</span>
                </div>
                <div className={styles.statusPalette}>
                  {STATUS_ORDEM.map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={!podeEditar}
                      className={[
                        styles.statusOption,
                        form.status === status ? styles.statusOptionActive : "",
                      ].join(" ")}
                      onClick={() => setForm((atual) => ({ ...atual, status }))}
                      aria-pressed={form.status === status}
                    >
                      <i className={styles["dot_" + status] ?? ""} />
                      {STATUS_LABELS[status]}
                      {form.status === status ? <CheckCircle2 size={14} /> : null}
                    </button>
                  ))}
                </div>
              </div>

              <label className={styles.field}>
                <span>Procedimento / indicação</span>
                <input
                  value={form.procedimento}
                  disabled={!podeEditar}
                  onChange={(event) => setForm((atual) => ({ ...atual, procedimento: event.target.value }))}
                  placeholder="Ex.: restauração em resina"
                />
              </label>
            </>
          ) : (
            <dl className={enhancedStyles.readOnlyDetails}>
              <div>
                <dt>Situação atual</dt>
                <dd><span className={enhancedStyles.statusDot + " " + (styles["dot_" + form.status] ?? "")} />{STATUS_LABELS[form.status] ?? form.status}</dd>
              </div>
              <div>
                <dt>Última atualização</dt>
                <dd>{ultimaEvolucaoDente ? formatarDataHora(ultimaEvolucaoDente.created_at) : "Sem evolução registrada"}</dd>
              </div>
              <div>
                <dt>Procedimento</dt>
                <dd>{form.procedimento || "Não informado"}</dd>
              </div>
              <div>
                <dt>Observações clínicas</dt>
                <dd>{form.observacoes || "Nenhuma observação registrada"}</dd>
              </div>
              <div>
                <dt>Atendimento relacionado</dt>
                <dd>{ultimaEvolucaoDente ? `Atendimento de ${formatarDataHora(ultimaEvolucaoDente.created_at)}` : "Nenhum atendimento relacionado"}</dd>
              </div>
            </dl>
          )}

          {modoAtendimento && podeEditar ? (
            <button type="button" className={styles.saveToothButton} onClick={adicionarAoAtendimento}>
              <Save size={16} />
              {alteracoesPendentes.some((item) => item.dente === denteSelecionado)
                ? "Atualizar dente no atendimento"
                : "Adicionar dente ao atendimento"}
            </button>
          ) : !modoAtendimento && podeRegistrarAtendimento && onRegistrarAtendimento ? (
            <button type="button" className={styles.saveToothButton} onClick={() => onRegistrarAtendimento(denteSelecionado)}>
              <CalendarPlus size={16} />
              Registrar atendimento para este dente
            </button>
          ) : !modoAtendimento ? (
            <div className={styles.readOnlyBanner}>
              <ShieldCheck size={16} />
              Visualização protegida. Alterações clínicas são registradas em um atendimento.
            </div>
          ) : null}

          {!modoAtendimento ? (
            <section className={styles.toothHistory}>
              <button
                type="button"
                className={enhancedStyles.historyToggle}
                onClick={() => setHistoricoAberto((aberto) => !aberto)}
                aria-expanded={historicoAberto}
              >
                <span><History size={15} /><strong>Histórico do dente</strong></span>
                {historicoAberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {historicoAberto ? (
                <div className={enhancedStyles.historyBody}>
                  {historicoDente.length === 0 ? (
                    <p>Nenhuma evolução registrada para este dente.</p>
                  ) : (
                    historicoDente.map((evolucao) => (
                      <article key={evolucao.id}>
                        <div>
                          <strong>{STATUS_LABELS[evolucao.status_novo] ?? evolucao.status_novo}</strong>
                          <span>{formatarDataHora(evolucao.created_at)}</span>
                        </div>
                        <p>
                          {STATUS_LABELS[evolucao.status_anterior] ?? evolucao.status_anterior}
                          {" → "}
                          {STATUS_LABELS[evolucao.status_novo] ?? evolucao.status_novo}
                          {evolucao.procedimento ? " · " + evolucao.procedimento : ""}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
