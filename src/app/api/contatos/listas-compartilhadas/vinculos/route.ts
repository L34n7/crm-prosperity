import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();
const MAX_CONTATOS = 500;

async function contexto(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      ),
    };
  }

  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(
    usuario,
    "contatos.editar",
    "Sem permissão para vincular contatos a listas."
  );
  if (bloqueio) return { ok: false as const, response: bloqueio };

  if (!usuario.empresa_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      ),
    };
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {}

  const listaId = String(body.lista_id || "").trim();
  const contatoIds = Array.from(
    new Set(
      (Array.isArray(body.contato_ids) ? body.contato_ids : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );

  if (!listaId || contatoIds.length === 0) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Informe a lista e ao menos um contato." },
        { status: 400 }
      ),
    };
  }

  if (contatoIds.length > MAX_CONTATOS) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: `Selecione no máximo ${MAX_CONTATOS} contatos por operação.`,
        },
        { status: 400 }
      ),
    };
  }

  const [{ data: lista, error: listaError }, { data: contatos, error: contatosError }] =
    await Promise.all([
      supabaseAdmin
        .from("conversas_listas")
        .select("id, nome")
        .eq("empresa_id", usuario.empresa_id)
        .eq("id", listaId)
        .maybeSingle(),
      supabaseAdmin
        .from("contatos")
        .select("id")
        .eq("empresa_id", usuario.empresa_id)
        .in("id", contatoIds),
    ]);

  if (listaError || contatosError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: listaError?.message || contatosError?.message,
        },
        { status: 500 }
      ),
    };
  }

  if (!lista) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Lista não encontrada." },
        { status: 404 }
      ),
    };
  }

  const idsValidos = (contatos || []).map((contato) => contato.id);

  if (idsValidos.length === 0) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Nenhum contato selecionado foi encontrado." },
        { status: 404 }
      ),
    };
  }

  return {
    ok: true as const,
    usuario,
    lista,
    contatoIds: idsValidos,
    auditMeta: getRequestAuditMetadata(request),
  };
}

export async function POST(request: Request) {
  const ctx = await contexto(request);
  if (!ctx.ok) return ctx.response;

  const { usuario, lista, contatoIds, auditMeta } = ctx;

  const { error } = await supabaseAdmin
    .from("conversas_listas_contatos")
    .upsert(
      contatoIds.map((contatoId) => ({
        empresa_id: usuario.empresa_id,
        lista_id: lista.id,
        contato_id: contatoId,
        criado_por: usuario.id,
      })),
      { onConflict: "lista_id,contato_id", ignoreDuplicates: true }
    );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id!,
    categoria: "contatos",
    entidade: "lista_contatos",
    entidade_id: lista.id,
    acao: "contatos_adicionados_lista",
    descricao: `${contatoIds.length} contato(s) adicionados à lista "${lista.nome}"`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    depois: { contato_ids: contatoIds },
    metadata: { origem: "contatos", sincronizada_com_conversas: true },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    total: contatoIds.length,
    message: `${contatoIds.length} contato(s) vinculados à lista "${lista.nome}".`,
  });
}

export async function DELETE(request: Request) {
  // Remoção explícita de TODAS as listas de conversa dos contatos selecionados.
  const body = await request.clone().json().catch(() => ({}));
  if (body?.remover_todas === true) {
    const resultado = await getUsuarioContexto();
    if (!resultado.ok) return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
    const { usuario } = resultado;
    const bloqueio = bloquearSemPermissao(usuario, "contatos.editar", "Sem permissão para editar listas.");
    if (bloqueio) return bloqueio;
    if (!usuario.empresa_id) return NextResponse.json({ ok: false, error: "Empresa não identificada." }, { status: 400 });
    const ids = Array.from(new Set(
      (Array.isArray(body.contato_ids) ? body.contato_ids : []).map((id: unknown) => String(id || "").trim())
    )) as string[];
    const validos = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!ids.length || ids.length > MAX_CONTATOS || ids.some((id) => !validos.test(id))) {
      return NextResponse.json({ ok: false, error: "Seleção inválida de contatos." }, { status: 400 });
    }
    const selecionados = await supabaseAdmin.from("contatos").select("id")
      .eq("empresa_id", usuario.empresa_id).in("id", ids);
    if (selecionados.error) return NextResponse.json({ ok: false, error: selecionados.error.message }, { status: 500 });
    if ((selecionados.data || []).length !== ids.length) {
      return NextResponse.json({ ok: false, error: "Contato não pertence à empresa." }, { status: 400 });
    }
    const remocao = await supabaseAdmin.from("conversas_listas_contatos").delete()
      .eq("empresa_id", usuario.empresa_id).in("contato_id", ids);
    if (remocao.error) return NextResponse.json({ ok: false, error: remocao.error.message }, { status: 500 });
    const verifica = await supabaseAdmin.from("conversas_listas_contatos").select("contato_id", { count: "exact", head: true })
      .eq("empresa_id", usuario.empresa_id).in("contato_id", ids);
    if (verifica.error || (verifica.count || 0) !== 0) {
      return NextResponse.json({ ok: false, error: verifica.error?.message || "A remoção não foi confirmada." }, { status: 500 });
    }
    const meta = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id, categoria: "contatos", entidade: "contato",
      entidade_id: ids[0], acao: "contatos_removidos_todas_listas_conversa",
      descricao: `${ids.length} contato(s) desvinculados de todas as listas de conversa`,
      usuario_id: usuario.id, usuario_nome: usuario.nome, usuario_email: usuario.email,
      metadata: { contatos_ids: ids }, ip: meta.ip, user_agent: meta.user_agent,
    });
    return NextResponse.json({ ok: true, total: ids.length, message: "Contatos removidos de todas as listas de conversa." });
  }
  const ctx = await contexto(request);
  if (!ctx.ok) return ctx.response;

  const { usuario, lista, contatoIds, auditMeta } = ctx;

  const { error } = await supabaseAdmin
    .from("conversas_listas_contatos")
    .delete()
    .eq("empresa_id", usuario.empresa_id)
    .eq("lista_id", lista.id)
    .in("contato_id", contatoIds);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id!,
    categoria: "contatos",
    entidade: "lista_contatos",
    entidade_id: lista.id,
    acao: "contatos_removidos_lista",
    descricao: `${contatoIds.length} contato(s) removidos da lista "${lista.nome}"`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes: { contato_ids: contatoIds },
    metadata: { origem: "contatos", sincronizada_com_conversas: true },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    total: contatoIds.length,
    message: `${contatoIds.length} contato(s) removidos da lista "${lista.nome}".`,
  });
}
