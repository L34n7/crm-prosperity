"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
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
import styles from "./PodogramaInterativo.module.css";

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

function limitar(valor: number, minimo = 0, maximo = 100) {
  return Math.max(minimo, Math.min(maximo, valor));
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
    const anatomicoX = lado === "direito" ? 100 - x : x;
    if (anatomicoX < 22) return "dedos";
    if (anatomicoX < 40) return "antepe";
    if (anatomicoX < 65) return y > 58 ? "arco_lateral" : "mediape";
    if (anatomicoX < 87 && y > 45) return "calcaneo";
    return "outra";
  }

  if (vista === "dorsal" && y < 19) return "unhas";
  if (y < 22) return x < 34 || x > 66 ? "dedos" : "halux";
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

function SilhuetaPe({
  vista,
  lado,
  podeMarcar,
  onMarcar,
}: {
  vista: PodogramaVista;
  lado: PodogramaLado;
  podeMarcar: boolean;
  onMarcar: (x: number, y: number) => void;
}) {
  function apontar(event: ReactPointerEvent<SVGSVGElement>) {
    if (!podeMarcar) return;
    const alvo = event.target as Element;
    if (!alvo.closest('[data-podograma-area="true"]')) return;

    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = limitar(((event.clientX - rect.left) / rect.width) * 100);
    const y = limitar(((event.clientY - rect.top) / rect.height) * 100);
    onMarcar(
      Math.round(x * 1000) / 1000,
      Math.round(y * 1000) / 1000,
    );
  }

  if (vista === "lateral") {
    const espelhar = lado === "direito" ? "translate(520 0) scale(-1 1)" : undefined;
    return (
      <svg
        viewBox="0 0 520 300"
        className={styles.svg}
        onPointerDown={apontar}
        role="img"
        aria-label={`${PODOGRAMA_LADO_LABELS[lado]} em vista lateral`}
      >
        <g transform={espelhar}>
          <path
            data-podograma-area="true"
            className={styles.footShape}
            d="M32 201 C35 184 48 174 67 172 C91 170 116 162 145 151 C184 136 220 120 258 103 C289 89 316 76 339 61 C355 50 363 34 369 15 L446 15 C445 45 444 76 447 107 C450 137 458 157 476 170 C496 184 505 202 502 222 C499 244 482 260 456 266 C427 272 400 267 371 257 C341 247 317 245 292 251 C264 258 238 266 207 269 C171 273 139 268 111 256 C87 246 68 234 52 225 C39 217 31 210 32 201 Z"
          />
          <path data-podograma-area="true" className={styles.toeOverlay} d="M31 201 C36 186 49 178 67 177 C87 176 101 180 111 188 C100 202 82 211 61 214 C47 216 36 211 31 201 Z" />
          <path className={styles.anatomyLine} d="M368 64 C385 81 406 87 444 84" />
          <path className={styles.anatomyLine} d="M361 258 C330 235 302 230 271 239 C243 247 222 259 193 263" />
          <path className={styles.anatomyLine} d="M151 151 C181 162 210 161 241 151" />
          <path className={styles.anatomyLine} d="M65 174 C75 184 78 196 75 210 M88 167 C97 178 101 190 98 204 M112 160 C122 171 126 183 123 196" />
          <ellipse className={styles.anatomySoft} cx="420" cy="208" rx="44" ry="36" />
        </g>
      </svg>
    );
  }

  const espelhar = lado === "direito" ? "translate(240 0) scale(-1 1)" : undefined;
  return (
    <svg
      viewBox="0 0 240 480"
      className={styles.svg}
      onPointerDown={apontar}
      role="img"
      aria-label={`${PODOGRAMA_LADO_LABELS[lado]} em vista ${PODOGRAMA_VISTA_LABELS[vista]}`}
    >
      <g transform={espelhar}>
        <ellipse data-podograma-area="true" className={styles.toeShape} cx="66" cy="48" rx="24" ry="30" />
        <ellipse data-podograma-area="true" className={styles.toeShape} cx="104" cy="36" rx="18" ry="23" />
        <ellipse data-podograma-area="true" className={styles.toeShape} cx="136" cy="39" rx="16" ry="21" />
        <ellipse data-podograma-area="true" className={styles.toeShape} cx="165" cy="48" rx="14" ry="19" />
        <ellipse data-podograma-area="true" className={styles.toeShape} cx="190" cy="61" rx="12" ry="17" />
        <path
          data-podograma-area="true"
          className={styles.footShape}
          d="M45 100 C55 76 80 69 108 72 C143 75 176 81 196 103 C216 125 214 159 203 189 C190 223 173 246 171 277 C169 304 184 327 188 359 C194 404 171 447 126 459 C86 469 52 447 45 408 C39 373 54 340 58 309 C62 277 50 253 38 224 C23 188 22 145 45 100 Z"
        />
        {vista === "plantar" ? (
          <>
            <path className={styles.anatomyLine} d="M54 169 C96 190 158 190 201 165" />
            <path className={styles.anatomyLine} d="M63 302 C91 287 136 285 170 302" />
            <ellipse className={styles.anatomySoft} cx="117" cy="391" rx="53" ry="48" />
          </>
        ) : (
          <>
            <path className={styles.anatomyLine} d="M53 149 C102 132 155 137 204 159" />
            <path className={styles.anatomyLine} d="M79 240 C113 224 148 226 176 241" />
            <path className={styles.anatomyLine} d="M86 84 L73 49 M112 78 L104 36 M140 82 L136 39 M166 90 L165 48 M187 103 L190 61" />
          </>
        )}
      </g>
    </svg>
  );
}

function classeStatus(status: PodogramaStatus) {
  if (status === "resolvida") return styles.markerResolved;
  if (status === "em_tratamento") return styles.markerTreatment;
  if (status === "observacao") return styles.markerObserve;
  return styles.markerActive;
}

export default function PodogramaInterativo({ pacienteId, podeEditar, onFeedback }: Props) {
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
  const [momentoFoto, setMomentoFoto] = useState<PodogramaMomentoFoto>("registro");
  const [legendaFoto, setLegendaFoto] = useState("");
  const [fotosPendentes, setFotosPendentes] = useState<FotoPendente[]>([]);
  const inputFotoRef = useRef<HTMLInputElement | null>(null);
  const fotosPendentesRef = useRef<FotoPendente[]>([]);

  useEffect(() => {
    fotosPendentesRef.current = fotosPendentes;
  }, [fotosPendentes]);

  useEffect(() => {
    return () => {
      fotosPendentesRef.current.forEach((foto) => URL.revokeObjectURL(foto.previewUrl));
    };
  }, []);

  const informar = useCallback((textoFeedback: string) => {
    setMensagem(textoFeedback);
    onFeedback?.(textoFeedback);
  }, [onFeedback]);

  const carregar = useCallback(async () => {
    if (!pacienteId) return;
    setCarregando(true);
    setErro("");
    try {
      const params = new URLSearchParams({ paciente_id: pacienteId });
      const response = await fetch(`/api/podograma?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao carregar Podograma.");
      }
      setMarcacoes(Array.isArray(data.marcacoes) ? data.marcacoes : []);
      setAtendimentos(Array.isArray(data.atendimentos) ? data.atendimentos : []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar Podograma.");
    } finally {
      setCarregando(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const marcacaoSelecionada = useMemo(
    () => (form?.id ? marcacoes.find((item) => item.id === form.id) ?? null : null),
    [form?.id, marcacoes],
  );

  const marcacoesVisiveis = useMemo(() => marcacoes.filter((item) => {
    if (item.vista !== vista) return false;
    if (statusFiltro === "ativas" && item.status === "resolvida") return false;
    if (statusFiltro === "resolvidas" && item.status !== "resolvida") return false;
    if (atendimentoFiltro === "sem_atendimento" && item.atendimento_id) return false;
    if (
      atendimentoFiltro !== "todos" &&
      atendimentoFiltro !== "sem_atendimento" &&
      item.atendimento_id !== atendimentoFiltro
    ) return false;
    return true;
  }), [atendimentoFiltro, marcacoes, statusFiltro, vista]);

  const estatisticas = useMemo(() => ({
    ativas: marcacoes.filter((item) => item.status === "ativa").length,
    tratamento: marcacoes.filter((item) => item.status === "em_tratamento").length,
    resolvidas: marcacoes.filter((item) => item.status === "resolvida").length,
    fotos: marcacoes.reduce((total, item) => total + (item.fotos?.length ?? 0), 0),
  }), [marcacoes]);

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

  function criarMarcacao(lado: PodogramaLado, x: number, y: number) {
    if (!podeEditar) return;
    limparFotosPendentes();
    setMomentoFoto("registro");
    setLegendaFoto("");
    setForm({
      id: null,
      lado,
      vista,
      coordenada_x: x,
      coordenada_y: y,
      regiao_anatomica: regiaoAutomatica(vista, lado, x, y),
      tipo_ocorrencia: "outra",
      severidade: "moderada",
      status: "ativa",
      atendimento_id:
        atendimentoFiltro !== "todos" && atendimentoFiltro !== "sem_atendimento"
          ? atendimentoFiltro
          : "",
      procedimento: "",
      observacoes: "",
    });
    setConfirmandoExclusao(false);
  }

  function editarMarcacao(marcacao: MarcacaoPodograma) {
    limparFotosPendentes();
    setVista(marcacao.vista);
    setForm(formDaMarcacao(marcacao));
    setConfirmandoExclusao(false);
    setMomentoFoto("registro");
    setLegendaFoto("");
  }

  function selecionarFotos(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    const validas: FotoPendente[] = [];
    const erros: string[] = [];

    Array.from(arquivos).forEach((arquivo) => {
      if (!MIMES_FOTO.has(arquivo.type)) {
        erros.push(`${arquivo.name}: formato não permitido`);
        return;
      }
      if (arquivo.size <= 0 || arquivo.size > LIMITE_FOTO_BYTES) {
        erros.push(`${arquivo.name}: máximo de 10 MB`);
        return;
      }
      validas.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        arquivo,
        previewUrl: URL.createObjectURL(arquivo),
      });
    });

    if (validas.length) setFotosPendentes((atuais) => [...atuais, ...validas]);
    setErro(erros.join(" · "));
    if (inputFotoRef.current) inputFotoRef.current.value = "";
  }

  function removerFotoPendente(id: string) {
    setFotosPendentes((atuais) => {
      const removida = atuais.find((foto) => foto.id === id);
      if (removida) URL.revokeObjectURL(removida.previewUrl);
      return atuais.filter((foto) => foto.id !== id);
    });
  }

  async function enviarFotoParaMarcacao(foto: FotoPendente, marcacaoId: string) {
    const body = new FormData();
    body.append("arquivo", foto.arquivo);
    body.append("paciente_id", pacienteId);
    body.append("marcacao_id", marcacaoId);
    body.append("momento", momentoFoto);
    body.append("legenda", legendaFoto);

    const response = await fetch("/api/podograma/fotos", { method: "POST", body });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `Erro ao anexar ${foto.arquivo.name}.`);
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

      const idSalvo = String(data.marcacao?.id ?? "").trim();
      if (!idSalvo) throw new Error("Ocorrência salva sem identificador.");

      const pendentes = [...fotosPendentes];
      const falhas: FotoPendente[] = [];
      const errosFotos: string[] = [];
      for (const foto of pendentes) {
        try {
          await enviarFotoParaMarcacao(foto, idSalvo);
          URL.revokeObjectURL(foto.previewUrl);
        } catch (error) {
          falhas.push(foto);
          errosFotos.push(error instanceof Error ? error.message : `Erro ao anexar ${foto.arquivo.name}.`);
        }
      }

      setFotosPendentes(falhas);
      setForm((atual) => (atual ? { ...atual, id: idSalvo } : atual));
      await carregar();

      if (falhas.length) {
        setErro(`Ocorrência salva, mas ${falhas.length} mídia(s) não foram enviada(s): ${errosFotos.join(" · ")}`);
      } else {
        informar(
          pendentes.length
            ? `${data.message || "Ocorrência salva."} ${pendentes.length} mídia(s) anexada(s).`
            : data.message || "Podograma atualizado.",
        );
        setLegendaFoto("");
        setMomentoFoto("registro");
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar Podograma.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirMarcacao() {
    if (!form?.id) return;
    setSalvando(true);
    setErro("");
    try {
      const params = new URLSearchParams({ id: form.id, paciente_id: pacienteId });
      const response = await fetch(`/api/podograma?${params}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Erro ao excluir marcação.");
      informar(data.message || "Marcação removida.");
      fecharEditor();
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao excluir marcação.");
    } finally {
      setSalvando(false);
    }
  }

  async function removerFoto(fotoId: string) {
    setProcessandoFoto(true);
    setErro("");
    try {
      const params = new URLSearchParams({ id: fotoId, paciente_id: pacienteId });
      const response = await fetch(`/api/podograma/fotos?${params}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Erro ao remover foto.");
      informar(data.message || "Foto removida.");
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao remover foto.");
    } finally {
      setProcessandoFoto(false);
    }
  }

  if (carregando) {
    return <div className={styles.loading}><LoaderCircle className={styles.spinner} size={22} /> Carregando Podograma...</div>;
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Mapeamento clínico visual</span>
          <h3><Footprints size={20} /> Podograma</h3>
          <p>Toque ou clique diretamente sobre o desenho do pé. O marcador aparece imediatamente antes de salvar.</p>
        </div>
        {podeEditar ? <span className={styles.headerHint}><Crosshair size={16} /> Toque no pé para marcar</span> : null}
      </header>

      <div className={styles.metrics}>
        <article><CircleDot size={17} /><span>Ativas</span><strong>{estatisticas.ativas}</strong></article>
        <article><Activity size={17} /><span>Em tratamento</span><strong>{estatisticas.tratamento}</strong></article>
        <article><CheckCircle2 size={17} /><span>Resolvidas</span><strong>{estatisticas.resolvidas}</strong></article>
        <article><Camera size={17} /><span>Fotos clínicas</span><strong>{estatisticas.fotos}</strong></article>
      </div>

      <section className={styles.controls}>
        <div className={styles.viewTabs}>
          {PODOGRAMA_VISTAS.map((item) => (
            <button key={item} type="button" className={vista === item ? styles.viewActive : styles.viewButton} onClick={() => setVista(item)}>
              <Eye size={14} /> {PODOGRAMA_VISTA_LABELS[item]}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          <label><span>Status</span><select value={statusFiltro} onChange={(event) => setStatusFiltro(event.target.value as StatusFiltro)}><option value="ativas">Em acompanhamento</option><option value="todos">Todas</option><option value="resolvidas">Resolvidas</option></select></label>
          <label><span>Atendimento</span><select value={atendimentoFiltro} onChange={(event) => setAtendimentoFiltro(event.target.value)}><option value="todos">Todo o histórico</option><option value="sem_atendimento">Sem atendimento vinculado</option>{atendimentos.map((item) => <option key={item.id} value={item.id}>{formatarDataHora(item.data_atendimento)} · {formatarTipoAtendimento(item.tipo)}</option>)}</select></label>
        </div>
      </section>

      {erro ? <div className={styles.error}>{erro}</div> : null}
      {mensagem ? <div className={styles.success}>{mensagem}<button type="button" onClick={() => setMensagem("")}><X size={14} /></button></div> : null}

      <div className={styles.workspace}>
        <section className={styles.mapCard}>
          <div className={styles.mapHeader}>
            <div><span className={styles.eyebrow}>Vista {PODOGRAMA_VISTA_LABELS[vista]}</span><h4>Localização anatômica</h4></div>
            <span className={styles.visibleCount}>{marcacoesVisiveis.length} marcação(ões)</span>
          </div>

          {vista === "lateral" ? (
            <div className={styles.lateralHint}>Perfil lateral anatômico: dedos, antepé, arco, calcâneo e tornozelo.</div>
          ) : null}

          <div className={styles.feetGrid}>
            {(["esquerdo", "direito"] as PodogramaLado[]).map((lado) => {
              const marcacoesPe = marcacoesVisiveis.filter((item) => item.lado === lado);
              const rascunho = form && !form.id && form.lado === lado && form.vista === vista ? form : null;
              return (
                <article key={lado} className={styles.footCard}>
                  <div className={styles.footTitle}><Footprints size={16} /><strong>{PODOGRAMA_LADO_LABELS[lado]}</strong><span>{marcacoesPe.length}</span></div>
                  <div className={`${styles.footCanvas} ${vista === "lateral" ? styles.footCanvasLateral : ""}`}>
                    <div className={`${styles.interactiveArea} ${vista === "lateral" ? styles.interactiveLateral : styles.interactiveVertical}`}>
                      <SilhuetaPe vista={vista} lado={lado} podeMarcar={podeEditar} onMarcar={(x, y) => criarMarcacao(lado, x, y)} />

                      {marcacoesPe.map((marcacao, indice) => (
                        <button
                          key={marcacao.id}
                          type="button"
                          className={`${styles.marker} ${classeStatus(marcacao.status)} ${form?.id === marcacao.id ? styles.markerSelected : ""}`}
                          style={{ left: `${limitar(numero(marcacao.coordenada_x))}%`, top: `${limitar(numero(marcacao.coordenada_y))}%` }}
                          title={`${PODOGRAMA_OCORRENCIA_LABELS[marcacao.tipo_ocorrencia]} · ${PODOGRAMA_REGIAO_LABELS[marcacao.regiao_anatomica as PodogramaRegiao] ?? marcacao.regiao_anatomica}`}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            editarMarcacao(marcacao);
                          }}
                        >
                          <MapPin size={15} fill="currentColor" />
                          <b>{indice + 1}</b>
                        </button>
                      ))}

                      {rascunho ? (
                        <span className={`${styles.marker} ${styles.markerDraft}`} style={{ left: `${rascunho.coordenada_x}%`, top: `${rascunho.coordenada_y}%` }}>
                          <MapPin size={15} fill="currentColor" /><b>+</b>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {rascunho ? <div className={styles.draftHint}><Crosshair size={14} /> Marcador provisório adicionado. Complete os dados e salve a ocorrência.</div> : null}
                </article>
              );
            })}
          </div>

          <div className={styles.legend}><span><i className={styles.legendActive} />Ativa</span><span><i className={styles.legendTreatment} />Em tratamento</span><span><i className={styles.legendObserve} />Observação</span><span><i className={styles.legendResolved} />Resolvida</span><span><i className={styles.legendDraft} />Novo ponto</span></div>
        </section>

        <aside className={styles.editorCard}>
          {form ? (
            <>
              <div className={styles.editorHeader}>
                <div><span className={styles.eyebrow}>{form.id ? "Editar ocorrência" : "Nova ocorrência"}</span><h4>{PODOGRAMA_LADO_LABELS[form.lado]} · {PODOGRAMA_VISTA_LABELS[form.vista]}</h4></div>
                <button type="button" className={styles.iconButton} onClick={fecharEditor} aria-label="Fechar editor"><X size={17} /></button>
              </div>
              <div className={styles.positionInfo}><Crosshair size={15} /> Posição {form.coordenada_x.toFixed(1)}% × {form.coordenada_y.toFixed(1)}%</div>

              <div className={styles.formGrid}>
                <label className={styles.field}><span>Região anatômica</span><select value={form.regiao_anatomica} disabled={!podeEditar} onChange={(event) => setForm((atual) => atual ? { ...atual, regiao_anatomica: event.target.value as PodogramaRegiao } : atual)}>{PODOGRAMA_REGIOES.map((item) => <option key={item} value={item}>{PODOGRAMA_REGIAO_LABELS[item]}</option>)}</select></label>
                <label className={styles.field}><span>Ocorrência</span><select value={form.tipo_ocorrencia} disabled={!podeEditar} onChange={(event) => setForm((atual) => atual ? { ...atual, tipo_ocorrencia: event.target.value as PodogramaOcorrencia } : atual)}>{PODOGRAMA_OCORRENCIAS.map((item) => <option key={item} value={item}>{PODOGRAMA_OCORRENCIA_LABELS[item]}</option>)}</select></label>
                <label className={styles.field}><span>Gravidade</span><select value={form.severidade} disabled={!podeEditar} onChange={(event) => setForm((atual) => atual ? { ...atual, severidade: event.target.value as PodogramaSeveridade } : atual)}>{PODOGRAMA_SEVERIDADES.map((item) => <option key={item} value={item}>{PODOGRAMA_SEVERIDADE_LABELS[item]}</option>)}</select></label>
                <label className={styles.field}><span>Status</span><select value={form.status} disabled={!podeEditar} onChange={(event) => setForm((atual) => atual ? { ...atual, status: event.target.value as PodogramaStatus } : atual)}>{PODOGRAMA_STATUS.map((item) => <option key={item} value={item}>{PODOGRAMA_STATUS_LABELS[item]}</option>)}</select></label>
                <label className={`${styles.field} ${styles.fullField}`}><span>Vincular ao atendimento</span><select value={form.atendimento_id} disabled={!podeEditar} onChange={(event) => setForm((atual) => atual ? { ...atual, atendimento_id: event.target.value } : atual)}><option value="">Sem atendimento vinculado</option>{atendimentos.map((item) => <option key={item.id} value={item.id}>{formatarDataHora(item.data_atendimento)} · {formatarTipoAtendimento(item.tipo)}</option>)}</select></label>
                <label className={`${styles.field} ${styles.fullField}`}><span>Procedimento / conduta</span><textarea value={form.procedimento} disabled={!podeEditar} onChange={(event) => setForm((atual) => atual ? { ...atual, procedimento: event.target.value } : atual)} /></label>
                <label className={`${styles.field} ${styles.fullField}`}><span>Observações clínicas</span><textarea value={form.observacoes} disabled={!podeEditar} onChange={(event) => setForm((atual) => atual ? { ...atual, observacoes: event.target.value } : atual)} /></label>
              </div>

              <section className={styles.photoSection}>
                <div className={styles.photoHeader}><div><span className={styles.eyebrow}>Evolução fotográfica</span><h5>Mídias clínicas</h5></div><Camera size={17} /></div>
                {podeEditar ? (
                  <div className={styles.photoUpload}>
                    <div className={styles.photoUploadGrid}>
                      <label className={styles.field}><span>Momento</span><select value={momentoFoto} onChange={(event) => setMomentoFoto(event.target.value as PodogramaMomentoFoto)}>{PODOGRAMA_MOMENTOS_FOTO.map((item) => <option key={item} value={item}>{PODOGRAMA_MOMENTO_FOTO_LABELS[item]}</option>)}</select></label>
                      <label className={styles.field}><span>Legenda</span><input value={legendaFoto} onChange={(event) => setLegendaFoto(event.target.value)} placeholder="Ex.: aspecto antes do procedimento" /></label>
                    </div>
                    <input ref={inputFotoRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className={styles.fileInput} onChange={(event) => selecionarFotos(event.target.files)} />
                    <button type="button" className={styles.secondaryButton} onClick={() => inputFotoRef.current?.click()} disabled={salvando}><Paperclip size={16} /> Anexar mídia antes de salvar</button>
                    <small>JPG, PNG ou WebP · até 10 MB por imagem · armazenamento privado.</small>

                    {fotosPendentes.length ? (
                      <div className={styles.pendingGrid}>
                        {fotosPendentes.map((foto) => (
                          <article key={foto.id} className={styles.pendingCard}>
                            <Image unoptimized src={foto.previewUrl} alt={foto.arquivo.name} width={150} height={105} />
                            <div><strong>{foto.arquivo.name}</strong><small>{PODOGRAMA_MOMENTO_FOTO_LABELS[momentoFoto]}</small></div>
                            <button type="button" onClick={() => removerFotoPendente(foto.id)} aria-label="Remover mídia pendente"><X size={13} /></button>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {marcacaoSelecionada?.fotos?.length ? (
                  <div className={styles.photoGrid}>
                    {marcacaoSelecionada.fotos.map((foto) => (
                      <article key={foto.id} className={styles.photoCard}>
                        {foto.url ? <Image loader={({ src }) => src} unoptimized src={foto.url} alt={foto.legenda || "Foto clínica"} width={220} height={150} /> : <div className={styles.photoUnavailable}><Camera size={20} /> Foto indisponível</div>}
                        <div className={styles.photoMeta}><span>{PODOGRAMA_MOMENTO_FOTO_LABELS[foto.momento]}</span><small>{formatarDataHora(foto.created_at)}</small>{foto.legenda ? <p>{foto.legenda}</p> : null}</div>
                        {podeEditar ? <button type="button" className={styles.photoDelete} disabled={processandoFoto} onClick={() => void removerFoto(foto.id)}><Trash2 size={14} /></button> : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>

              {podeEditar ? (
                <div className={styles.editorActions}>
                  {form.id ? <button type="button" className={styles.dangerButton} onClick={() => setConfirmandoExclusao(true)} disabled={salvando}><Trash2 size={15} /> Excluir</button> : null}
                  <button type="button" className={styles.primaryButton} onClick={() => void salvarMarcacao()} disabled={salvando}>
                    {salvando ? <LoaderCircle className={styles.spinner} size={16} /> : <Save size={16} />}
                    {salvando ? "Salvando..." : fotosPendentes.length ? `Salvar ocorrência + ${fotosPendentes.length} mídia(s)` : "Salvar ocorrência"}
                  </button>
                </div>
              ) : null}

              {confirmandoExclusao ? (
                <div className={styles.deleteConfirm}><p>Excluir esta ocorrência e todas as fotos vinculadas?</p><div><button type="button" onClick={() => setConfirmandoExclusao(false)}>Cancelar</button><button type="button" onClick={() => void excluirMarcacao()} disabled={salvando}>Excluir definitivamente</button></div></div>
              ) : null}
            </>
          ) : (
            <div className={styles.editorEmpty}><Crosshair size={27} /><h4>{podeEditar ? "Marque um ponto do pé" : "Selecione uma marcação"}</h4><p>{podeEditar ? "Toque exatamente sobre a anatomia do desenho. O marcador provisório aparecerá na mesma hora." : "Selecione uma marcação existente para consultar os detalhes."}</p></div>
          )}
        </aside>
      </div>

      <section className={styles.historyCard}>
        <div className={styles.historyHeader}><div><span className={styles.eyebrow}>Linha do tempo</span><h4><Clock3 size={17} /> Histórico do Podograma</h4></div><span>{marcacoes.length} registro(s)</span></div>
        {marcacoes.length === 0 ? <div className={styles.emptyHistory}>Ainda não há ocorrências registradas neste Podograma.</div> : (
          <div className={styles.timeline}>
            {marcacoes.map((marcacao) => {
              const atendimento = marcacao.atendimento_id ? atendimentoPorId.get(marcacao.atendimento_id) : null;
              return (
                <button key={marcacao.id} type="button" className={styles.timelineItem} onClick={() => editarMarcacao(marcacao)}>
                  <span className={`${styles.timelineDot} ${classeStatus(marcacao.status)}`} />
                  <div><div className={styles.timelineTitle}><strong>{PODOGRAMA_OCORRENCIA_LABELS[marcacao.tipo_ocorrencia]}</strong><span>{PODOGRAMA_STATUS_LABELS[marcacao.status]}</span></div><p>{PODOGRAMA_LADO_LABELS[marcacao.lado]} · {PODOGRAMA_VISTA_LABELS[marcacao.vista]} · {PODOGRAMA_REGIAO_LABELS[marcacao.regiao_anatomica as PodogramaRegiao] ?? marcacao.regiao_anatomica}</p><small>{atendimento ? `${formatarDataHora(atendimento.data_atendimento)} · ${formatarTipoAtendimento(atendimento.tipo)}` : `Registrado em ${formatarDataHora(marcacao.created_at)}`}{marcacao.fotos?.length ? ` · ${marcacao.fotos.length} foto(s)` : ""}</small></div>
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
