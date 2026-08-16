"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  Activity,
  Camera,
  CheckCircle2,
  CircleDot,
  Clock3,
  Crosshair,
  Eye,
  Footprints,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Paperclip,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  PODOGRAMA_LADO_LABELS,
  PODOGRAMA_MOMENTO_FOTO_LABELS,
  PODOGRAMA_MOMENTOS_FOTO,
  PODOGRAMA_OCORRENCIA_LABELS,
  PODOGRAMA_OCORRENCIAS,
  PODOGRAMA_REGIAO_LABELS,
  PODOGRAMA_REGIOES,
  PODOGRAMA_SEVERIDADE_LABELS,
  PODOGRAMA_SEVERIDADES,
  PODOGRAMA_STATUS_LABELS,
  PODOGRAMA_STATUS,
  PODOGRAMA_VISTA_LABELS,
  PODOGRAMA_VISTAS,
  type PodogramaLado,
  type PodogramaMomentoFoto,
  type PodogramaOcorrencia,
  type PodogramaRegiao,
  type PodogramaSeveridade,
  type PodogramaStatus,
  type PodogramaVista,
} from "@/lib/podograma/config";
import styles from "./PodogramaTab.module.css";

type FotoPodograma = {
  id: string;
  marcacao_id: string;
  nome_original: string;
  mime_type: string;
  tamanho_bytes: number;
  momento: PodogramaMomentoFoto;
  legenda: string | null;
  created_at: string;
  url: string | null;
};

type MarcacaoPodograma = {
  id: string;
  paciente_id: string;
  pessoa_id: string;
  atendimento_id: string | null;
  lado: PodogramaLado;
  vista: PodogramaVista;
  coordenada_x: number | string;
  coordenada_y: number | string;
  coordenada_z: number | string | null;
  regiao_anatomica: string;
  tipo_ocorrencia: PodogramaOcorrencia;
  severidade: PodogramaSeveridade;
  status: PodogramaStatus;
  procedimento: string | null;
  observacoes: string | null;
  modelo_versao: string;
  resolvido_em: string | null;
  created_at: string;
  updated_at: string;
  fotos: FotoPodograma[];
};

type AtendimentoResumo = {
  id: string;
  data_atendimento: string;
  tipo: string;
  queixa_principal: string | null;
};

type FormMarcacao = {
  id: string | null;
  lado: PodogramaLado;
  vista: PodogramaVista;
  coordenada_x: number;
  coordenada_y: number;
  regiao_anatomica: PodogramaRegiao;
  tipo_ocorrencia: PodogramaOcorrencia;
  severidade: PodogramaSeveridade;
  status: PodogramaStatus;
  atendimento_id: string;
  procedimento: string;
  observacoes: string;
};

type FotoPendente = {
  id: string;
  arquivo: File;
  previewUrl: string;
};

type Props = {
  pacienteId: string;
  podeEditar: boolean;
  onFeedback?: (mensagem: string) => void;
};

type StatusFiltro = "ativas" | "todos" | "resolvidas";

const MIMES_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);
const LIMITE_FOTO_BYTES = 10 * 1024 * 1024;

function numero(valor: number | string | null | undefined) {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

function formatarDataHora(valor: string | null | undefined) {
  if (!valor) return "Sem data";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function formatarTipoAtendimento(valor: string) {
  const labels: Record<string, string> = {
    consulta: "Consulta",
    retorno: "Retorno",
    procedimento: "Procedimento",
    avaliacao: "Avaliação",
    emergencia: "Emergência",
  };
  return labels[valor] ?? valor;
}

function regiaoAutomatica(
  vista: PodogramaVista,
  lado: PodogramaLado,
  x: number,
  y: number,
): PodogramaRegiao {
  if (vista === "lateral") {
    const eixoHorizontal = lado === "direito" ? 100 - x : x;

    if (eixoHorizontal >= 82) return "dedos";
    if (eixoHorizontal >= 64) return "antepe";
    if (eixoHorizontal >= 38) {
      return y >= 58 ? "arco_lateral" : "mediape";
    }
    if (eixoHorizontal >= 14 && y >= 42) return "calcaneo";
    return "outra";
  }

  if (vista === "dorsal" && y < 19) return "unhas";
  if (y < 22) return x < 32 || x > 68 ? "dedos" : "halux";
  if (y < 42) return "antepe";
  if (y < 72) return vista === "dorsal" ? "dorso" : "mediape";
  return "calcaneo";
}

function formDaMarcacao(marcacao: MarcacaoPodograma): FormMarcacao {
  const regiao = PODOGRAMA_REGIOES.includes(
    marcacao.regiao_anatomica as PodogramaRegiao,
  )
    ? (marcacao.regiao_anatomica as PodogramaRegiao)
    : "outra";

  return {
    id: marcacao.id,
    lado: marcacao.lado,
    vista: marcacao.vista,
    coordenada_x: numero(marcacao.coordenada_x),
    coordenada_y: numero(marcacao.coordenada_y),
    regiao_anatomica: regiao,
    tipo_ocorrencia: marcacao.tipo_ocorrencia,
    severidade: marcacao.severidade,
    status: marcacao.status,
    atendimento_id: marcacao.atendimento_id ?? "",
    procedimento: marcacao.procedimento ?? "",
    observacoes: marcacao.observacoes ?? "",
  };
}

function SilhuetaLateral({ lado }: { lado: PodogramaLado }) {
  const espelhar =
    lado === "direito" ? "translate(480 0) scale(-1 1)" : undefined;

  return (
    <svg
      viewBox="0 0 480 260"
      className={styles.footSvg}
      style={{ inset: "8% 4%", width: "92%", height: "84%" }}
      aria-hidden="true"
    >
      <g transform={espelhar}>
        <path
          className={styles.footShape}
          d="
            M52 190
            C66 179 77 160 83 138
            C90 111 91 79 105 51
            C116 29 133 18 151 21
            C171 24 183 42 181 65
            C180 85 170 104 166 121
            C163 137 171 147 189 153
            C222 164 258 165 294 158
            C327 152 356 144 386 143
            C419 142 447 151 457 168
            C467 184 457 199 437 207
            C418 215 393 217 366 216
            L309 214
            C285 213 266 216 249 224
            C228 234 209 241 187 241
            C165 241 147 236 131 228
            C113 220 97 218 82 220
            C66 221 55 212 50 201
            C48 197 49 194 52 190
            Z
          "
        />
        <path
          className={styles.anatomyLine}
          d="M84 219 C108 211 127 209 150 215 C167 220 181 225 198 225"
        />
        <path
          className={styles.anatomyLine}
          d="M190 153 C225 174 273 177 320 165"
        />
        <path
          className={styles.anatomyLine}
          d="M117 91 C135 100 154 99 174 91"
        />
        <circle className={styles.anatomySoft} cx="139" cy="91" r="11" />
        <path
          className={styles.anatomyLine}
          d="M386 143 C399 150 404 160 402 174 M414 145 C426 152 430 162 427 176 M439 153 C447 161 449 170 445 180"
        />
        <path
          className={styles.anatomyLine}
          d="M143 228 C176 208 209 201 247 202 C271 203 294 207 316 211"
        />
      </g>
    </svg>
  );
}

function SilhuetaPe({
  vista,
  lado,
}: {
  vista: PodogramaVista;
  lado: PodogramaLado;
}) {
  if (vista === "lateral") {
    return <SilhuetaLateral lado={lado} />;
  }

  const espelhar =
    lado === "direito" ? "translate(240 0) scale(-1 1)" : undefined;

  return (
    <svg viewBox="0 0 240 480" className={styles.footSvg} aria-hidden="true">
      <g transform={espelhar}>
        <ellipse className={styles.toeShape} cx="66" cy="48" rx="24" ry="30" />
        <ellipse className={styles.toeShape} cx="104" cy="36" rx="18" ry="23" />
        <ellipse className={styles.toeShape} cx="136" cy="39" rx="16" ry="21" />
        <ellipse className={styles.toeShape} cx="165" cy="48" rx="14" ry="19" />
        <ellipse className={styles.toeShape} cx="190" cy="61" rx="12" ry="17" />
        <path
          className={styles.footShape}
          d="M45 100 C55 76 80 69 108 72 C143 75 176 81 196 103 C216 125 214 159 203 189 C190 223 173 246 171 277 C169 304 184 327 188 359 C194 404 171 447 126 459 C86 469 52 447 45 408 C39 373 54 340 58 309 C62 277 50 253 38 224 C23 188 22 145 45 100 Z"
        />
        {vista === "plantar" ? (
          <>
            <path
              className={styles.anatomyLine}
              d="M54 169 C96 190 158 190 201 165"
            />
            <path
              className={styles.anatomyLine}
              d="M63 302 C91 287 136 285 170 302"
            />
            <ellipse
              className={styles.anatomySoft}
              cx="117"
              cy="391"
              rx="53"
              ry="48"
            />
          </>
        ) : (
          <>
            <path
              className={styles.anatomyLine}
              d="M53 149 C102 132 155 137 204 159"
            />
            <path
              className={styles.anatomyLine}
              d="M79 240 C113 224 148 226 176 241"
            />
            <path
              className={styles.anatomyLine}
              d="M86 84 L73 49 M112 78 L104 36 M140 82 L136 39 M166 90 L165 48 M187 103 L190 61"
            />
          </>
        )}
      </g>
    </svg>
  );
}

function classeStatus(status: PodogramaStatus) {
  if (status === "resolvida") return styles.markerResolvida;
  if (status === "em_tratamento") return styles.markerTreatment;
  if (status === "observacao") return styles.markerObservacao;
  return "";
}

function classeMarker(
  status: PodogramaStatus,
  severidade: PodogramaSeveridade,
) {
  return [
    styles.marker,
    classeStatus(status),
    severidade === "importante" ? styles.markerImportante : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function PodogramaTab({
  pacienteId,
  podeEditar,
  onFeedback,
}: Props) {
  const [marcacoes, setMarcacoes] = useState<MarcacaoPodograma[]>([]);
  const [atendimentos, setAtendimentos] = useState<AtendimentoResumo[]>([]);
  const [vista, setVista] = useState<PodogramaVista>("plantar");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("ativas");
  const [atendimentoFiltro, setAtendimentoFiltro] = useState("todos");
  const [form, setForm] = useState<FormMarcacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [momentoFoto, setMomentoFoto] =
    useState<PodogramaMomentoFoto>("registro");
  const [legendaFoto, setLegendaFoto] = useState("");
  const [fotosPendentes, setFotosPendentes] = useState<FotoPendente[]>([]);
  const inputFotoRef = useRef<HTMLInputElement | null>(null);
  const fotosPendentesRef = useRef<FotoPendente[]>([]);

  useEffect(() => {
    fotosPendentesRef.current = fotosPendentes;
  }, [fotosPendentes]);

  useEffect(() => {
    return () => {
      fotosPendentesRef.current.forEach((foto) =>
        URL.revokeObjectURL(foto.previewUrl),
      );
    };
  }, []);

  const informar = useCallback(
    (textoFeedback: string) => {
      setMensagem(textoFeedback);
      onFeedback?.(textoFeedback);
    },
    [onFeedback],
  );

  const carregar = useCallback(async () => {
    if (!pacienteId) return;

    setCarregando(true);
    setErro("");

    try {
      const params = new URLSearchParams({ paciente_id: pacienteId });
      const response = await fetch(`/api/podograma?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao carregar Podograma.");
      }

      setMarcacoes(data.marcacoes ?? []);
      setAtendimentos(data.atendimentos ?? []);
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao carregar Podograma.",
      );
    } finally {
      setCarregando(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const marcacaoSelecionada = useMemo(
    () =>
      form?.id
        ? marcacoes.find((item) => item.id === form.id) ?? null
        : null,
    [form?.id, marcacoes],
  );

  const marcacoesVisiveis = useMemo(() => {
    return marcacoes.filter((item) => {
      if (item.vista !== vista) return false;
      if (statusFiltro === "ativas" && item.status === "resolvida") return false;
      if (statusFiltro === "resolvidas" && item.status !== "resolvida")
        return false;
      if (atendimentoFiltro === "sem_atendimento" && item.atendimento_id)
        return false;
      if (
        atendimentoFiltro !== "todos" &&
        atendimentoFiltro !== "sem_atendimento" &&
        item.atendimento_id !== atendimentoFiltro
      ) {
        return false;
      }
      return true;
    });
  }, [atendimentoFiltro, marcacoes, statusFiltro, vista]);

  const estatisticas = useMemo(() => {
    const ativas = marcacoes.filter((item) => item.status === "ativa").length;
    const tratamento = marcacoes.filter(
      (item) => item.status === "em_tratamento",
    ).length;
    const resolvidas = marcacoes.filter(
      (item) => item.status === "resolvida",
    ).length;
    const fotos = marcacoes.reduce(
      (total, item) => total + (item.fotos?.length ?? 0),
      0,
    );

    return { ativas, tratamento, resolvidas, fotos };
  }, [marcacoes]);

  const atendimentoPorId = useMemo(
    () => new Map(atendimentos.map((item) => [item.id, item])),
    [atendimentos],
  );

  function limparFotosPendentes() {
    setFotosPendentes((atuais) => {
      atuais.forEach((foto) => URL.revokeObjectURL(foto.previewUrl));
      return [];
    });
    if (inputFotoRef.current) inputFotoRef.current.value = "";
  }

  function fecharEditor() {
    limparFotosPendentes();
    setForm(null);
    setConfirmandoExclusao(false);
    setMomentoFoto("registro");
    setLegendaFoto("");
  }

  function criarMarcacao(
    event: MouseEvent<HTMLDivElement>,
    lado: PodogramaLado,
  ) {
    if (!podeEditar) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
    );
    const y = Math.max(
      0,
      Math.min(100, ((event.clientY - rect.top) / rect.height) * 100),
    );

    limparFotosPendentes();
    setMomentoFoto("registro");
    setLegendaFoto("");
    setForm({
      id: null,
      lado,
      vista,
      coordenada_x: Math.round(x * 1000) / 1000,
      coordenada_y: Math.round(y * 1000) / 1000,
      regiao_anatomica: regiaoAutomatica(vista, lado, x, y),
      tipo_ocorrencia: "outra",
      severidade: "moderada",
      status: "ativa",
      atendimento_id:
        atendimentoFiltro !== "todos" &&
        atendimentoFiltro !== "sem_atendimento"
          ? atendimentoFiltro
          : "",
      procedimento: "",
      observacoes: "",
    });
    setConfirmandoExclusao(false);
  }

  function editarMarcacao(marcacao: MarcacaoPodograma) {
    limparFotosPendentes();
    setMomentoFoto("registro");
    setLegendaFoto("");
    setVista(marcacao.vista);
    setForm(formDaMarcacao(marcacao));
    setConfirmandoExclusao(false);
  }

  function selecionarFotos(arquivos: FileList | null) {
    if (!arquivos?.length) return;

    const validas: FotoPendente[] = [];
    const rejeitadas: string[] = [];

    Array.from(arquivos).forEach((arquivo) => {
      if (!MIMES_FOTO.has(arquivo.type)) {
        rejeitadas.push(`${arquivo.name}: formato não permitido`);
        return;
      }

      if (arquivo.size <= 0 || arquivo.size > LIMITE_FOTO_BYTES) {
        rejeitadas.push(`${arquivo.name}: máximo de 10 MB`);
        return;
      }

      validas.push({
        id: `${Date.now()}-${crypto.randomUUID()}`,
        arquivo,
        previewUrl: URL.createObjectURL(arquivo),
      });
    });

    if (validas.length) {
      setFotosPendentes((atuais) => [...atuais, ...validas]);
    }

    if (rejeitadas.length) {
      setErro(rejeitadas.join(" · "));
    } else {
      setErro("");
    }

    if (inputFotoRef.current) inputFotoRef.current.value = "";
  }

  function removerFotoPendente(id: string) {
    setFotosPendentes((atuais) => {
      const removida = atuais.find((foto) => foto.id === id);
      if (removida) URL.revokeObjectURL(removida.previewUrl);
      return atuais.filter((foto) => foto.id !== id);
    });
  }

  async function enviarFotoParaMarcacao(
    foto: FotoPendente,
    marcacaoId: string,
  ) {
    const body = new FormData();
    body.append("arquivo", foto.arquivo);
    body.append("paciente_id", pacienteId);
    body.append("marcacao_id", marcacaoId);
    body.append("momento", momentoFoto);
    body.append("legenda", legendaFoto);

    const response = await fetch("/api/podograma/fotos", {
      method: "POST",
      body,
    });
    const data = await response.json();

    if (!response.ok || !data?.ok) {
      throw new Error(
        data?.error || `Erro ao anexar ${foto.arquivo.name}.`,
      );
    }
  }

  async function salvarMarcacao() {
    if (!form) return;

    setSalvando(true);
    setErro("");

    try {
      const response = await fetch("/api/podograma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, paciente_id: pacienteId }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao salvar Podograma.");
      }

      const idSalvo = data.marcacao?.id as string | undefined;
      if (!idSalvo) {
        throw new Error("Ocorrência salva sem identificador para as mídias.");
      }

      const pendentes = [...fotosPendentes];
      const falhas: FotoPendente[] = [];
      const errosFotos: string[] = [];

      for (const foto of pendentes) {
        try {
          await enviarFotoParaMarcacao(foto, idSalvo);
          URL.revokeObjectURL(foto.previewUrl);
        } catch (error) {
          falhas.push(foto);
          errosFotos.push(
            error instanceof Error
              ? error.message
              : `Erro ao anexar ${foto.arquivo.name}.`,
          );
        }
      }

      setFotosPendentes(falhas);
      if (inputFotoRef.current) inputFotoRef.current.value = "";

      setForm((atual) =>
        atual ? { ...atual, id: idSalvo } : atual,
      );

      await carregar();

      if (falhas.length > 0) {
        setErro(
          `A ocorrência foi salva, mas ${falhas.length} mídia(s) não foram enviada(s): ${errosFotos.join(
            " · ",
          )}`,
        );
      } else {
        const totalMidias = pendentes.length;
        informar(
          totalMidias > 0
            ? `${data.message || "Ocorrência salva."} ${totalMidias} mídia(s) anexada(s).`
            : data.message || "Podograma atualizado.",
        );
        setLegendaFoto("");
        setMomentoFoto("registro");
      }
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao salvar Podograma.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluirMarcacao() {
    if (!form?.id) return;

    setSalvando(true);
    setErro("");

    try {
      const params = new URLSearchParams({
        id: form.id,
        paciente_id: pacienteId,
      });
      const response = await fetch(`/api/podograma?${params}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao excluir marcação.");
      }

      informar(data.message || "Marcação removida.");
      fecharEditor();
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao excluir marcação.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function removerFoto(fotoId: string) {
    setProcessandoFoto(true);
    setErro("");

    try {
      const params = new URLSearchParams({
        id: fotoId,
        paciente_id: pacienteId,
      });
      const response = await fetch(`/api/podograma/fotos?${params}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao remover foto.");
      }

      informar(data.message || "Foto removida.");
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao remover foto.",
      );
    } finally {
      setProcessandoFoto(false);
    }
  }

  if (carregando) {
    return (
      <div className={styles.loadingState}>
        <LoaderCircle className={styles.spinner} size={22} />
        Carregando Podograma...
      </div>
    );
  }

  return (
    <div className={styles.podograma}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Mapeamento clínico visual</span>
          <h3>
            <Footprints size={20} /> Podograma
          </h3>
          <p>
            Toque diretamente no ponto do pé para registrar uma ocorrência e
            acompanhe a evolução por atendimento.
          </p>
        </div>
        {podeEditar ? (
          <div className={styles.headerHint}>
            <Crosshair size={17} />
            Clique no mapa para marcar
          </div>
        ) : null}
      </header>

      <div className={styles.metrics}>
        <article>
          <CircleDot size={17} />
          <span>Ativas</span>
          <strong>{estatisticas.ativas}</strong>
        </article>
        <article>
          <Activity size={17} />
          <span>Em tratamento</span>
          <strong>{estatisticas.tratamento}</strong>
        </article>
        <article>
          <CheckCircle2 size={17} />
          <span>Resolvidas</span>
          <strong>{estatisticas.resolvidas}</strong>
        </article>
        <article>
          <Camera size={17} />
          <span>Fotos clínicas</span>
          <strong>{estatisticas.fotos}</strong>
        </article>
      </div>

      <section className={styles.controls}>
        <div className={styles.viewTabs} aria-label="Vista do Podograma">
          {PODOGRAMA_VISTAS.map((item) => (
            <button
              key={item}
              type="button"
              className={
                vista === item ? styles.viewTabActive : styles.viewTab
              }
              onClick={() => setVista(item)}
            >
              <Eye size={14} /> {PODOGRAMA_VISTA_LABELS[item]}
            </button>
          ))}
        </div>

        <div className={styles.filters}>
          <label>
            <span>Status</span>
            <select
              value={statusFiltro}
              onChange={(event) =>
                setStatusFiltro(event.target.value as StatusFiltro)
              }
            >
              <option value="ativas">Em acompanhamento</option>
              <option value="todos">Todas</option>
              <option value="resolvidas">Resolvidas</option>
            </select>
          </label>

          <label>
            <span>Atendimento</span>
            <select
              value={atendimentoFiltro}
              onChange={(event) => setAtendimentoFiltro(event.target.value)}
            >
              <option value="todos">Todo o histórico</option>
              <option value="sem_atendimento">
                Sem atendimento vinculado
              </option>
              {atendimentos.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatarDataHora(item.data_atendimento)} ·{" "}
                  {formatarTipoAtendimento(item.tipo)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {erro ? <div className={styles.error}>{erro}</div> : null}
      {mensagem ? (
        <div className={styles.success}>
          {mensagem}
          <button
            type="button"
            onClick={() => setMensagem("")}
            aria-label="Fechar mensagem"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className={styles.workspace}>
        <section className={styles.mapCard}>
          <div className={styles.mapHeader}>
            <div>
              <span className={styles.eyebrow}>
                Vista {PODOGRAMA_VISTA_LABELS[vista]}
              </span>
              <h4>Localização anatômica</h4>
            </div>
            <span className={styles.visibleCount}>
              {marcacoesVisiveis.length} marcação(ões)
            </span>
          </div>

          {vista === "lateral" ? (
            <div
              className={styles.saveFirstHint}
              style={{ marginTop: 0, marginBottom: 12, textAlign: "left" }}
            >
              <Eye size={15} />
              Perfil lateral do pé com tornozelo, calcâneo, arco, antepé e
              dedos representados no eixo horizontal.
            </div>
          ) : null}

          <div className={styles.feetGrid}>
            {(["esquerdo", "direito"] as PodogramaLado[]).map((lado) => {
              const marcacoesPe = marcacoesVisiveis.filter(
                (item) => item.lado === lado,
              );

              return (
                <article key={lado} className={styles.footCard}>
                  <div className={styles.footTitle}>
                    <Footprints size={16} />
                    <strong>{PODOGRAMA_LADO_LABELS[lado]}</strong>
                    <span>{marcacoesPe.length}</span>
                  </div>

                  <div
                    className={styles.footCanvas}
                    style={
                      vista === "lateral"
                        ? { minHeight: 220, aspectRatio: "1.65 / 1" }
                        : undefined
                    }
                    onClick={(event) => criarMarcacao(event, lado)}
                    aria-label={`${PODOGRAMA_LADO_LABELS[lado]}, vista ${
                      PODOGRAMA_VISTA_LABELS[vista]
                    }`}
                  >
                    <SilhuetaPe vista={vista} lado={lado} />

                    {marcacoesPe.map((marcacao) => (
                      <button
                        key={marcacao.id}
                        type="button"
                        className={`${classeMarker(
                          marcacao.status,
                          marcacao.severidade,
                        )} ${
                          form?.id === marcacao.id
                            ? styles.markerSelected
                            : ""
                        }`}
                        style={{
                          left: `${numero(marcacao.coordenada_x)}%`,
                          top: `${numero(marcacao.coordenada_y)}%`,
                        }}
                        title={`${
                          PODOGRAMA_OCORRENCIA_LABELS[
                            marcacao.tipo_ocorrencia
                          ]
                        } · ${marcacao.regiao_anatomica}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          editarMarcacao(marcacao);
                        }}
                      >
                        <MapPin size={17} fill="currentColor" />
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          <div className={styles.legend}>
            <span>
              <i className={styles.legendActive} /> Ativa
            </span>
            <span>
              <i className={styles.legendTreatment} /> Em tratamento
            </span>
            <span>
              <i className={styles.legendObserve} /> Observação
            </span>
            <span>
              <i className={styles.legendResolved} /> Resolvida
            </span>
          </div>
        </section>

        <aside className={styles.editorCard}>
          {form ? (
            <>
              <div className={styles.editorHeader}>
                <div>
                  <span className={styles.eyebrow}>
                    {form.id ? "Editar ocorrência" : "Nova ocorrência"}
                  </span>
                  <h4>
                    {PODOGRAMA_LADO_LABELS[form.lado]} ·{" "}
                    {PODOGRAMA_VISTA_LABELS[form.vista]}
                  </h4>
                </div>

                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={fecharEditor}
                  aria-label="Fechar editor"
                >
                  <X size={17} />
                </button>
              </div>

              <div className={styles.positionInfo}>
                <Crosshair size={15} />
                Posição {form.coordenada_x.toFixed(1)}% ×{" "}
                {form.coordenada_y.toFixed(1)}%
              </div>

              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Região anatômica</span>
                  <select
                    value={form.regiao_anatomica}
                    disabled={!podeEditar}
                    onChange={(event) =>
                      setForm((atual) =>
                        atual
                          ? {
                              ...atual,
                              regiao_anatomica: event.target
                                .value as PodogramaRegiao,
                            }
                          : atual,
                      )
                    }
                  >
                    {PODOGRAMA_REGIOES.map((item) => (
                      <option key={item} value={item}>
                        {PODOGRAMA_REGIAO_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Ocorrência</span>
                  <select
                    value={form.tipo_ocorrencia}
                    disabled={!podeEditar}
                    onChange={(event) =>
                      setForm((atual) =>
                        atual
                          ? {
                              ...atual,
                              tipo_ocorrencia: event.target
                                .value as PodogramaOcorrencia,
                            }
                          : atual,
                      )
                    }
                  >
                    {PODOGRAMA_OCORRENCIAS.map((item) => (
                      <option key={item} value={item}>
                        {PODOGRAMA_OCORRENCIA_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Gravidade</span>
                  <select
                    value={form.severidade}
                    disabled={!podeEditar}
                    onChange={(event) =>
                      setForm((atual) =>
                        atual
                          ? {
                              ...atual,
                              severidade: event.target
                                .value as PodogramaSeveridade,
                            }
                          : atual,
                      )
                    }
                  >
                    {PODOGRAMA_SEVERIDADES.map((item) => (
                      <option key={item} value={item}>
                        {PODOGRAMA_SEVERIDADE_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Status</span>
                  <select
                    value={form.status}
                    disabled={!podeEditar}
                    onChange={(event) =>
                      setForm((atual) =>
                        atual
                          ? {
                              ...atual,
                              status: event.target.value as PodogramaStatus,
                            }
                          : atual,
                      )
                    }
                  >
                    {PODOGRAMA_STATUS.map((item) => (
                      <option key={item} value={item}>
                        {PODOGRAMA_STATUS_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={`${styles.field} ${styles.fullField}`}>
                  <span>Vincular ao atendimento</span>
                  <select
                    value={form.atendimento_id}
                    disabled={!podeEditar}
                    onChange={(event) =>
                      setForm((atual) =>
                        atual
                          ? {
                              ...atual,
                              atendimento_id: event.target.value,
                            }
                          : atual,
                      )
                    }
                  >
                    <option value="">Sem atendimento vinculado</option>
                    {atendimentos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatarDataHora(item.data_atendimento)} ·{" "}
                        {formatarTipoAtendimento(item.tipo)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={`${styles.field} ${styles.fullField}`}>
                  <span>Procedimento / conduta</span>
                  <textarea
                    value={form.procedimento}
                    disabled={!podeEditar}
                    onChange={(event) =>
                      setForm((atual) =>
                        atual
                          ? { ...atual, procedimento: event.target.value }
                          : atual,
                      )
                    }
                    placeholder="Registre o procedimento realizado ou planejado..."
                  />
                </label>

                <label className={`${styles.field} ${styles.fullField}`}>
                  <span>Observações clínicas</span>
                  <textarea
                    value={form.observacoes}
                    disabled={!podeEditar}
                    onChange={(event) =>
                      setForm((atual) =>
                        atual
                          ? { ...atual, observacoes: event.target.value }
                          : atual,
                      )
                    }
                    placeholder="Aspecto, sintomas relatados, evolução e demais observações..."
                  />
                </label>
              </div>

              <section className={styles.photoSection}>
                <div className={styles.photoHeader}>
                  <div>
                    <span className={styles.eyebrow}>
                      Evolução fotográfica
                    </span>
                    <h5>Mídias clínicas</h5>
                  </div>
                  <Camera size={17} />
                </div>

                {podeEditar ? (
                  <div className={styles.photoUpload}>
                    <div className={styles.photoUploadGrid}>
                      <label className={styles.field}>
                        <span>Momento</span>
                        <select
                          value={momentoFoto}
                          onChange={(event) =>
                            setMomentoFoto(
                              event.target.value as PodogramaMomentoFoto,
                            )
                          }
                        >
                          {PODOGRAMA_MOMENTOS_FOTO.map((item) => (
                            <option key={item} value={item}>
                              {PODOGRAMA_MOMENTO_FOTO_LABELS[item]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.field}>
                        <span>Legenda</span>
                        <input
                          value={legendaFoto}
                          onChange={(event) =>
                            setLegendaFoto(event.target.value)
                          }
                          placeholder="Ex.: aspecto antes do procedimento"
                        />
                      </label>
                    </div>

                    <input
                      ref={inputFotoRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      className={styles.fileInput}
                      onChange={(event) =>
                        selecionarFotos(event.target.files)
                      }
                    />

                    <button
                      type="button"
                      className={styles.secondaryButton}
                      style={{ width: "100%" }}
                      onClick={() => inputFotoRef.current?.click()}
                      disabled={salvando}
                    >
                      <Paperclip size={16} />
                      Anexar mídia antes de salvar
                    </button>

                    <small>
                      Selecione uma ou mais fotos. Elas ficam preparadas no
                      formulário e só são enviadas quando a ocorrência for
                      salva. JPG, PNG ou WebP · até 10 MB por arquivo.
                    </small>

                    {fotosPendentes.length ? (
                      <div className={styles.photoGrid}>
                        {fotosPendentes.map((foto) => (
                          <article
                            key={foto.id}
                            className={styles.photoCard}
                          >
                            <Image
                              loader={({ src }) => src}
                              unoptimized
                              src={foto.previewUrl}
                              alt={foto.arquivo.name}
                              width={180}
                              height={120}
                            />
                            <div className={styles.photoMeta}>
                              <span>
                                {PODOGRAMA_MOMENTO_FOTO_LABELS[momentoFoto]}
                              </span>
                              <small>
                                {foto.arquivo.name} ·{" "}
                                {(foto.arquivo.size / 1024 / 1024).toFixed(1)} MB
                              </small>
                              {legendaFoto ? <p>{legendaFoto}</p> : null}
                            </div>
                            <button
                              type="button"
                              className={styles.photoDelete}
                              onClick={() => removerFotoPendente(foto.id)}
                              aria-label={`Remover ${foto.arquivo.name}`}
                            >
                              <X size={14} />
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {form.id ? (
                  marcacaoSelecionada?.fotos?.length ? (
                    <div className={styles.photoGrid}>
                      {marcacaoSelecionada.fotos.map((foto) => (
                        <article key={foto.id} className={styles.photoCard}>
                          {foto.url ? (
                            <Image
                              loader={({ src }) => src}
                              unoptimized
                              src={foto.url}
                              alt={
                                foto.legenda ||
                                "Foto clínica do Podograma"
                              }
                              width={220}
                              height={160}
                            />
                          ) : (
                            <div className={styles.photoUnavailable}>
                              <Camera size={20} /> Foto indisponível
                            </div>
                          )}

                          <div className={styles.photoMeta}>
                            <span>
                              {
                                PODOGRAMA_MOMENTO_FOTO_LABELS[
                                  foto.momento
                                ]
                              }
                            </span>
                            <small>
                              {formatarDataHora(foto.created_at)}
                            </small>
                            {foto.legenda ? <p>{foto.legenda}</p> : null}
                          </div>

                          {podeEditar ? (
                            <button
                              type="button"
                              className={styles.photoDelete}
                              onClick={() => void removerFoto(foto.id)}
                              disabled={processandoFoto}
                              aria-label="Remover foto"
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyPhotos}>
                      Nenhuma foto já salva nesta ocorrência.
                    </div>
                  )
                ) : (
                  <div className={styles.saveFirstHint}>
                    <ImagePlus size={17} />
                    Você pode anexar as fotos agora. Ao tocar em{" "}
                    <strong>Salvar ocorrência</strong>, a ocorrência e as
                    mídias serão registradas juntas no fluxo.
                  </div>
                )}
              </section>

              {podeEditar ? (
                <div className={styles.editorActions}>
                  {form.id ? (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => setConfirmandoExclusao(true)}
                      disabled={salvando}
                    >
                      <Trash2 size={15} /> Excluir
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void salvarMarcacao()}
                    disabled={salvando}
                  >
                    {salvando ? (
                      <LoaderCircle
                        className={styles.spinner}
                        size={16}
                      />
                    ) : (
                      <Save size={16} />
                    )}
                    {salvando
                      ? fotosPendentes.length
                        ? "Salvando e enviando mídias..."
                        : "Salvando..."
                      : fotosPendentes.length
                        ? `Salvar ocorrência + ${fotosPendentes.length} mídia(s)`
                        : "Salvar ocorrência"}
                  </button>
                </div>
              ) : null}

              {confirmandoExclusao ? (
                <div className={styles.deleteConfirm}>
                  <p>
                    Excluir esta marcação e todas as fotos vinculadas?
                  </p>
                  <div>
                    <button
                      type="button"
                      onClick={() => setConfirmandoExclusao(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void excluirMarcacao()}
                      disabled={salvando}
                    >
                      Excluir definitivamente
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.editorEmpty}>
              <div className={styles.editorEmptyIcon}>
                <Crosshair size={25} />
              </div>
              <h4>
                {podeEditar
                  ? "Marque um ponto do pé"
                  : "Selecione uma marcação"}
              </h4>
              <p>
                {podeEditar
                  ? "Escolha a vista e clique no ponto exato do desenho. Depois informe a ocorrência e, se quiser, anexe as fotos antes de salvar."
                  : "Clique em uma marcação existente para consultar os detalhes clínicos e as fotos."}
              </p>
            </div>
          )}
        </aside>
      </div>

      <section className={styles.historyCard}>
        <div className={styles.historyHeader}>
          <div>
            <span className={styles.eyebrow}>Linha do tempo</span>
            <h4>
              <Clock3 size={17} /> Histórico do Podograma
            </h4>
          </div>
          <span>{marcacoes.length} registro(s)</span>
        </div>

        {marcacoes.length === 0 ? (
          <div className={styles.emptyHistory}>
            Ainda não há ocorrências registradas neste Podograma.
          </div>
        ) : (
          <div className={styles.timeline}>
            {marcacoes.map((marcacao) => {
              const atendimento = marcacao.atendimento_id
                ? atendimentoPorId.get(marcacao.atendimento_id)
                : null;

              return (
                <button
                  key={marcacao.id}
                  type="button"
                  className={styles.timelineItem}
                  onClick={() => editarMarcacao(marcacao)}
                >
                  <span
                    className={`${styles.timelineDot} ${classeStatus(
                      marcacao.status,
                    )}`}
                  />
                  <div className={styles.timelineBody}>
                    <div className={styles.timelineTitle}>
                      <strong>
                        {
                          PODOGRAMA_OCORRENCIA_LABELS[
                            marcacao.tipo_ocorrencia
                          ]
                        }
                      </strong>
                      <span>
                        {PODOGRAMA_STATUS_LABELS[marcacao.status]}
                      </span>
                    </div>
                    <p>
                      {PODOGRAMA_LADO_LABELS[marcacao.lado]} ·{" "}
                      {PODOGRAMA_VISTA_LABELS[marcacao.vista]} ·{" "}
                      {PODOGRAMA_REGIAO_LABELS[
                        marcacao.regiao_anatomica as PodogramaRegiao
                      ] ?? marcacao.regiao_anatomica}
                    </p>
                    <small>
                      {atendimento
                        ? `${formatarDataHora(
                            atendimento.data_atendimento,
                          )} · ${formatarTipoAtendimento(atendimento.tipo)}`
                        : `Registrado em ${formatarDataHora(
                            marcacao.created_at,
                          )}`}
                      {marcacao.fotos?.length
                        ? ` · ${marcacao.fotos.length} foto(s)`
                        : ""}
                    </small>
                  </div>
                  <Pencil size={15} />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
