import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(usuario, "contatos.visualizar");
  if (bloqueio) return bloqueio;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  const { data: listas, error } = await supabaseAdmin
    .from("conversas_listas")
    .select("id, nome, created_at, updated_at")
    .eq("empresa_id", usuario.empresa_id)
    .order("nome", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const listaIds = (listas || []).map((lista) => lista.id);
  const contagens = new Map<string, number>();

  if (listaIds.length > 0) {
    const { data: membros, error: membrosError } = await supabaseAdmin
      .from("conversas_listas_contatos")
      .select("lista_id")
      .eq("empresa_id", usuario.empresa_id)
      .in("lista_id", listaIds);

    if (membrosError) {
      return NextResponse.json(
        { ok: false, error: membrosError.message },
        { status: 500 }
      );
    }

    for (const membro of membros || []) {
      contagens.set(
        membro.lista_id,
        (contagens.get(membro.lista_id) || 0) + 1
      );
    }
  }

  return NextResponse.json({
    ok: true,
    listas: (listas || []).map((lista) => ({
      ...lista,
      total_contatos: contagens.get(lista.id) || 0,
    })),
  });
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(
    usuario,
    "contatos.editar",
    "Sem permissão para criar listas de contatos."
  );
  if (bloqueio) return bloqueio;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

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

  const { data: lista, error } = await supabaseAdmin
    .from("conversas_listas")
    .insert({
      empresa_id: usuario.empresa_id,
      nome,
    })
    .select("id, nome, created_at, updated_at")
    .single();

  if (error || !lista) {
    const duplicada = error?.code === "23505";
    return NextResponse.json(
      {
        ok: false,
        error: duplicada
          ? "Já existe uma lista com esse nome."
          : error?.message || "Não foi possível criar a lista.",
      },
      { status: duplicada ? 409 : 500 }
    );
  }

  const auditMeta = getRequestAuditMetadata(request);
  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "contatos",
    entidade: "lista_contatos",
    entidade_id: lista.id,
    acao: "lista_compartilhada_criada",
    descricao: `Lista "${lista.nome}" criada no módulo Contatos`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    depois: lista,
    metadata: { origem: "contatos", sincronizada_com_conversas: true },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json(
    {
      ok: true,
      lista: { ...lista, total_contatos: 0 },
      message: "Lista criada com sucesso.",
    },
    { status: 201 }
  );
}
