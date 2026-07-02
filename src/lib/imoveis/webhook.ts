import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const LIMITE_WEBHOOK_IMOVEIS_BYTES = 1_000_000;
export const LIMITE_IMAGENS_POR_IMOVEL = 50;

type JsonObject = Record<string, unknown>;

export type AcaoWebhookImovel = "upsert" | "delete";

export type ImovelWebhookNormalizado = {
  eventId: string;
  eventType: string;
  action: AcaoWebhookImovel;
  occurredAt: string | null;
  externalId: string;
  imovel: {
    codigo: string | null;
    titulo: string | null;
    tipo: string | null;
    finalidade: string | null;
    statusOrigem: string | null;
    valor: number | null;
    valorVenda: number | null;
    valorLocacao: number | null;
    valorCondominio: number | null;
    valorIptu: number | null;
    cep: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
    quartos: number | null;
    suites: number | null;
    banheiros: number | null;
    vagas: number | null;
    areaM2: number | null;
    areaUtilM2: number | null;
    areaTotalM2: number | null;
    areaTerrenoM2: number | null;
    latitude: number | null;
    longitude: number | null;
    descricao: string | null;
    caracteristicas: JsonObject;
    imagemUrl: string | null;
    imagemUrls: string[];
    externalUrl: string | null;
  };
};

function objeto(valor: unknown): JsonObject | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return null;
  }

  return valor as JsonObject;
}

function texto(valor: unknown) {
  if (
    typeof valor !== "string" &&
    typeof valor !== "number" &&
    typeof valor !== "boolean"
  ) {
    return "";
  }

  return String(valor).trim();
}

function limitarTexto(valor: unknown, limite = 100_000) {
  const resultado = texto(valor);
  return resultado ? resultado.slice(0, limite) : null;
}

function semAcentos(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function lerCaminho(origem: JsonObject, caminho: string[]) {
  let atual: unknown = origem;

  for (const parte of caminho) {
    const atualObjeto = objeto(atual);
    if (!atualObjeto) return undefined;
    atual = atualObjeto[parte];
  }

  return atual;
}

function primeiroValor(origem: JsonObject, caminhos: string[][]) {
  for (const caminho of caminhos) {
    const valor = lerCaminho(origem, caminho);

    if (valor !== undefined && valor !== null && valor !== "") {
      return valor;
    }
  }

  return undefined;
}

function primeiroTexto(
  origem: JsonObject,
  caminhos: string[][],
  limite = 10_000
) {
  return limitarTexto(primeiroValor(origem, caminhos), limite);
}

function numero(valor: unknown) {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : null;
  }

  const entrada = texto(valor).replace(/[^\d,.-]/g, "");
  if (!entrada) return null;

  let normalizado = entrada;
  const ultimaVirgula = entrada.lastIndexOf(",");
  const ultimoPonto = entrada.lastIndexOf(".");

  if (ultimaVirgula > -1 && ultimoPonto > -1) {
    normalizado =
      ultimaVirgula > ultimoPonto
        ? entrada.replace(/\./g, "").replace(",", ".")
        : entrada.replace(/,/g, "");
  } else if (ultimaVirgula > -1) {
    normalizado = entrada.replace(",", ".");
  }

  const resultado = Number(normalizado);
  return Number.isFinite(resultado) ? resultado : null;
}

function primeiroNumero(origem: JsonObject, caminhos: string[][]) {
  return numero(primeiroValor(origem, caminhos));
}

function inteiro(valor: unknown) {
  const resultado = numero(valor);
  return resultado === null ? null : Math.max(0, Math.trunc(resultado));
}

function primeiroInteiro(origem: JsonObject, caminhos: string[][]) {
  return inteiro(primeiroValor(origem, caminhos));
}

function hostPrivadoOuLocal(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    (host.includes(":") &&
      (host.startsWith("fc") ||
        host.startsWith("fd") ||
        host.startsWith("fe80:")))
  ) {
    return true;
  }

  const octetos = host.split(".").map(Number);
  if (
    octetos.length !== 4 ||
    octetos.some(
      (octeto) =>
        !Number.isInteger(octeto) || octeto < 0 || octeto > 255
    )
  ) {
    return false;
  }

  const [primeiro, segundo] = octetos;

  return (
    primeiro === 0 ||
    primeiro === 10 ||
    primeiro === 127 ||
    (primeiro === 169 && segundo === 254) ||
    (primeiro === 172 && segundo >= 16 && segundo <= 31) ||
    (primeiro === 192 && segundo === 168) ||
    primeiro >= 224
  );
}

export function normalizarUrlHttp(valor: unknown) {
  const entrada = texto(valor);
  if (!entrada || entrada.length > 4096 || entrada.startsWith("data:")) {
    return null;
  }

  try {
    const url = new URL(entrada);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      hostPrivadoOuLocal(url.hostname)
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function coletarUrlsDeImagem(valor: unknown, profundidade = 0): string[] {
  if (profundidade > 3) return [];

  const urlDireta = normalizarUrlHttp(valor);
  if (urlDireta) return [urlDireta];

  if (Array.isArray(valor)) {
    return valor.flatMap((item) =>
      coletarUrlsDeImagem(item, profundidade + 1)
    );
  }

  const registro = objeto(valor);
  if (!registro) return [];

  const chavesUrl = [
    "url",
    "src",
    "href",
    "original",
    "large",
    "grande",
    "full",
    "full_size",
    "high_resolution",
  ];

  return chavesUrl.flatMap((chave) =>
    coletarUrlsDeImagem(registro[chave], profundidade + 1)
  );
}

function extrairImagens(imovel: JsonObject) {
  const origens = [
    ["imagem_urls"],
    ["image_urls"],
    ["imagens"],
    ["images"],
    ["fotos"],
    ["photos"],
    ["galeria"],
    ["gallery"],
    ["midias"],
    ["media"],
  ];

  const urls = origens.flatMap((caminho) =>
    coletarUrlsDeImagem(lerCaminho(imovel, caminho))
  );

  return Array.from(new Set(urls)).slice(0, LIMITE_IMAGENS_POR_IMOVEL);
}

function normalizarFinalidade(valor: unknown) {
  const entrada = semAcentos(texto(valor)).replace(/[\s-]+/g, "_");
  if (!entrada) return null;

  if (
    entrada.includes("venda") &&
    (entrada.includes("locacao") || entrada.includes("aluguel"))
  ) {
    return "venda_locacao";
  }

  if (
    entrada.includes("rent") ||
    entrada.includes("locacao") ||
    entrada.includes("aluguel")
  ) {
    return "locacao";
  }

  if (entrada.includes("sale") || entrada.includes("venda")) {
    return "venda";
  }

  return entrada.slice(0, 100);
}

function normalizarData(valor: unknown) {
  const entrada = texto(valor);
  if (!entrada) return null;

  const data = new Date(entrada);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function selecionarObjetoImovel(payload: JsonObject) {
  const data = objeto(payload.data);
  const candidatos = [
    objeto(payload.property),
    objeto(payload.imovel),
    objeto(payload.listing),
    objeto(payload.anuncio),
    objeto(data?.property),
    objeto(data?.imovel),
    objeto(data?.listing),
    objeto(data?.anuncio),
    data,
    payload,
  ];

  return candidatos.find(Boolean) as JsonObject;
}

function extrairCaracteristicas(imovel: JsonObject) {
  const valor = primeiroValor(imovel, [
    ["caracteristicas"],
    ["features"],
    ["amenities"],
    ["comodidades"],
    ["attributes"],
    ["atributos"],
    ["details"],
    ["detalhes"],
  ]);

  const registro = objeto(valor);
  if (registro) return sanitizarPayloadSemMidia(registro);

  if (Array.isArray(valor)) {
    return {
      itens: valor
        .map((item) => limitarTexto(item, 500))
        .filter((item): item is string => Boolean(item))
        .slice(0, 200),
    };
  }

  return {};
}

function normalizarTipoEvento(payload: JsonObject) {
  const possuiEnvelopeDeImovel = Boolean(
    objeto(payload.property) ||
      objeto(payload.imovel) ||
      objeto(payload.listing) ||
      objeto(payload.anuncio) ||
      objeto(payload.data)
  );
  const informado =
    primeiroTexto(payload, [
      ["event_type"],
      ["eventType"],
      ["evento"],
      ["event"],
      ["action"],
      ["acao"],
      ["topic"],
    ], 200) ??
    (possuiEnvelopeDeImovel ? limitarTexto(payload.type, 200) : null) ??
    "property.upsert";

  return semAcentos(informado).replace(/[\s-]+/g, "_");
}

function acaoDoEvento(eventType: string): AcaoWebhookImovel {
  const exclusao = [
    "deleted",
    "delete",
    "removed",
    "remove",
    "excluido",
    "excluir",
    "removido",
    "archive",
    "archived",
  ];

  return exclusao.some((termo) => eventType.includes(termo))
    ? "delete"
    : "upsert";
}

function hashPayload(payloadBruto: string) {
  return createHash("sha256").update(payloadBruto).digest("hex");
}

export function normalizarWebhookImovel(
  payload: unknown,
  payloadBruto: string
): ImovelWebhookNormalizado {
  const envelope = objeto(payload);
  if (!envelope) {
    throw new Error("O corpo do webhook deve ser um objeto JSON.");
  }

  const imovel = selecionarObjetoImovel(envelope);
  const eventType = normalizarTipoEvento(envelope);
  const action = acaoDoEvento(eventType);
  const eventId =
    primeiroTexto(envelope, [
      ["event_id"],
      ["eventId"],
      ["evento_id"],
      ["notification_id"],
      ["webhook_id"],
    ], 300) ?? `synthetic_${hashPayload(payloadBruto)}`;

  const codigo = primeiroTexto(imovel, [
    ["codigo"],
    ["code"],
    ["reference"],
    ["reference_id"],
    ["referencia"],
  ], 300);

  const externalId =
    primeiroTexto(imovel, [
      ["external_id"],
      ["externalId"],
      ["listing_id"],
      ["property_id"],
      ["imovel_id"],
      ["id"],
    ], 300) ?? codigo;

  if (!externalId) {
    throw new Error(
      "O identificador do imovel e obrigatorio (external_id, property_id, listing_id, id ou codigo)."
    );
  }

  const titulo = primeiroTexto(imovel, [
    ["titulo"],
    ["title"],
    ["name"],
    ["nome"],
    ["headline"],
  ]);

  if (action === "upsert" && !titulo) {
    throw new Error("O titulo do imovel e obrigatorio.");
  }

  const finalidade = normalizarFinalidade(
    primeiroValor(imovel, [
      ["finalidade"],
      ["purpose"],
      ["business_type"],
      ["transaction_type"],
      ["operation"],
      ["operacao"],
    ])
  );

  const valorVenda = primeiroNumero(imovel, [
    ["valor_venda"],
    ["sale_price"],
    ["selling_price"],
    ["preco_venda"],
    ["prices", "sale"],
    ["valores", "venda"],
  ]);
  const valorLocacao = primeiroNumero(imovel, [
    ["valor_locacao"],
    ["rental_price"],
    ["rent_price"],
    ["preco_locacao"],
    ["preco_aluguel"],
    ["prices", "rent"],
    ["valores", "locacao"],
  ]);
  const valorDireto = primeiroNumero(imovel, [
    ["valor"],
    ["price"],
    ["preco"],
    ["asking_price"],
  ]);
  const imagemUrls = extrairImagens(imovel);

  return {
    eventId,
    eventType,
    action,
    occurredAt: normalizarData(
      primeiroValor(envelope, [
        ["occurred_at"],
        ["occurredAt"],
        ["timestamp"],
        ["created_at"],
        ["updated_at"],
      ]) ??
        primeiroValor(imovel, [
          ["updated_at"],
          ["updatedAt"],
          ["modified_at"],
          ["created_at"],
        ])
    ),
    externalId,
    imovel: {
      codigo,
      titulo,
      tipo: primeiroTexto(imovel, [
        ["tipo"],
        ["type"],
        ["property_type"],
        ["categoria"],
        ["category"],
      ], 300),
      finalidade,
      statusOrigem: primeiroTexto(imovel, [
        ["status"],
        ["situacao"],
        ["availability"],
      ], 300),
      valor:
        valorDireto ??
        (finalidade === "locacao" ? valorLocacao : valorVenda) ??
        valorVenda ??
        valorLocacao,
      valorVenda,
      valorLocacao,
      valorCondominio: primeiroNumero(imovel, [
        ["valor_condominio"],
        ["condominium_fee"],
        ["condo_fee"],
        ["preco_condominio"],
        ["prices", "condominium"],
        ["valores", "condominio"],
      ]),
      valorIptu: primeiroNumero(imovel, [
        ["valor_iptu"],
        ["iptu"],
        ["property_tax"],
        ["prices", "property_tax"],
        ["valores", "iptu"],
      ]),
      cep: primeiroTexto(imovel, [
        ["cep"],
        ["postal_code"],
        ["zip_code"],
        ["address", "postal_code"],
        ["address", "zip_code"],
        ["endereco", "cep"],
      ], 30),
      logradouro: primeiroTexto(imovel, [
        ["logradouro"],
        ["street"],
        ["address", "street"],
        ["endereco", "logradouro"],
        ["endereco", "rua"],
      ], 1000),
      numero: primeiroTexto(imovel, [
        ["numero"],
        ["number"],
        ["address", "number"],
        ["endereco", "numero"],
      ], 100),
      complemento: primeiroTexto(imovel, [
        ["complemento"],
        ["complement"],
        ["address", "complement"],
        ["endereco", "complemento"],
      ], 1000),
      bairro: primeiroTexto(imovel, [
        ["bairro"],
        ["neighborhood"],
        ["district"],
        ["address", "neighborhood"],
        ["endereco", "bairro"],
      ], 500),
      cidade: primeiroTexto(imovel, [
        ["cidade"],
        ["city"],
        ["address", "city"],
        ["endereco", "cidade"],
      ], 500),
      estado: primeiroTexto(imovel, [
        ["estado"],
        ["state"],
        ["uf"],
        ["address", "state"],
        ["address", "state_code"],
        ["endereco", "estado"],
        ["endereco", "uf"],
      ], 100)?.toUpperCase() ?? null,
      quartos: primeiroInteiro(imovel, [
        ["quartos"],
        ["bedrooms"],
        ["dormitorios"],
        ["attributes", "bedrooms"],
        ["atributos", "quartos"],
      ]),
      suites: primeiroInteiro(imovel, [
        ["suites"],
        ["attributes", "suites"],
        ["atributos", "suites"],
      ]),
      banheiros: primeiroInteiro(imovel, [
        ["banheiros"],
        ["bathrooms"],
        ["attributes", "bathrooms"],
        ["atributos", "banheiros"],
      ]),
      vagas: primeiroInteiro(imovel, [
        ["vagas"],
        ["parking_spaces"],
        ["garages"],
        ["attributes", "parking_spaces"],
        ["atributos", "vagas"],
      ]),
      areaM2: primeiroNumero(imovel, [
        ["area_m2"],
        ["area"],
        ["total_area"],
        ["areas", "total"],
        ["areas", "useful"],
        ["areas", "private"],
        ["areas", "util"],
      ]),
      areaUtilM2: primeiroNumero(imovel, [
        ["area_util_m2"],
        ["useful_area"],
        ["private_area"],
        ["areas", "useful"],
        ["areas", "private"],
        ["areas", "util"],
      ]),
      areaTotalM2: primeiroNumero(imovel, [
        ["area_total_m2"],
        ["total_area"],
        ["areas", "total"],
      ]),
      areaTerrenoM2: primeiroNumero(imovel, [
        ["area_terreno_m2"],
        ["land_area"],
        ["lot_area"],
        ["areas", "land"],
        ["areas", "terreno"],
      ]),
      latitude: primeiroNumero(imovel, [
        ["latitude"],
        ["lat"],
        ["location", "latitude"],
        ["localizacao", "latitude"],
        ["address", "latitude"],
      ]),
      longitude: primeiroNumero(imovel, [
        ["longitude"],
        ["lng"],
        ["lon"],
        ["location", "longitude"],
        ["localizacao", "longitude"],
        ["address", "longitude"],
      ]),
      descricao: primeiroTexto(imovel, [
        ["descricao"],
        ["description"],
        ["details_text"],
      ], 100_000),
      caracteristicas: extrairCaracteristicas(imovel),
      imagemUrl: imagemUrls[0] ?? null,
      imagemUrls,
      externalUrl: normalizarUrlHttp(
        primeiroValor(imovel, [
          ["external_url"],
          ["property_url"],
          ["listing_url"],
          ["detail_url"],
          ["public_url"],
          ["link"],
          ["url"],
        ])
      ),
    },
  };
}

const CHAVES_MIDIA_EMBUTIDA = new Set([
  "base64",
  "binary",
  "bytes",
  "buffer",
  "file_content",
  "filecontent",
  "media_content",
  "mediacontent",
]);

export function sanitizarPayloadSemMidia(
  valor: JsonObject,
  profundidade = 0
): JsonObject {
  if (profundidade > 12) {
    return { truncado: true };
  }

  const resultado: JsonObject = {};

  for (const [chave, item] of Object.entries(valor)) {
    const chaveNormalizada = semAcentos(chave).replace(/[\s-]+/g, "_");

    if (CHAVES_MIDIA_EMBUTIDA.has(chaveNormalizada)) {
      resultado[chave] = "[conteudo de midia removido]";
      continue;
    }

    if (
      typeof item === "string" &&
      /^(?:data:(?:image|video|audio)\/|data:application\/octet-stream)/i.test(
        item
      )
    ) {
      resultado[chave] = "[conteudo de midia removido]";
      continue;
    }

    const chavePareceMidia =
      /(image|imagem|photo|foto|media|midia|file|arquivo|documento|anexo)/i.test(
        chaveNormalizada
      );

    if (
      typeof item === "string" &&
      item.length > 1024 &&
      /^[a-z0-9+/=\r\n]+$/i.test(item) &&
      (chavePareceMidia || item.length > 16_384)
    ) {
      resultado[chave] = "[conteudo de midia removido]";
      continue;
    }

    if (Array.isArray(item)) {
      resultado[chave] = item.slice(0, 500).map((subitem) => {
        const subObjeto = objeto(subitem);
        return subObjeto
          ? sanitizarPayloadSemMidia(subObjeto, profundidade + 1)
          : typeof subitem === "string" &&
              (subitem.startsWith("data:") ||
                (chavePareceMidia &&
                  subitem.length > 1024 &&
                  /^[a-z0-9+/=\r\n]+$/i.test(subitem)) ||
                (subitem.length > 16_384 &&
                  /^[a-z0-9+/=\r\n]+$/i.test(subitem)))
            ? "[conteudo de midia removido]"
            : subitem;
      });
      continue;
    }

    const itemObjeto = objeto(item);
    resultado[chave] = itemObjeto
      ? sanitizarPayloadSemMidia(itemObjeto, profundidade + 1)
      : item;
  }

  return resultado;
}

export function criarSegredoWebhook() {
  const segredo = `whsec_${randomBytes(32).toString("base64url")}`;

  return {
    segredo,
    hash: hashSegredoWebhook(segredo),
    hint: segredo.slice(-8),
  };
}

export function hashSegredoWebhook(segredo: string) {
  return createHash("sha256").update(segredo).digest("hex");
}

export function segredoWebhookValido(
  segredoRecebido: string,
  hashEsperado: string
) {
  const recebido = Buffer.from(hashSegredoWebhook(segredoRecebido), "hex");
  const esperado = Buffer.from(hashEsperado, "hex");

  return (
    recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
  );
}

export function extrairSegredoWebhook(headers: Headers) {
  const authorization = headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  return bearer || headers.get("x-webhook-token")?.trim() || "";
}
