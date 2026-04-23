import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";

const supabaseAdmin = getSupabaseAdmin();

type StatusLead =
  | "novo"
  | "em_atendimento"
  | "qualificado"
  | "cliente"
  | "perdido";

type ContatoImportacao = {
  nome?: string | null;
  telefone_original?: string;
  telefone_normalizado?: string;
  email?: string | null;
  origem?: string | null;
  origem_importacao?: string | null;
  campanha?: string | null;
  status_lead?: StatusLead;
  observacoes?: string | null;
  telefone_revisar?: boolean;
};

function podeGerenciarContatos(usuario: UsuarioContexto) {
  const nomesPerfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);

  return (
    nomesPerfis.includes("Administrador") ||
    nomesPerfis.includes("Supervisor") ||
    nomesPerfis.includes("Atendente")
  );
}

function telefoneImportacaoValido(telefone: string) {
  return telefone.length >= 8;
}

export async function POST(request: Request) {
  try {
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
        { ok: false, error: "Sem permissão para importar contatos" },
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
    const contatos = Array.isArray(body?.contatos) ? body.contatos : [];

    if (!contatos.length) {
      return NextResponse.json(
        { ok: false, error: "Nenhum contato válido enviado para importação" },
        { status: 400 }
      );
    }

    const { data: contatosExistentes, error: contatosError } = await supabaseAdmin
      .from("contatos")
      .select("telefone")
      .eq("empresa_id", usuario.empresa_id);

    if (contatosError) {
      return NextResponse.json(
        { ok: false, error: contatosError.message },
        { status: 500 }
      );
    }

    const telefonesBanco = new Set(
      (contatosExistentes || [])
        .map((item) => normalizarTelefoneBrasilParaWhatsApp(item.telefone))
        .filter(Boolean)
    );

    const telefonesLote = new Set<string>();
    const registros: any[] = [];
    const ignorados: any[] = [];

    for (const contato of contatos as ContatoImportacao[]) {
      const telefone = normalizarTelefoneBrasilParaWhatsApp(
        contato.telefone_normalizado || contato.telefone_original || ""
      );

      if (!telefoneImportacaoValido(telefone)) {
        ignorados.push({
          telefone,
          motivo: "Telefone inválido",
        });
        continue;
      }

      if (telefonesBanco.has(telefone) || telefonesLote.has(telefone)) {
        ignorados.push({
          telefone,
          motivo: "Telefone duplicado",
        });
        continue;
      }

      telefonesLote.add(telefone);

      registros.push({
        empresa_id: usuario.empresa_id,
        nome: contato.nome?.trim() || null,
        telefone,
        email: contato.email?.trim()?.toLowerCase() || null,
        origem:
          contato.origem_importacao?.trim() ||
          contato.origem?.trim() ||
          null,
        campanha: contato.campanha?.trim() || null,
        status_lead: contato.status_lead || "novo",
        observacoes: contato.observacoes?.trim() || null,
        telefone_revisar:
          Boolean(contato.telefone_revisar) || telefone.length < 10,
      });
    }

    if (!registros.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Nenhum contato pôde ser importado",
          ignorados,
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("contatos")
      .insert(registros)
      .select("id, nome, telefone");

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Importação concluída com sucesso",
      importados: data?.length || 0,
      ignorados,
      contatos: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao importar contatos" },
      { status: 500 }
    );
  }
}