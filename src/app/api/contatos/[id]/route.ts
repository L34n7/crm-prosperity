import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

function podeGerenciarContatos(usuario: UsuarioContexto) {
  const nomesPerfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);

  return (
    nomesPerfis.includes("Administrador") ||
    nomesPerfis.includes("Supervisor") ||
    nomesPerfis.includes("Atendente")
  );
}

function normalizarTelefone(telefone: string) {
  return telefone.replace(/\D/g, "");
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!podeGerenciarContatos(usuario)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para editar contato" },
      { status: 403 }
    );
  }

  const { data: contatoAtual, error: contatoAtualError } = await supabaseAdmin
    .from("contatos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (contatoAtualError) {
    return NextResponse.json(
      { ok: false, error: contatoAtualError.message },
      { status: 500 }
    );
  }

  if (!contatoAtual) {
    return NextResponse.json(
      { ok: false, error: "Contato não encontrado" },
      { status: 404 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  if (contatoAtual.empresa_id !== usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Você não pode editar este contato" },
      { status: 403 }
    );
  }

  const body = await request.json();

  const nome = body?.nome?.trim() || null;
  const telefoneOriginal = body?.telefone?.trim();
  const telefone = telefoneOriginal ? normalizarTelefone(telefoneOriginal) : "";
  const email = body?.email?.trim()?.toLowerCase() || null;
  const origem = body?.origem?.trim() || null;
  const campanha = body?.campanha?.trim() || null;
  const status_lead = body?.status_lead;
  const observacoes = body?.observacoes?.trim() || null;
  const empresa_id = contatoAtual.empresa_id;

  if (!empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Empresa é obrigatória" },
      { status: 400 }
    );
  }

  if (!telefone) {
    return NextResponse.json(
      { ok: false, error: "Telefone é obrigatório" },
      { status: 400 }
    );
  }

  if (
    !["novo", "em_atendimento", "qualificado", "cliente", "perdido"].includes(
      status_lead
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Status do lead inválido" },
      { status: 400 }
    );
  }

  const { data: empresa } = await supabaseAdmin
    .from("empresas")
    .select("id")
    .eq("id", empresa_id)
    .maybeSingle();

  if (!empresa) {
    return NextResponse.json(
      { ok: false, error: "Empresa não encontrada" },
      { status: 404 }
    );
  }

  const { data: contatoComMesmoTelefone } = await supabaseAdmin
    .from("contatos")
    .select("id")
    .eq("empresa_id", empresa_id)
    .eq("telefone", telefone)
    .neq("id", id)
    .maybeSingle();

  if (contatoComMesmoTelefone) {
    return NextResponse.json(
      { ok: false, error: "Já existe outro contato com esse telefone nesta empresa" },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("contatos")
    .update({
      empresa_id,
      nome,
      telefone,
      email,
      origem,
      campanha,
      status_lead,
      observacoes,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Contato atualizado com sucesso",
    contato: data,
  });
}