import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import {
  WHATSAPP_OPT_OUT_CONTEXT_DAYS,
  escopoOptOutBloqueiaCategoria,
  identificarComandoOptOutWhatsapp,
  normalizarCategoriaOptOut,
  type WhatsAppOptOutScope,
  type WhatsAppSupressaoScope,
} from "@/lib/whatsapp/opt-out-policy";

const supabaseAdmin = getSupabaseAdmin();

function telefoneNormalizado(valor: unknown) {
  const somenteDigitos = String(valor || "").replace(/\D/g, "");
  return normalizarTelefoneBrasilParaWhatsApp(somenteDigitos) || somenteDigitos;
}

export async function buscarTelefonesSuprimidos(params: {
  empresaId: string;
  telefones: Array<string | null | undefined>;
  categoria?: string | null;
}) {
  const escoposPorTelefone = await buscarEscoposOptOutPorTelefone(params);
  const deveFiltrarPorCategoria = params.categoria !== undefined;

  return new Set(
    Array.from(escoposPorTelefone.entries())
      .filter(([, escopos]) => {
        if (!deveFiltrarPorCategoria) return escopos.size > 0;
        return Array.from(escopos).some((escopo) =>
          escopoOptOutBloqueiaCategoria(escopo, params.categoria)
        );
      })
      .map(([telefone]) => telefone)
  );
}

export type { WhatsAppSupressaoScope };

export async function buscarEscoposOptOutPorTelefone(params: {
  empresaId: string;
  telefones: Array<string | null | undefined>;
}) {
  const telefones = Array.from(
    new Set(params.telefones.map(telefoneNormalizado).filter(Boolean))
  );

  if (telefones.length === 0) {
    return new Map<string, Set<WhatsAppSupressaoScope>>();
  }

  const { data, error } = await supabaseAdmin
    .from("whatsapp_supressoes")
    .select("telefone_normalizado, escopo")
    .eq("empresa_id", params.empresaId)
    .eq("ativo", true)
    .in("telefone_normalizado", telefones);

  if (error) {
    throw new Error(`Erro ao verificar opt-out dos contatos: ${error.message}`);
  }

  const resultado = new Map<string, Set<WhatsAppSupressaoScope>>();

  for (const item of data || []) {
    const telefone = telefoneNormalizado(item.telefone_normalizado);
    const escopo = String(item.escopo || "") as WhatsAppSupressaoScope;
    if (
      !telefone ||
      !["todos_disparos", "marketing", "utility"].includes(escopo)
    ) {
      continue;
    }

    const escopos = resultado.get(telefone) || new Set<WhatsAppSupressaoScope>();
    escopos.add(escopo);
    resultado.set(telefone, escopos);
  }

  return resultado;
}

export async function telefoneEstaSuprimido(params: {
  empresaId: string;
  telefone: string;
  categoria: string;
}) {
  const telefone = telefoneNormalizado(params.telefone);
  if (!telefone) return false;

  const suprimidos = await buscarTelefonesSuprimidos({
    empresaId: params.empresaId,
    telefones: [telefone],
    categoria: params.categoria,
  });

  return suprimidos.has(telefone);
}

export async function registrarContextoOptOutTemplate(params: {
  empresaId: string;
  contatoId?: string | null;
  telefone: string;
  integracaoWhatsappId: string;
  conversaId?: string | null;
  templateId?: string | null;
  templateCategoria: string;
  optOutHabilitado: boolean;
  campanhaId?: string | null;
  itemId?: string | null;
  mensagemExternaId?: string | null;
  origem?: string | null;
}) {
  const mensagemExternaId = String(params.mensagemExternaId || "").trim();
  const telefone = telefoneNormalizado(params.telefone);
  const templateCategoria = normalizarCategoriaOptOut(
    params.templateCategoria
  );

  if (
    !mensagemExternaId ||
    !telefone ||
    !templateCategoria ||
    params.optOutHabilitado !== true
  ) {
    return { criado: false, motivo: "template_sem_contexto_opt_out" };
  }

  const enviadoEm = new Date();
  const expiraEm = new Date(
    enviadoEm.getTime() +
      WHATSAPP_OPT_OUT_CONTEXT_DAYS * 24 * 60 * 60 * 1000
  );

  const { error } = await supabaseAdmin
    .from("whatsapp_opt_out_contextos")
    .upsert(
      {
        empresa_id: params.empresaId,
        contato_id: params.contatoId || null,
        telefone_normalizado: telefone,
        integracao_whatsapp_id: params.integracaoWhatsappId,
        conversa_id: params.conversaId || null,
        template_id: params.templateId || null,
        template_categoria: templateCategoria,
        campanha_id: params.campanhaId || null,
        item_id: params.itemId || null,
        mensagem_externa_id: mensagemExternaId,
        status: "aguardando_resposta",
        enviado_em: enviadoEm.toISOString(),
        expira_em: expiraEm.toISOString(),
        metadata_json: {
          origem: params.origem || "template",
          possui_instrucao_opt_out: true,
          template_categoria: templateCategoria,
        },
        updated_at: enviadoEm.toISOString(),
      },
      {
        onConflict: "empresa_id,mensagem_externa_id",
        ignoreDuplicates: true,
      }
    );

  if (error) {
    throw new Error(`Erro ao registrar contexto de opt-out: ${error.message}`);
  }

  return { criado: true, motivo: null };
}

type ContextoOptOut = {
  id: string;
  mensagem_externa_id: string;
  status: string;
  expira_em: string;
  enviado_em: string;
  conversa_id: string | null;
  template_categoria: WhatsAppOptOutScope;
};

async function buscarContextoOptOutElegivel(params: {
  empresaId: string;
  integracaoWhatsappId: string;
  telefone: string;
  contextoMensagemExternaId?: string | null;
}) {
  const agora = new Date().toISOString();
  const telefone = telefoneNormalizado(params.telefone);
  const contextoMensagemExternaId = String(
    params.contextoMensagemExternaId || ""
  ).trim();

  let query = supabaseAdmin
    .from("whatsapp_opt_out_contextos")
    .select(
      "id, mensagem_externa_id, status, expira_em, enviado_em, conversa_id, template_categoria"
    )
    .eq("empresa_id", params.empresaId)
    .eq("integracao_whatsapp_id", params.integracaoWhatsappId)
    .eq("telefone_normalizado", telefone)
    .eq("status", "aguardando_resposta")
    .in("template_categoria", ["marketing", "utility"])
    .gt("expira_em", agora);

  if (contextoMensagemExternaId) {
    query = query.eq("mensagem_externa_id", contextoMensagemExternaId);
  } else {
    query = query.order("enviado_em", { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar contexto de opt-out: ${error.message}`);
  }

  const contexto = (data || null) as ContextoOptOut | null;

  if (!contexto || contextoMensagemExternaId || !contexto.conversa_id) {
    return contexto;
  }

  const { data: mensagemPosterior, error: mensagemPosteriorError } =
    await supabaseAdmin
      .from("mensagens")
      .select("id")
      .eq("empresa_id", params.empresaId)
      .eq("conversa_id", contexto.conversa_id)
      .neq("remetente_tipo", "contato")
      .gt("created_at", contexto.enviado_em)
      .limit(1)
      .maybeSingle();

  if (mensagemPosteriorError) {
    throw new Error(
      `Erro ao validar resposta ao template de opt-out: ${mensagemPosteriorError.message}`
    );
  }

  if (mensagemPosterior) {
    await supabaseAdmin
      .from("whatsapp_opt_out_contextos")
      .update({
        status: "consumido",
        updated_at: new Date().toISOString(),
      })
      .eq("id", contexto.id)
      .eq("status", "aguardando_resposta");

    return null;
  }

  return contexto;
}

async function consumirContextosOptOutPendentes(params: {
  empresaId: string;
  integracaoWhatsappId: string;
  telefone: string;
  mensagemId?: string | null;
  mensagemExternaId: string;
}) {
  const agora = new Date().toISOString();
  const telefone = telefoneNormalizado(params.telefone);
  const { error } = await supabaseAdmin
    .from("whatsapp_opt_out_contextos")
    .update({
      status: "consumido",
      respondido_em: agora,
      resposta_mensagem_id: params.mensagemId || null,
      resposta_mensagem_externa_id: params.mensagemExternaId,
      updated_at: agora,
    })
    .eq("empresa_id", params.empresaId)
    .eq("integracao_whatsapp_id", params.integracaoWhatsappId)
    .eq("telefone_normalizado", telefone)
    .eq("status", "aguardando_resposta");

  if (error) {
    throw new Error(`Erro ao consumir contextos de opt-out: ${error.message}`);
  }
}

export async function processarMensagemRecebidaParaOptOut(params: {
  empresaId: string;
  contatoId: string;
  telefone: string;
  integracaoWhatsappId: string;
  mensagemId?: string | null;
  mensagemExternaId: string;
  tipoMensagem: string;
  texto?: string | null;
  contextoMensagemExternaId?: string | null;
}) {
  if (!["texto", "botao"].includes(params.tipoMensagem)) {
    return { optOutRegistrado: false, contextoConsumido: false };
  }

  const contexto = await buscarContextoOptOutElegivel({
    empresaId: params.empresaId,
    integracaoWhatsappId: params.integracaoWhatsappId,
    telefone: params.telefone,
    contextoMensagemExternaId: params.contextoMensagemExternaId,
  });

  if (!contexto) {
    return { optOutRegistrado: false, contextoConsumido: false };
  }

  const comando = identificarComandoOptOutWhatsapp(params.texto);

  if (!comando) {
    await consumirContextosOptOutPendentes({
      empresaId: params.empresaId,
      integracaoWhatsappId: params.integracaoWhatsappId,
      telefone: params.telefone,
      mensagemId: params.mensagemId,
      mensagemExternaId: params.mensagemExternaId,
    });

    return { optOutRegistrado: false, contextoConsumido: true };
  }

  const telefone = telefoneNormalizado(params.telefone);
  const { data, error } = await supabaseAdmin.rpc(
    "registrar_whatsapp_opt_out",
    {
      p_empresa_id: params.empresaId,
      p_contato_id: params.contatoId,
      p_telefone_normalizado: telefone,
      p_integracao_whatsapp_id: params.integracaoWhatsappId,
      p_contexto_id: contexto.id,
      p_mensagem_id: params.mensagemId || null,
      p_mensagem_externa_id: params.mensagemExternaId,
      p_palavra_chave: comando,
      p_escopo: contexto.template_categoria,
      p_metadata_json: {
        contexto_mensagem_externa_id:
          params.contextoMensagemExternaId || null,
        template_categoria: contexto.template_categoria,
      },
    }
  );

  if (error) {
    throw new Error(`Erro ao registrar opt-out: ${error.message}`);
  }

  await consumirContextosOptOutPendentes({
    empresaId: params.empresaId,
    integracaoWhatsappId: params.integracaoWhatsappId,
    telefone: params.telefone,
    mensagemId: params.mensagemId,
    mensagemExternaId: params.mensagemExternaId,
  });

  const resultado = Array.isArray(data) ? data[0] : data;

  return {
    optOutRegistrado: true,
    contextoConsumido: true,
    jaBloqueado: resultado?.ja_bloqueado === true,
    supressaoId: resultado?.supressao_id || null,
    escopo: contexto.template_categoria,
  };
}
