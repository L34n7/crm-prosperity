import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();

async function contextoLista(id: string) {
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
    "Sem permissão para gerenciar listas de contatos."
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

  const { data: lista, error } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, nome, created_at, updated_at")
    .eq("empresa_id", usuario.empresa_id)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: error.message },
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

  return { ok: true as const, usuario, lista };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const contextoListaResultado = await contextoLista(id);
  if (!contextoListaResultado.ok) return contextoListaResultado.response;

  const { usuario, lista } = contextoListaResultado;
  let body: Record<string, unknown> = {};

  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {}

  const nome = String(body.nome || "").trim();

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Informe o nome da lista." },
      { status: 400 }
    );
  }

  if (nome.length > 160) {
    return NextResponse.json(
      { ok: false, error: "O nome da lista deve ter no máximo 160 caracteres." },
      { status: 400 }
    );
  }

  const { data: atualizada, error } = await supabaseAdmin
    .from("conversas_listas")
    .update({ nome, updated_at: new Date().toISOString() })
    .eq("empresa_id", usuario.empresa_id)
    .eq("id", id)
    .select("id, nome, created_at, updated_at")
    .single();

  if (error) {
    const duplicada = error.code === "23505";
    return NextResponse.json(
      {
        ok: false,
        error: duplicada
          ? "Já existe uma lista com esse nome."
          : error.message,
      },
      { status: duplicada ? 409 : 500 }
    );
  }

  const auditMeta = getRequestAuditMetadata(request);
  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id!,
    categoria: "contatos",
    entidade: "lista_contatos",
    entidade_id: id,
    acao: "lista_compartilhada_renomeada",
    descricao: `Lista "${lista.nome}" renomeada para "${nome}"`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes: lista,
    depois: atualizada,
    metadata: { origem: "contatos", sincronizada_com_conversas: true },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    lista: atualizada,
    message: "Lista atualizada com sucesso.",
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const contextoListaResultado = await contextoLista(id);
  if (!contextoListaResultado.ok) return contextoListaResultado.response;

  const { usuario, lista } = contextoListaResultado;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {}

  if (body.confirmar_exclusao !== true) {
    return NextResponse.json(
      { ok: false, error: "Confirme a exclusão da lista." },
      { status: 400 }
    );
  }

  const { count: totalContatos } = await supabaseAdmin
    .from("conversas_listas_contatos")
    .select("contato_id", { count: "exact", head: true })
    .eq("empresa_id", usuario.empresa_id)
    .eq("lista_id", id);

  const { error } = await supabaseAdmin
    .from("conversas_listas")
    .delete()
    .eq("empresa_id", usuario.empresa_id)
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const auditMeta = getRequestAuditMetadata(request);
  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id!,
    categoria: "contatos",
    entidade: "lista_contatos",
    entidade_id: id,
    acao: "lista_compartilhada_excluida",
    descricao: `Lista "${lista.nome}" excluída`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes: lista,
    metadata: {
      origem: "contatos",
      contatos_desvinculados: totalContatos || 0,
      contatos_excluidos: 0,
      sincronizada_com_conversas: true,
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    message: `Lista "${lista.nome}" excluída. Os contatos foram preservados.`,
  });
}
