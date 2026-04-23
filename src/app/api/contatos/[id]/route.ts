import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";


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
  let numeros = telefone.replace(/\D/g, "");

  // remove 55 se vier com DDI
  if (numeros.startsWith("55") && numeros.length > 11) {
    numeros = numeros.slice(2);
  }

  // se tiver 10 dígitos (DDD + número antigo sem 9)
  if (numeros.length === 10) {
    const ddd = numeros.slice(0, 2);
    const numero = numeros.slice(2);

    // adiciona o 9 na frente
    numeros = ddd + "9" + numero;
  }

  return numeros;
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

const payload: Record<string, unknown> = {};

// nome
if (body?.nome !== undefined) {
  payload.nome = body.nome?.trim() || null;
}

// telefone
if (body?.telefone !== undefined) {
  const telefoneOriginal = body.telefone?.trim();
  const telefone = telefoneOriginal
    ? normalizarTelefoneBrasilParaWhatsApp(telefoneOriginal)
    : "";

  if (!telefone) {
    return NextResponse.json(
      { ok: false, error: "Telefone é obrigatório" },
      { status: 400 }
    );
  }

  const { data: contatoComMesmoTelefone } = await supabaseAdmin
    .from("contatos")
    .select("id")
    .eq("empresa_id", contatoAtual.empresa_id)
    .eq("telefone", telefone)
    .neq("id", id)
    .maybeSingle();

  if (contatoComMesmoTelefone) {
    return NextResponse.json(
      { ok: false, error: "Já existe outro contato com esse telefone nesta empresa" },
      { status: 409 }
    );
  }

  payload.telefone = telefone;
}

// email
if (body?.email !== undefined) {
  payload.email = body.email?.trim()?.toLowerCase() || null;
}

// empresa
if (body?.empresa !== undefined) {
  payload.empresa = body.empresa?.trim() || null;
}

// origem
if (body?.origem !== undefined) {
  payload.origem = body.origem?.trim() || null;
}

// campanha
if (body?.campanha !== undefined) {
  payload.campanha = body.campanha?.trim() || null;
}

// status_lead
if (body?.status_lead !== undefined) {
  if (
    !["novo", "em_atendimento", "qualificado", "cliente", "perdido"].includes(
      body.status_lead
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Status do lead inválido" },
      { status: 400 }
    );
  }

  payload.status_lead = body.status_lead;
}

// observacoes
if (body?.observacoes !== undefined) {
  payload.observacoes = body.observacoes?.trim() || null;
}

if (Object.keys(payload).length === 0) {
  return NextResponse.json(
    { ok: false, error: "Nenhum campo válido enviado para atualização" },
    { status: 400 }
  );
}

  const { data, error } = await supabaseAdmin
    .from("contatos")
    .update(payload)
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