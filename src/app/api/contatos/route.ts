import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto, type UsuarioContexto } from "@/lib/auth/get-usuario-contexto";

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

export async function GET(request: Request) {
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
      { ok: false, error: "Sem permissão para listar contatos" },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const statusLead = searchParams.get("status_lead");
  const busca = searchParams.get("busca")?.trim();
  const supabaseAdmin = getSupabaseAdmin();

  let query = supabaseAdmin
    .from("contatos")
    .select("*")
    .eq("empresa_id", usuario.empresa_id)
    .order("created_at", { ascending: false });

  if (
    statusLead &&
    ["novo", "em_atendimento", "qualificado", "cliente", "perdido"].includes(
      statusLead
    )
  ) {
    query = query.eq("status_lead", statusLead);
  }

  if (busca) {
    query = query.or(
      `nome.ilike.%${busca}%,telefone.ilike.%${busca}%,email.ilike.%${busca}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    contatos: data ?? [],
  });
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();
  const supabaseAdmin = getSupabaseAdmin();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!podeGerenciarContatos(usuario)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para criar contato" },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = await request.json();

  const nome = body?.nome?.trim() || null;
  const telefoneOriginal = body?.telefone?.trim();
  const telefone = telefoneOriginal ? normalizarTelefone(telefoneOriginal) : "";
  const email = body?.email?.trim()?.toLowerCase() || null;
  const origem = body?.origem?.trim() || null;
  const campanha = body?.campanha?.trim() || null;
  const status_lead = body?.status_lead || "novo";
  const observacoes = body?.observacoes?.trim() || null;
  const empresa_id = usuario.empresa_id;

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

  const { data: contatoExistente } = await supabaseAdmin
    .from("contatos")
    .select("id")
    .eq("empresa_id", empresa_id)
    .eq("telefone", telefone)
    .maybeSingle();

  if (contatoExistente) {
    return NextResponse.json(
      { ok: false, error: "Já existe um contato com esse telefone nesta empresa" },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("contatos")
    .insert([
      {
        empresa_id,
        nome,
        telefone,
        email,
        origem,
        campanha,
        status_lead,
        observacoes,
      },
    ])
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
    message: "Contato criado com sucesso",
    contato: data,
  });
}