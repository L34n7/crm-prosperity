import { getEmailMarketingResendApiKey } from "@/lib/email-marketing/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const VALIDADE_CACHE_MS = 10 * 60_000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SupressaoResend = {
  id: string;
  email: string;
  origin: "bounce" | "complaint" | "manual";
};

type SupressaoLocal = {
  id: string;
  email: string;
  motivo: string;
  fonte: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

function normalizarEmail(valor: unknown) {
  return String(valor || "").trim().toLowerCase();
}

async function requisitarResend<T>(
  apiKey: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const resposta = await fetch("https://api.resend.com" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if ((resposta.status === 429 || resposta.status >= 500) && tentativa < 2) {
      await new Promise((resolver) => setTimeout(resolver, 700 * (tentativa + 1)));
      continue;
    }

    if (!resposta.ok) {
      throw new Error(
        "Não foi possível consultar a lista de supressão da Resend (HTTP " +
          resposta.status +
          "). Confira as permissões da API Key."
      );
    }
    return (await resposta.json()) as T;
  }
  throw new Error("A Resend não respondeu à consulta de supressões.");
}

async function listarResend(apiKey: string): Promise<Map<string, SupressaoResend>> {
  const encontrados = new Map<string, SupressaoResend>();
  let cursor = "";

  for (let pagina = 0; pagina < 1000; pagina++) {
    const parametros = new URLSearchParams({ limit: "100" });
    if (cursor) parametros.set("after", cursor);
    const resposta = await requisitarResend<{
      data: SupressaoResend[];
      has_more: boolean;
    }>(apiKey, "/suppressions?" + parametros.toString());

    if (!Array.isArray(resposta.data)) {
      throw new Error("Resposta de supressões inválida da Resend.");
    }
    for (const item of resposta.data) {
      const email = normalizarEmail(item.email);
      if (EMAIL_REGEX.test(email)) encontrados.set(email, { ...item, email });
    }
    if (!resposta.has_more) return encontrados;
    const ultimo = resposta.data.at(-1);
    if (!ultimo?.id || ultimo.id === cursor) {
      throw new Error("A paginação da lista de supressões da Resend falhou.");
    }
    cursor = ultimo.id;
    await new Promise((resolver) => setTimeout(resolver, 550));
  }
  throw new Error("A lista de supressões da Resend ultrapassou o limite seguro.");
}

async function buscarLocais(empresaId: string): Promise<SupressaoLocal[]> {
  const registros: SupressaoLocal[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabaseAdmin
      .from("email_suppressions")
      .select("id, email, motivo, fonte, metadata_json, created_at")
      .eq("empresa_id", empresaId)
      .order("id")
      .range(inicio, inicio + 999);
    if (error) throw new Error("Falha ao ler supressões locais: " + error.message);
    registros.push(...((data || []) as SupressaoLocal[]));
    if (!data || data.length < 1000) break;
  }
  return registros;
}

async function emailsComDescadastroPrecoce(locais: SupressaoLocal[]) {
  const suspeitos = new Set<string>();
  const ids = locais
    .filter((r) => r.motivo === "descadastro" && r.fonte === "email_marketing")
    .map((r) => String(r.metadata_json?.destinatario_id || ""))
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id));

  for (let inicio = 0; inicio < ids.length; inicio += 200) {
    const { data, error } = await supabaseAdmin
      .from("email_campanha_destinatarios")
      .select("id, email, enviado_em, descadastrado_em")
      .in("id", ids.slice(inicio, inicio + 200));
    if (error) throw new Error("Falha ao conferir descadastros antigos: " + error.message);

    for (const item of data || []) {
      if (!item.enviado_em || !item.descadastrado_em) continue;
      const diferenca =
        Date.parse(item.descadastrado_em) - Date.parse(item.enviado_em);
      if (diferenca >= 0 && diferenca <= 10_000) {
        suspeitos.add(normalizarEmail(item.email));
      }
    }
  }
  return suspeitos;
}

function motivoResend(origem: SupressaoResend["origin"]) {
  if (origem === "complaint") return "reclamacao";
  return origem === "bounce" ? "bounce" : "manual";
}

/**
 * A lista da conta Resend de cada empresa é a fonte de verdade.
 * Migra descadastros legados plausíveis para a Resend antes de remover registros
 * locais obsoletos. Descadastros em até 10 segundos do envio são suspeitos de
 * pré-visualização automática e não são migrados sem confirmação humana.
 *
 * Se a consulta da Resend falhar, o envio é interrompido (fail closed).
 */
export async function sincronizarSupressoesResend(empresaId: string) {
  const { data: integracao, error: erroIntegracao } = await supabaseAdmin
    .from("email_marketing_integracoes")
    .select("habilitado, supressoes_sincronizadas_em")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (erroIntegracao || !integracao?.habilitado) {
    throw new Error("A integração de E-mail Marketing não está disponível.");
  }

  const ultima = integracao.supressoes_sincronizadas_em
    ? Date.parse(integracao.supressoes_sincronizadas_em)
    : 0;
  if (Number.isFinite(ultima) && Date.now() - ultima < VALIDADE_CACHE_MS) {
    return;
  }

  const inicio = new Date().toISOString();
  const apiKey = await getEmailMarketingResendApiKey(empresaId);
  let provedor = await listarResend(apiKey);
  const locais = await buscarLocais(empresaId);
  const suspeitos = await emailsComDescadastroPrecoce(locais);

  // Solicitações antigas que não são suspeitas de scanner devem continuar
  // respeitadas: passam a existir na lista oficial da conta Resend.
  const legados = Array.from(new Set(locais
    .filter((item) =>
      item.motivo === "descadastro" &&
      item.fonte === "email_marketing" &&
      !suspeitos.has(normalizarEmail(item.email)) &&
      !provedor.has(normalizarEmail(item.email))
    )
    .map((item) => normalizarEmail(item.email))
    .filter((email) => EMAIL_REGEX.test(email))));

  for (let inicioLote = 0; inicioLote < legados.length; inicioLote += 100) {
    await requisitarResend(apiKey, "/suppressions/batch/add", {
      emails: legados.slice(inicioLote, inicioLote + 100),
    });
  }
  if (legados.length) {
    provedor = await listarResend(apiKey);
    if (legados.some((email) => !provedor.has(email))) {
      throw new Error("A Resend não confirmou a migração de todos os descadastros.");
    }
  }

  const mapaLocal = new Map(locais.map((item) => [normalizarEmail(item.email), item]));
  const inserir = Array.from(provedor.values())
    .filter((item) => !mapaLocal.has(item.email))
    .map((item) => ({
      empresa_id: empresaId,
      email: item.email,
      motivo: motivoResend(item.origin),
      fonte: "resend",
      metadata_json: { origem_resend: item.origin, suppression_id: item.id },
    }));

  for (let indice = 0; indice < inserir.length; indice += 200) {
    const { error } = await supabaseAdmin
      .from("email_suppressions")
      .insert(inserir.slice(indice, indice + 200));
    if (error && error.code !== "23505") {
      throw new Error("Falha ao importar supressões da Resend: " + error.message);
    }
  }

  for (const motivo of ["bounce", "reclamacao", "manual"] as const) {
    const ids = locais.filter((item) => {
      const original = provedor.get(normalizarEmail(item.email));
      return original &&
        motivoResend(original.origin) === motivo &&
        (item.motivo !== motivo || item.fonte !== "resend");
    }).map((item) => item.id);

    for (let indice = 0; indice < ids.length; indice += 200) {
      const { error } = await supabaseAdmin
        .from("email_suppressions")
        .update({ motivo, fonte: "resend" })
        .eq("empresa_id", empresaId)
        .in("id", ids.slice(indice, indice + 200));
      if (error) throw new Error("Falha ao atualizar supressões: " + error.message);
    }
  }

  const obsoletos = locais.filter((item) =>
    !provedor.has(normalizarEmail(item.email)) &&
    Date.parse(item.created_at) < Date.parse(inicio)
  );
  for (let indice = 0; indice < obsoletos.length; indice += 200) {
    const { error } = await supabaseAdmin
      .from("email_suppressions")
      .delete()
      .eq("empresa_id", empresaId)
      .lt("created_at", inicio)
      .in("id", obsoletos.slice(indice, indice + 200).map((item) => item.id));
    if (error) throw new Error("Falha ao remover bloqueios antigos: " + error.message);
  }

  // Aberturas automáticas não devem continuar marcadas como descadastro confirmado.
  for (const item of obsoletos.filter((r) => suspeitos.has(normalizarEmail(r.email)))) {
    const destinatarioId = String(item.metadata_json?.destinatario_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(destinatarioId)) continue;
    await supabaseAdmin
      .from("email_campanha_destinatarios")
      .update({ descadastrado_em: null })
      .eq("id", destinatarioId);
  }

  const { error: atualizarErro } = await supabaseAdmin
    .from("email_marketing_integracoes")
    .update({ supressoes_sincronizadas_em: new Date().toISOString() })
    .eq("empresa_id", empresaId);
  if (atualizarErro) {
    throw new Error("Falha ao salvar sincronização das supressões: " + atualizarErro.message);
  }
}

export async function registrarDescadastroNaResend(empresaId: string, email: string) {
  const apiKey = await getEmailMarketingResendApiKey(empresaId);
  const endereco = normalizarEmail(email);
  if (!EMAIL_REGEX.test(endereco)) throw new Error("Destinatário inválido.");

  const resposta = await fetch("https://api.resend.com/suppressions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: endereco }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (resposta.status === 409) {
    await requisitarResend(apiKey, "/suppressions/" + encodeURIComponent(endereco));
    return;
  }
  if (!resposta.ok) {
    throw new Error("A Resend não confirmou o descadastro (HTTP " + resposta.status + ").");
  }
}
