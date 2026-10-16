export const MAX_TENTATIVAS_FOLLOWUP = 3;
export const MAX_INTERVALO_FOLLOWUP_MINUTOS = 23 * 60;

export type FollowupTipoEnvio = "ia" | "texto" | "audio";
export type FollowupUnidadeIntervalo = "minutos" | "horas";

export type FollowupTentativaConfig = {
  intervalo_valor: number;
  intervalo_unidade: FollowupUnidadeIntervalo;
  intervalo_minutos: number;
  tipo: FollowupTipoEnvio;
  texto: string;
  midia_id: string | null;
  midia_nome: string | null;
  midia_url: string | null;
};

export type FollowupInatividadeConfig = {
  ativo: boolean;
  tentativas: number;
  intervalos_minutos: number[];
  etapas: FollowupTentativaConfig[];
};

const ETAPAS_PADRAO: FollowupTentativaConfig[] = [
  {
    intervalo_valor: 30,
    intervalo_unidade: "minutos",
    intervalo_minutos: 30,
    tipo: "ia",
    texto: "",
    midia_id: null,
    midia_nome: null,
    midia_url: null,
  },
  {
    intervalo_valor: 3,
    intervalo_unidade: "horas",
    intervalo_minutos: 180,
    tipo: "ia",
    texto: "",
    midia_id: null,
    midia_nome: null,
    midia_url: null,
  },
  {
    intervalo_valor: 12,
    intervalo_unidade: "horas",
    intervalo_minutos: 720,
    tipo: "ia",
    texto: "",
    midia_id: null,
    midia_nome: null,
    midia_url: null,
  },
];

export const FOLLOWUP_INATIVIDADE_PADRAO: FollowupInatividadeConfig = {
  ativo: false,
  tentativas: 2,
  intervalos_minutos: ETAPAS_PADRAO.map((item) => item.intervalo_minutos),
  etapas: ETAPAS_PADRAO.map((item) => ({ ...item })),
};

function inteiro(valor: unknown, fallback: number, minimo: number, maximo: number) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return fallback;
  return Math.min(maximo, Math.max(minimo, Math.floor(numero)));
}

function unidadeValida(valor: unknown): FollowupUnidadeIntervalo {
  return valor === "horas" ? "horas" : "minutos";
}

function tipoValido(valor: unknown): FollowupTipoEnvio {
  if (valor === "texto" || valor === "audio") return valor;
  return "ia";
}

function etapaPorMinutos(
  minutos: number,
  base: FollowupTentativaConfig,
): FollowupTentativaConfig {
  const normalizado = inteiro(
    minutos,
    base.intervalo_minutos,
    1,
    MAX_INTERVALO_FOLLOWUP_MINUTOS,
  );
  const usaHoras = normalizado >= 60 && normalizado % 60 === 0;

  return {
    ...base,
    intervalo_valor: usaHoras ? normalizado / 60 : normalizado,
    intervalo_unidade: usaHoras ? "horas" : "minutos",
    intervalo_minutos: normalizado,
  };
}

function normalizarEtapa(
  valor: unknown,
  base: FollowupTentativaConfig,
  minutosLegados?: unknown,
): FollowupTentativaConfig {
  const obj =
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null;

  if (!obj) {
    return etapaPorMinutos(
      inteiro(
        minutosLegados,
        base.intervalo_minutos,
        1,
        MAX_INTERVALO_FOLLOWUP_MINUTOS,
      ),
      base,
    );
  }

  const unidade = unidadeValida(obj.intervalo_unidade);
  const maxValor =
    unidade === "horas" ? 23 : MAX_INTERVALO_FOLLOWUP_MINUTOS;
  const valorIntervalo = inteiro(
    obj.intervalo_valor,
    unidade === "horas"
      ? Math.max(1, Math.round(base.intervalo_minutos / 60))
      : base.intervalo_minutos,
    1,
    maxValor,
  );
  const intervaloMinutos = Math.min(
    MAX_INTERVALO_FOLLOWUP_MINUTOS,
    unidade === "horas" ? valorIntervalo * 60 : valorIntervalo,
  );

  return {
    intervalo_valor: valorIntervalo,
    intervalo_unidade: unidade,
    intervalo_minutos: intervaloMinutos,
    tipo: tipoValido(obj.tipo),
    texto: String(obj.texto || "").slice(0, 2000),
    midia_id: String(obj.midia_id || "").trim() || null,
    midia_nome: String(obj.midia_nome || "").trim().slice(0, 255) || null,
    midia_url: String(obj.midia_url || "").trim().slice(0, 2000) || null,
  };
}

export function normalizarFollowupInatividade(
  valor: unknown,
): FollowupInatividadeConfig {
  const obj =
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};
  const tentativas = inteiro(
    obj.tentativas,
    FOLLOWUP_INATIVIDADE_PADRAO.tentativas,
    1,
    MAX_TENTATIVAS_FOLLOWUP,
  );
  const legados = Array.isArray(obj.intervalos_minutos)
    ? obj.intervalos_minutos
    : [];
  const recebidas = Array.isArray(obj.etapas)
    ? obj.etapas
    : Array.isArray(obj.tentativas_config)
      ? obj.tentativas_config
      : [];

  const etapas = ETAPAS_PADRAO.map((base, indice) =>
    normalizarEtapa(recebidas[indice], base, legados[indice]),
  );

  return {
    ativo: obj.ativo === true,
    tentativas,
    intervalos_minutos: etapas.map((item) => item.intervalo_minutos),
    etapas,
  };
}

export function erroValidacaoFollowupInatividade(
  valor: unknown,
): string | null {
  const config = normalizarFollowupInatividade(valor);
  if (!config.ativo) return null;

  for (let indice = 0; indice < config.tentativas; indice += 1) {
    const etapa = config.etapas[indice];
    const numero = indice + 1;

    if (etapa.tipo === "texto" && !etapa.texto.trim()) {
      return `Informe o texto da ${numero}ª tentativa do acompanhamento automático.`;
    }

    if (etapa.tipo === "audio" && !etapa.midia_id) {
      return `Selecione um áudio para a ${numero}ª tentativa do acompanhamento automático.`;
    }
  }

  return null;
}
