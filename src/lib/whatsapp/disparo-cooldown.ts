import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export const ERRO_META_LIMITE_QUALIDADE_MARKETING = 131049;

function telefoneNormalizado(valor: unknown) {
  const somenteDigitos = String(valor || "").replace(/\D/g, "");
  return normalizarTelefoneBrasilParaWhatsApp(somenteDigitos) || somenteDigitos;
}

function categoriaNormalizada(valor: unknown) {
  const categoria = String(valor || "").trim().toLowerCase();
  return categoria === "utility" ? "utility" : "marketing";
}

function numeroEnv(nome: string, fallback: number, min: number, max: number) {
  const valor = Number(process.env[nome]);
  if (!Number.isFinite(valor)) return fallback;
  return Math.max(min, Math.min(max, valor));
}

function janelaHoras131049() {
  return numeroEnv("WHATSAPP_DISPARO_131049_WINDOW_HOURS", 24, 1, 168);
}

function cooldownHorasPorOcorrencia131049(ocorrencias: number) {
  if (ocorrencias >= 3) {
    return numeroEnv("WHATSAPP_DISPARO_131049_THIRD_HOURS", 72, 1, 720);
  }

  if (ocorrencias === 2) {
    return numeroEnv("WHATSAPP_DISPARO_131049_SECOND_HOURS", 24, 1, 720);
  }

  return numeroEnv("WHATSAPP_DISPARO_131049_FIRST_HOURS", 6, 1, 720);
}

function dataComHoras(data: Date, horas: number) {
  return new Date(data.getTime() + horas * 60 * 60 * 1000).toISOString();
}

function tabelaCooldownAusente(error: { code?: string; message?: string }) {
  const mensagem = String(error.message || "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    mensagem.includes("ocorrencias_janela") ||
    mensagem.includes("janela_inicio_em") ||
    mensagem.includes("ultima_ocorrencia_em") ||
    mensagem.includes("whatsapp_disparo_cooldowns")
  );
}

export async function buscarTelefonesEmCooldownDisparo(params: {
  empresaId: string;
  telefones: Array<string | null | undefined>;
  categoria?: string | null;
}) {
  const cooldowns = await buscarCooldownsDisparoPorTelefone(params);
  return new Set(cooldowns.keys());
}

export type CooldownDisparoContato = {
  telefone: string;
  categoria: string;
  expiraEm: string | null;
  ocorrenciasJanela: number;
  cooldownHoras: number | null;
};

export async function buscarCooldownsDisparoPorTelefone(params: {
  empresaId: string;
  telefones: Array<string | null | undefined>;
  categoria?: string | null;
}) {
  const telefones = Array.from(
    new Set(params.telefones.map(telefoneNormalizado).filter(Boolean))
  );

  if (telefones.length === 0) {
    return new Map<string, CooldownDisparoContato>();
  }

  const categoria = categoriaNormalizada(params.categoria);
  const agora = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("whatsapp_disparo_cooldowns")
    .select(
      "telefone_normalizado, categoria, expira_em, ocorrencias_janela, metadata_json"
    )
    .eq("empresa_id", params.empresaId)
    .eq("categoria", categoria)
    .eq("ativo", true)
    .gt("expira_em", agora)
    .in("telefone_normalizado", telefones);

  if (error) {
    if (tabelaCooldownAusente(error)) {
      console.warn(
        "[WHATSAPP DISPARO COOLDOWN] Migration de cooldown ainda nao aplicada."
      );
      return new Map<string, CooldownDisparoContato>();
    }

    throw new Error(
      `Erro ao verificar cooldown de disparos: ${error.message}`
    );
  }

  const resultado = new Map<string, CooldownDisparoContato>();

  for (const item of data || []) {
    const telefone = telefoneNormalizado(item.telefone_normalizado);
    if (!telefone) continue;

    const metadata =
      item.metadata_json &&
      typeof item.metadata_json === "object" &&
      !Array.isArray(item.metadata_json)
        ? (item.metadata_json as Record<string, unknown>)
        : {};
    const cooldownHoras = Number(metadata.cooldown_horas);

    resultado.set(telefone, {
      telefone,
      categoria: categoriaNormalizada(item.categoria),
      expiraEm: item.expira_em ? String(item.expira_em) : null,
      ocorrenciasJanela: Math.max(1, Number(item.ocorrencias_janela || 1)),
      cooldownHoras: Number.isFinite(cooldownHoras)
        ? Math.max(1, Math.floor(cooldownHoras))
        : null,
    });
  }

  return resultado;
}

export async function telefoneEstaEmCooldownDisparo(params: {
  empresaId: string;
  telefone: string;
  categoria?: string | null;
}) {
  const telefone = telefoneNormalizado(params.telefone);
  if (!telefone) return false;

  const bloqueados = await buscarTelefonesEmCooldownDisparo({
    empresaId: params.empresaId,
    telefones: [telefone],
    categoria: params.categoria,
  });

  return bloqueados.has(telefone);
}

export async function registrarCooldownDisparoMeta131049(params: {
  empresaId: string;
  telefone: string;
  categoria?: string | null;
  contatoId?: string | null;
  integracaoWhatsappId?: string | null;
  campanhaId?: string | null;
  itemId?: string | null;
  mensagemExternaId?: string | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  const telefone = telefoneNormalizado(params.telefone);
  if (!telefone) return { registrado: false, motivo: "telefone_ausente" };

  const categoria = categoriaNormalizada(params.categoria);
  const agoraData = new Date();
  const agora = agoraData.toISOString();

  const { data: existente, error: selectError } = await supabaseAdmin
    .from("whatsapp_disparo_cooldowns")
    .select(
      "id, ocorrencias_janela, janela_inicio_em, metadata_json"
    )
    .eq("empresa_id", params.empresaId)
    .eq("telefone_normalizado", telefone)
    .eq("categoria", categoria)
    .eq("motivo", "meta_131049")
    .eq("ativo", true)
    .maybeSingle();

  if (selectError) {
    if (tabelaCooldownAusente(selectError)) {
      console.warn(
        "[WHATSAPP DISPARO COOLDOWN] Migration de cooldown ainda nao aplicada."
      );
      return { registrado: false, motivo: "migration_ausente" };
    }

    throw new Error(
      `Erro ao buscar cooldown de disparos: ${selectError.message}`
    );
  }

  const janelaInicioAtual = existente?.janela_inicio_em
    ? new Date(String(existente.janela_inicio_em))
    : null;
  const janelaValida =
    janelaInicioAtual &&
    Number.isFinite(janelaInicioAtual.getTime()) &&
    agoraData.getTime() - janelaInicioAtual.getTime() <=
      janelaHoras131049() * 60 * 60 * 1000;
  const ocorrencias = janelaValida
    ? Math.max(1, Number(existente?.ocorrencias_janela || 0)) + 1
    : 1;
  const janelaInicio = janelaValida ? janelaInicioAtual.toISOString() : agora;
  const cooldownHoras = cooldownHorasPorOcorrencia131049(ocorrencias);
  const expiraEm = dataComHoras(agoraData, cooldownHoras);
  const metadataAtual =
    existente?.metadata_json &&
    typeof existente.metadata_json === "object" &&
    !Array.isArray(existente.metadata_json)
      ? (existente.metadata_json as Record<string, unknown>)
      : {};
  const payload = {
    contato_id: params.contatoId || null,
    integracao_whatsapp_id: params.integracaoWhatsappId || null,
    ativo: true,
    expira_em: expiraEm,
    ocorrencias_janela: ocorrencias,
    janela_inicio_em: janelaInicio,
    ultima_ocorrencia_em: agora,
    campanha_id: params.campanhaId || null,
    item_id: params.itemId || null,
    mensagem_externa_id: params.mensagemExternaId || null,
    erro_codigo_meta: ERRO_META_LIMITE_QUALIDADE_MARKETING,
    metadata_json: {
      ...metadataAtual,
      ultimo_evento: params.metadataJson || {},
      cooldown_horas: cooldownHoras,
      ocorrencias_janela: ocorrencias,
      janela_horas: janelaHoras131049(),
    },
    updated_at: agora,
  };

  const { data: atualizado, error: updateError } = existente?.id
    ? await supabaseAdmin
        .from("whatsapp_disparo_cooldowns")
        .update(payload)
        .eq("id", existente.id)
        .select("id")
        .maybeSingle()
    : { data: null, error: null };

  if (updateError) {
    if (tabelaCooldownAusente(updateError)) {
      console.warn(
        "[WHATSAPP DISPARO COOLDOWN] Migration de cooldown ainda nao aplicada."
      );
      return { registrado: false, motivo: "migration_ausente" };
    }

    throw new Error(
      `Erro ao atualizar cooldown de disparos: ${updateError.message}`
    );
  }

  if (atualizado?.id) {
    return {
      registrado: true,
      id: atualizado.id,
      expiraEm,
      ocorrencias,
      cooldownHoras,
    };
  }

  const { data: inserido, error: insertError } = await supabaseAdmin
    .from("whatsapp_disparo_cooldowns")
    .insert({
      empresa_id: params.empresaId,
      telefone_normalizado: telefone,
      categoria,
      motivo: "meta_131049",
      bloqueado_em: agora,
      ...payload,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (tabelaCooldownAusente(insertError)) {
      console.warn(
        "[WHATSAPP DISPARO COOLDOWN] Migration de cooldown ainda nao aplicada."
      );
      return { registrado: false, motivo: "migration_ausente" };
    }

    if (insertError.code === "23505") {
      return registrarCooldownDisparoMeta131049(params);
    }

    throw new Error(
      `Erro ao registrar cooldown de disparos: ${insertError.message}`
    );
  }

  return {
    registrado: true,
    id: inserido?.id || null,
    expiraEm,
    ocorrencias,
    cooldownHoras,
  };
}
