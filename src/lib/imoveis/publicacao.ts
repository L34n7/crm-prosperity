export type ModoIntegracaoImobiliaria = "manual" | "xml" | "api";

export type StatusPublicacaoImovel =
  | "rascunho"
  | "pendente"
  | "enviado"
  | "em_analise"
  | "publicado"
  | "rejeitado"
  | "despublicado";

export type CanalImobiliario = {
  codigo: string;
  nome: string;
  modo: ModoIntegracaoImobiliaria;
  descricao: string;
};

export type ImovelPublicavel = {
  id: string;
  titulo?: string | null;
  codigo?: string | null;
  tipo?: string | null;
  finalidade?: string | null;
  status?: string | null;
  valor?: number | string | null;
  valor_condominio?: number | string | null;
  valor_iptu?: number | string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  quartos?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  area_m2?: number | string | null;
  descricao?: string | null;
  caracteristicas?: Record<string, unknown> | null;
  fotos?: unknown[] | null;
};

export type ValidacaoPublicacao = {
  ok: boolean;
  bloqueios: string[];
  avisos: string[];
};

export const CANAIS_IMOBILIARIOS: CanalImobiliario[] = [
  {
    codigo: "grupo_olx",
    nome: "OLX, ZAP e Viva Real",
    modo: "xml",
    descricao: "Feed multiportal para homologacao com o Grupo OLX.",
  },
  {
    codigo: "imovelweb",
    nome: "Imovelweb",
    modo: "xml",
    descricao: "Feed autorizado para portais do ecossistema Imovelweb.",
  },
  {
    codigo: "chaves_na_mao",
    nome: "Chaves na Mao",
    modo: "api",
    descricao: "Conector preparado para parceiro/integrador homologado.",
  },
  {
    codigo: "portal_manual",
    nome: "Portal manual",
    modo: "manual",
    descricao: "Controle operacional para portais sem API homologada.",
  },
];

export const STATUS_PUBLICACAO_LABELS: Record<StatusPublicacaoImovel, string> = {
  rascunho: "Rascunho",
  pendente: "Pendente",
  enviado: "Enviado",
  em_analise: "Em analise",
  publicado: "Publicado",
  rejeitado: "Rejeitado",
  despublicado: "Despublicado",
};

export function getCanalImobiliario(codigo: string) {
  return CANAIS_IMOBILIARIOS.find((canal) => canal.codigo === codigo) ?? null;
}

export function getStatusPublicacaoLabel(status: string | null | undefined) {
  return (
    STATUS_PUBLICACAO_LABELS[status as StatusPublicacaoImovel] ??
    "Nao enviado"
  );
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function numero(valor: unknown) {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : null;
  }

  const entrada = texto(valor).replace(/[^\d,.-]/g, "");
  if (!entrada) return null;

  const normalizado = entrada.includes(",")
    ? entrada.replace(/\./g, "").replace(",", ".")
    : entrada;
  const convertido = Number(normalizado);

  return Number.isFinite(convertido) ? convertido : null;
}

export function validarImovelParaPublicacao(
  imovel: ImovelPublicavel
): ValidacaoPublicacao {
  const bloqueios: string[] = [];
  const avisos: string[] = [];

  if (!texto(imovel.titulo)) bloqueios.push("Informe o titulo do imovel.");
  if (!texto(imovel.tipo)) bloqueios.push("Informe o tipo do imovel.");
  if (!texto(imovel.finalidade)) bloqueios.push("Informe a finalidade.");
  if (!numero(imovel.valor)) bloqueios.push("Informe o valor principal.");
  if (!texto(imovel.bairro)) bloqueios.push("Informe o bairro.");
  if (!texto(imovel.cidade)) bloqueios.push("Informe a cidade.");
  if (texto(imovel.estado).length !== 2) {
    bloqueios.push("Informe a UF com 2 letras.");
  }

  const descricao = texto(imovel.descricao);
  if (descricao.length < 30) {
    bloqueios.push("Informe uma descricao com pelo menos 30 caracteres.");
  }

  if (!numero(imovel.area_m2)) {
    avisos.push("Area do imovel nao informada.");
  }

  if (!Array.isArray(imovel.fotos) || imovel.fotos.length === 0) {
    avisos.push("Nenhuma foto cadastrada. Portais podem rejeitar o anuncio.");
  }

  if (imovel.status && !["disponivel", "reservado"].includes(imovel.status)) {
    avisos.push("O status comercial nao esta como disponivel ou reservado.");
  }

  return {
    ok: bloqueios.length === 0,
    bloqueios,
    avisos,
  };
}

export function montarPayloadPublicacao(
  imovel: ImovelPublicavel,
  canal: CanalImobiliario
) {
  return {
    canal: {
      codigo: canal.codigo,
      nome: canal.nome,
      modo_integracao: canal.modo,
    },
    imovel: {
      id: imovel.id,
      codigo: imovel.codigo ?? null,
      titulo: texto(imovel.titulo),
      tipo: texto(imovel.tipo),
      finalidade: texto(imovel.finalidade),
      status: texto(imovel.status),
      valores: {
        principal: numero(imovel.valor),
        condominio: numero(imovel.valor_condominio),
        iptu: numero(imovel.valor_iptu),
      },
      endereco: {
        cep: texto(imovel.cep) || null,
        logradouro: texto(imovel.logradouro) || null,
        numero: texto(imovel.numero) || null,
        complemento: texto(imovel.complemento) || null,
        bairro: texto(imovel.bairro) || null,
        cidade: texto(imovel.cidade) || null,
        estado: texto(imovel.estado).toUpperCase() || null,
      },
      atributos: {
        quartos: imovel.quartos ?? null,
        suites: imovel.suites ?? null,
        banheiros: imovel.banheiros ?? null,
        vagas: imovel.vagas ?? null,
        area_m2: numero(imovel.area_m2),
      },
      descricao: texto(imovel.descricao),
      caracteristicas: imovel.caracteristicas ?? {},
      fotos: Array.isArray(imovel.fotos) ? imovel.fotos : [],
    },
    gerado_em: new Date().toISOString(),
  };
}
