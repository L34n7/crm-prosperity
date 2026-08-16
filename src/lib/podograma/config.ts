export const PODOGRAMA_LADOS = ["esquerdo", "direito"] as const;
export const PODOGRAMA_VISTAS = ["plantar", "dorsal", "lateral"] as const;
export const PODOGRAMA_SEVERIDADES = ["leve", "moderada", "importante"] as const;
export const PODOGRAMA_STATUS = ["ativa", "em_tratamento", "observacao", "resolvida"] as const;

export const PODOGRAMA_OCORRENCIAS = [
  "onicocriptose",
  "onicomicose",
  "onicolise",
  "alteracao_unha",
  "calosidade",
  "hiperqueratose",
  "fissura",
  "verruga",
  "lesao",
  "inflamacao",
  "infeccao",
  "edema",
  "dor",
  "deformidade",
  "outra",
] as const;

export const PODOGRAMA_REGIOES = [
  "halux",
  "dedos",
  "unhas",
  "antepe",
  "mediape",
  "calcaneo",
  "arco_medial",
  "arco_lateral",
  "bordo_medial",
  "bordo_lateral",
  "dorso",
  "outra",
] as const;

export const PODOGRAMA_MOMENTOS_FOTO = ["registro", "antes", "durante", "depois"] as const;

export type PodogramaLado = (typeof PODOGRAMA_LADOS)[number];
export type PodogramaVista = (typeof PODOGRAMA_VISTAS)[number];
export type PodogramaSeveridade = (typeof PODOGRAMA_SEVERIDADES)[number];
export type PodogramaStatus = (typeof PODOGRAMA_STATUS)[number];
export type PodogramaOcorrencia = (typeof PODOGRAMA_OCORRENCIAS)[number];
export type PodogramaRegiao = (typeof PODOGRAMA_REGIOES)[number];
export type PodogramaMomentoFoto = (typeof PODOGRAMA_MOMENTOS_FOTO)[number];

export const PODOGRAMA_VISTA_LABELS: Record<PodogramaVista, string> = {
  plantar: "Plantar",
  dorsal: "Dorsal",
  lateral: "Lateral",
};

export const PODOGRAMA_LADO_LABELS: Record<PodogramaLado, string> = {
  esquerdo: "Pé esquerdo",
  direito: "Pé direito",
};

export const PODOGRAMA_SEVERIDADE_LABELS: Record<PodogramaSeveridade, string> = {
  leve: "Leve",
  moderada: "Moderada",
  importante: "Importante",
};

export const PODOGRAMA_STATUS_LABELS: Record<PodogramaStatus, string> = {
  ativa: "Ativa",
  em_tratamento: "Em tratamento",
  observacao: "Em observação",
  resolvida: "Resolvida",
};

export const PODOGRAMA_OCORRENCIA_LABELS: Record<PodogramaOcorrencia, string> = {
  onicocriptose: "Onicocriptose / unha encravada",
  onicomicose: "Onicomicose",
  onicolise: "Onicólise",
  alteracao_unha: "Alteração ungueal",
  calosidade: "Calosidade",
  hiperqueratose: "Hiperqueratose",
  fissura: "Fissura",
  verruga: "Verruga",
  lesao: "Lesão",
  inflamacao: "Inflamação",
  infeccao: "Infecção",
  edema: "Edema",
  dor: "Dor / sensibilidade",
  deformidade: "Deformidade",
  outra: "Outra ocorrência",
};

export const PODOGRAMA_REGIAO_LABELS: Record<PodogramaRegiao, string> = {
  halux: "Hálux",
  dedos: "Dedos",
  unhas: "Unhas",
  antepe: "Antepé",
  mediape: "Mediopé",
  calcaneo: "Calcâneo",
  arco_medial: "Arco medial",
  arco_lateral: "Arco lateral",
  bordo_medial: "Bordo medial",
  bordo_lateral: "Bordo lateral",
  dorso: "Dorso",
  outra: "Outra região",
};

export const PODOGRAMA_MOMENTO_FOTO_LABELS: Record<PodogramaMomentoFoto, string> = {
  registro: "Registro clínico",
  antes: "Antes",
  durante: "Durante",
  depois: "Depois",
};

export const PODOGRAMA_BUCKET_FOTOS = "podograma-fotos";
export const PODOGRAMA_FOTO_LIMITE_BYTES = 10 * 1024 * 1024;

export function valorPermitido<T extends readonly string[]>(
  valores: T,
  valor: unknown,
): valor is T[number] {
  return typeof valor === "string" && (valores as readonly string[]).includes(valor);
}
