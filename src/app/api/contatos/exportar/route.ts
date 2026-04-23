import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";

function podeGerenciarContatos(usuario: UsuarioContexto) {
  const nomesPerfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);

  return (
    nomesPerfis.includes("Administrador") ||
    nomesPerfis.includes("Supervisor") ||
    nomesPerfis.includes("Atendente")
  );
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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
      { ok: false, error: "Sem permissão para exportar contatos" },
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

  const supabaseAdmin = getSupabaseAdmin();

  let query = supabaseAdmin
    .from("contatos")
    .select(`
      nome,
      telefone,
      email,
      origem,
      campanha,
      status_lead,
      observacoes,
      telefone_revisar,
      created_at,
      updated_at
    `)
    .eq("empresa_id", usuario.empresa_id)
    .order("nome", { ascending: true });

  if (
    statusLead &&
    ["novo", "em_atendimento", "qualificado", "cliente", "perdido"].includes(
      statusLead
    )
  ) {
    query = query.eq("status_lead", statusLead);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const headers = [
    "nome",
    "telefone",
    "email",
    "origem",
    "campanha",
    "status_lead",
    "observacoes",
    "telefone_revisar",
    "created_at",
    "updated_at",
  ];

  const rows = (data || []).map((contato) =>
    [
      contato.nome,
      contato.telefone,
      contato.email,
      contato.origem,
      contato.campanha,
      contato.status_lead,
      contato.observacoes,
      contato.telefone_revisar ? "sim" : "nao",
      contato.created_at,
      contato.updated_at,
    ]
      .map(csvEscape)
      .join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contatos-crm.csv"',
    },
  });
}