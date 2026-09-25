import { normalizarClassificacaoLead } from "@/lib/leads/classificacao";
import { supabaseAdmin } from "@/lib/supabase/admin";

type ContatoVariaveisFixas = {
  id?: string | null;
  nome?: string | null;
  whatsapp_profile_name?: string | null;
  email?: string | null;
  telefone?: string | null;
  campo_contato?: string | null;
  variavel_contato?: string | null;
  interesse?: string | null;
  campanha?: string | null;
  origem?: string | null;
  status_lead?: string | null;
  classificacao?: string | null;
};

type ExtrasVariaveisFixas = {
  nome_whatsapp?: string | null;
  protocolo_atual?: string | null;
  ultimo_protocolo?: string | null;
};

type CampoContatoVariavelFixa =
  | "nome"
  | "email"
  | "telefone"
  | "campo_contato"
  | "interesse"
  | "campanha"
  | "origem"
  | "status_lead"
  | "classificacao"
  | "nome_whatsapp"
  | "protocolo_atual"
  | "ultimo_protocolo";

const VARIAVEL_PIX_PENDENTES_RESUMO = "pagamento.pix_pendentes_resumo";
const CACHE_PIX_AUTORIZADO_MS = 1000;
const CACHE_PIX_NAO_AUTORIZADO_MS = 10 * 60 * 1000;

type CachePixPendente = {
  autorizado: boolean;
  resumo: string;
  expiraEm: number;
};

const cachePixPendentePorContato = new Map<string, CachePixPendente>();

const VARIAVEIS_FIXAS_CONTATO_CAMPOS: Record<
  string,
  CampoContatoVariavelFixa
> = {
  nome: "nome",
  nome_contato: "nome",
  contato_nome: "nome",

  nome_whatsapp: "nome_whatsapp",
  whatsapp_nome: "nome_whatsapp",
  nome_perfil_whatsapp: "nome_whatsapp",
  perfil_whatsapp_nome: "nome_whatsapp",

  email: "email",
  email_contato: "email",
  contato_email: "email",

  telefone: "telefone",
  numero: "telefone",
  numero_contato: "telefone",
  contato_numero: "telefone",
  telefone_contato: "telefone",
  contato_telefone: "telefone",

  campo_contato: "campo_contato",
  variavel_contato: "campo_contato",
  interesse: "interesse",

  campanha: "campanha",
  origem: "origem",

  status: "status_lead",
  status_lead: "status_lead",
  classificacao: "classificacao",
  classificacao_lead: "classificacao",
  lead_classificacao: "classificacao",

  protocolo_atual: "protocolo_atual",
  ultimo_protocolo: "ultimo_protocolo",
};

export const VARIAVEIS_FIXAS_CONTATO = [
  "nome_contato",
  "nome_whatsapp",
  "nome_perfil_whatsapp",
  "email_contato",
  "numero_contato",
  "campo_contato",
  "interesse",
  "campanha",
  "origem",
  "status_lead",
  "classificacao_lead",
  "protocolo_atual",
  "ultimo_protocolo",
  VARIAVEL_PIX_PENDENTES_RESUMO,
] as const;

export function normalizarChaveVariavelFluxo(valor: unknown) {
  const chave = String(valor || "")
    .trim()
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .replace(/^variaveis\./, "")
    .trim()
    .toLowerCase();

  return chave === "variavel_contato" ? "campo_contato" : chave;
}

export function chaveEhVariavelFixaContato(chave: unknown) {
  const chaveNormalizada = normalizarChaveVariavelFluxo(chave);

  return (
    chaveNormalizada === VARIAVEL_PIX_PENDENTES_RESUMO ||
    Object.prototype.hasOwnProperty.call(
      VARIAVEIS_FIXAS_CONTATO_CAMPOS,
      chaveNormalizada
    )
  );
}

const VARIAVEIS_NOME_WHATSAPP = new Set([
  "nome_whatsapp",
  "whatsapp_nome",
  "nome_perfil_whatsapp",
  "perfil_whatsapp_nome",
]);

export function chaveEhVariavelNomeWhatsapp(chave: unknown) {
  return VARIAVEIS_NOME_WHATSAPP.has(normalizarChaveVariavelFluxo(chave));
}

const VARIAVEIS_NOME_CAPTURA = new Set([
  "nome_captura",
  "primeiro_nome_captura",
]);

export function chaveEhVariavelNomeCaptura(chave: unknown) {
  return VARIAVEIS_NOME_CAPTURA.has(normalizarChaveVariavelFluxo(chave));
}

export async function resolverNomeCapturaContato(params: {
  empresaId: string;
  contatoId?: string | null;
  nomeWhatsapp?: string | null;
  nomeFallback?: string | null;
}) {
  const fallback = String(
    params.nomeWhatsapp || params.nomeFallback || ""
  ).trim();
  const primeiroFallback = fallback.split(/\s+/).filter(Boolean)[0] || fallback;
  const contatoId = String(params.contatoId || "").trim();
  const empresaId = String(params.empresaId || "").trim();

  if (!contatoId || !empresaId) {
    return {
      nome_captura: fallback,
      primeiro_nome_captura: primeiroFallback,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("contato_informacoes_captura")
    .select("valor")
    .eq("empresa_id", empresaId)
    .eq("contato_id", contatoId)
    .eq("tipo", "nome")
    .eq("ativo", true)
    .order("capturado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[VARIAVEIS] Nome capturado indisponivel:", error.message);
    return {
      nome_captura: fallback,
      primeiro_nome_captura: primeiroFallback,
    };
  }

  const nomeCaptura = String(data?.valor || "").trim() || fallback;
  return {
    nome_captura: nomeCaptura,
    primeiro_nome_captura:
      nomeCaptura.split(/\s+/).filter(Boolean)[0] || nomeCaptura,
  };
}

function limparCachePixPendente() {
  if (cachePixPendentePorContato.size <= 1000) return;

  const agora = Date.now();

  for (const [contatoId, item] of cachePixPendentePorContato) {
    if (item.expiraEm <= agora) {
      cachePixPendentePorContato.delete(contatoId);
    }
  }

  if (cachePixPendentePorContato.size <= 1000) return;

  const excedentes = cachePixPendentePorContato.size - 1000;
  let removidos = 0;

  for (const contatoId of cachePixPendentePorContato.keys()) {
    cachePixPendentePorContato.delete(contatoId);
    removidos += 1;

    if (removidos >= excedentes) break;
  }
}

async function carregarResumoPixPendentesProsperity(contatoId: string) {
  const id = String(contatoId || "").trim();
  if (!id) return "";

  const agora = Date.now();
  const cache = cachePixPendentePorContato.get(id);

  if (cache && cache.expiraEm > agora) {
    return cache.resumo;
  }

  if (cache) {
    cachePixPendentePorContato.delete(id);
  }

  const { data: contato, error: contatoError } = await supabaseAdmin
    .from("contatos")
    .select("empresa_id,email,telefone")
    .eq("id", id)
    .maybeSingle();

  if (contatoError || !contato?.empresa_id) {
    if (contatoError) {
      console.error(
        "[AUTOMACAO_VARIAVEIS] Erro ao localizar contato para PIX pendente:",
        contatoError.message
      );
    }
    return "";
  }

  const { data: integracao, error: integracaoError } = await supabaseAdmin
    .from("integracoes_api_externas")
    .select("id")
    .eq("empresa_id", contato.empresa_id)
    .eq("tipo", "crm_prosperity")
    .eq("status", "ativa")
    .limit(1)
    .maybeSingle();

  if (integracaoError) {
    console.error(
      "[AUTOMACAO_VARIAVEIS] Erro ao validar integração para PIX pendente:",
      integracaoError.message
    );
    return "";
  }

  if (!integracao) {
    cachePixPendentePorContato.set(id, {
      autorizado: false,
      resumo: "",
      expiraEm: agora + CACHE_PIX_NAO_AUTORIZADO_MS,
    });
    limparCachePixPendente();
    return "";
  }

  const email = String(contato.email || "").trim().toLowerCase();
  const telefone = String(contato.telefone || "").replace(/\D/g, "");

  if (!email && !telefone) {
    return "";
  }

  let pagamentosQuery = supabaseAdmin
    .from("pagamentos")
    .select(
      "id,gateway,status,metodo,created_at,offer_hash,offer_titulo,payload,customer_email,customer_telefone"
    )
    .eq("metodo", "pix")
    .in("status", [
      "waiting_payment",
      "pending",
      "paid",
      "approved",
      "completed",
    ])
    .gte("created_at", new Date(agora - 12 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  const filtrosContato: string[] = [];
  if (email) {
    filtrosContato.push(`customer_email.ilike.${email}`);
  }
  if (telefone) {
    filtrosContato.push(`customer_telefone.eq.${telefone}`);
  }

  if (filtrosContato.length > 0) {
    pagamentosQuery = pagamentosQuery.or(filtrosContato.join(","));
  }

  const { data: pagamentos, error: pagamentosError } = await pagamentosQuery;

  if (pagamentosError) {
    console.error(
      "[AUTOMACAO_VARIAVEIS] Erro ao buscar pagamentos PIX pendentes:",
      pagamentosError.message
    );
    return "";
  }

  const referencias = Array.from(
    new Set(
      (pagamentos || [])
        .map((item: any) => String(item.offer_hash || "").trim())
        .filter(Boolean)
    )
  );

  const { data: ofertas, error: ofertasError } = referencias.length
    ? await supabaseAdmin
        .from("ia_token_ofertas")
        .select("gateway,referencia,tipo,nome,plano_id,planos:plano_id(nome)")
        .eq("ativa", true)
        .in("referencia", referencias)
    : { data: [], error: null };

  if (ofertasError) {
    console.error(
      "[AUTOMACAO_VARIAVEIS] Erro ao localizar ofertas dos PIX pendentes:",
      ofertasError.message
    );
    return "";
  }

  const ofertasPorChave = new Map<string, any>();
  for (const oferta of ofertas || []) {
    const chave = `${String(oferta.gateway || "")
      .trim()
      .toLowerCase()}:${String(oferta.referencia || "").trim()}`;
    if (!ofertasPorChave.has(chave)) {
      ofertasPorChave.set(chave, oferta);
    }
  }

  function objetoSeguro(valor: unknown) {
    return valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, any>)
      : {};
  }

  function pixCopiaCola(payload: unknown) {
    const raiz = objetoSeguro(payload);
    const transaction = objetoSeguro(raiz.transaction);
    const pix = objetoSeguro(transaction.pix);
    const payment = objetoSeguro(raiz.payment);

    return String(
      pix.code ||
        payment.pix_code ||
        raiz.pix_code ||
        ""
    ).trim();
  }

  function pixGeradoPeloCliente(pagamento: any) {
    const gateway = String(pagamento?.gateway || "")
      .trim()
      .toLowerCase();
    const payload = objetoSeguro(pagamento?.payload);

    if (gateway === "prosperity_pay") {
      const payment = objetoSeguro(payload.payment);
      return String(payment.generation_source || "")
        .trim()
        .toLowerCase() !== "platform_automatic";
    }

    if (gateway === "atomo") {
      const criadoBruto =
        String(payload.created_at || "").trim() ||
        String(pagamento?.created_at || "").trim();
      const criado = criadoBruto ? new Date(criadoBruto) : null;

      // A Átomo não informa a origem explicitamente. A rotina automática
      // observada no histórico gera os PIX perto de 09:00 UTC todos os dias.
      if (
        criado &&
        !Number.isNaN(criado.getTime()) &&
        criado.getUTCHours() === 9 &&
        criado.getUTCMinutes() <= 5
      ) {
        return false;
      }
    }

    return true;
  }

  function planoNome(oferta: any) {
    const plano = Array.isArray(oferta?.planos)
      ? oferta.planos[0]
      : oferta?.planos;
    const nome = String(plano?.nome || "").trim();
    if (!nome) return "";
    return /^plano\s+/i.test(nome) ? nome : `Plano ${nome}`;
  }

  const gruposVistos = new Set<string>();
  const pendentes: Array<{
    item: string;
    criadoEm: string;
    pix: string;
  }> = [];

  for (const pagamento of pagamentos || []) {
    const gateway = String(pagamento.gateway || "").trim().toLowerCase();
    const referencia = String(pagamento.offer_hash || "").trim();
    const oferta =
      ofertasPorChave.get(`${gateway}:${referencia}`) ||
      (ofertas || []).find(
        (item: any) => String(item.referencia || "").trim() === referencia
      ) ||
      null;

    if (!pixGeradoPeloCliente(pagamento)) {
      continue;
    }

    let grupo = "";
    let itemCobranca = "";

    if (oferta?.tipo === "mensalidade" && oferta?.plano_id) {
      grupo = `plano:${oferta.plano_id}`;
      itemCobranca = planoNome(oferta);
    } else if (oferta?.tipo === "recarga") {
      grupo = "recarga_tokens";
      itemCobranca =
        String(oferta.nome || "").trim() || "Pacote de tokens de IA";
    } else if (referencia) {
      grupo = `oferta:${referencia}`;
      itemCobranca =
        String(pagamento.offer_titulo || "").trim() || "Pagamento";
    }

    if (!grupo || gruposVistos.has(grupo)) {
      continue;
    }

    gruposVistos.add(grupo);

    const status = String(pagamento.status || "").trim().toLowerCase();
    const pendente =
      status === "waiting_payment" || status === "pending";

    if (!pendente) {
      continue;
    }

    const codigoPix = pixCopiaCola(pagamento.payload);
    if (!codigoPix || !itemCobranca) {
      continue;
    }

    pendentes.push({
      item: itemCobranca,
      criadoEm: String(pagamento.created_at || ""),
      pix: codigoPix,
    });
  }

  const resumo = pendentes
    .map((item) => {
      const data = new Date(item.criadoEm);
      const dataFormatada = Number.isNaN(data.getTime())
        ? ""
        : data.toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });

      return [
        `*${item.item}*${dataFormatada ? ` — gerado em ${dataFormatada.replace(",", " às")}` : ""}`,
        "PIX Copia e Cola:",
        item.pix,
      ].join("\n");
    })
    .join("\n\n");

  cachePixPendentePorContato.set(id, {
    autorizado: true,
    resumo,
    expiraEm: agora + CACHE_PIX_AUTORIZADO_MS,
  });
  limparCachePixPendente();

  return resumo;
}

export async function montarMapaVariaveisFixasContato(
  contato: ContatoVariaveisFixas | null | undefined,
  extras: ExtrasVariaveisFixas = {}
) {
  const classificacao = normalizarClassificacaoLead(
    contato?.classificacao || contato?.status_lead,
    "novo"
  );
  const valores: Record<CampoContatoVariavelFixa, string> = {
    nome: String(contato?.nome || "").trim(),
    email: String(contato?.email || "").trim(),
    telefone: String(contato?.telefone || "").trim(),
    campo_contato: String(
      contato?.campo_contato ?? contato?.variavel_contato ?? ""
    ).trim(),
    interesse: String(contato?.interesse || "").trim(),
    campanha: String(contato?.campanha || "").trim(),
    origem: String(contato?.origem || "").trim(),
    status_lead: classificacao,
    classificacao,
    nome_whatsapp: String(
      extras.nome_whatsapp || contato?.whatsapp_profile_name || contato?.nome || ""
    ).trim(),
    protocolo_atual: String(extras.protocolo_atual || "").trim(),
    ultimo_protocolo: String(extras.ultimo_protocolo || "").trim(),
  };

  const mapa = new Map<string, string>();

  for (const [chave, campo] of Object.entries(VARIAVEIS_FIXAS_CONTATO_CAMPOS)) {
    mapa.set(chave, valores[campo]);
  }

  mapa.set(VARIAVEL_PIX_PENDENTES_RESUMO, "");

  if (contato?.id) {
    mapa.set(
      VARIAVEL_PIX_PENDENTES_RESUMO,
      await carregarResumoPixPendentesProsperity(contato.id)
    );
  }

  return mapa;
}
