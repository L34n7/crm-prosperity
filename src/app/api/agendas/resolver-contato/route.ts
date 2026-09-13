import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import { statusLeadLegadoDaClassificacao } from "@/lib/leads/classificacao";

type ContatoAgenda = {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  empresa: string | null;
};

const CONTATO_SELECT = "id, nome, telefone, email, empresa";

export async function POST(request: Request) {
  try {
    const resultado = await getUsuarioContexto();
    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status },
      );
    }

    const { usuario } = resultado;
    const bloqueio = bloquearSemPermissao(
      usuario,
      "agendas.editar",
      "Você não tem permissão para criar agendamentos.",
    );
    if (bloqueio) return bloqueio;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const telefone = normalizarTelefoneBrasilParaWhatsApp(body?.telefone);
    const nome = String(body?.nome || "").trim();
    const email = String(body?.email || "").trim();

    if (!telefone || telefone.length < 10) {
      return NextResponse.json(
        { ok: false, error: "Informe um telefone válido para o agendamento." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const variantesTelefone = Array.from(
      new Set([
        telefone,
        telefone.startsWith("55") && telefone.length >= 12
          ? telefone.slice(2)
          : telefone,
      ]),
    );

    const { data: existente, error: buscaError } = await supabase
      .from("contatos")
      .select(CONTATO_SELECT)
      .eq("empresa_id", usuario.empresa_id)
      .in("telefone", variantesTelefone)
      .limit(1)
      .maybeSingle<ContatoAgenda>();

    if (buscaError) {
      throw new Error(`Erro ao localizar contato: ${buscaError.message}`);
    }

    if (existente) {
      return NextResponse.json({
        ok: true,
        criado: false,
        telefone,
        contato: existente,
      });
    }

    const agora = new Date().toISOString();
    const { data: criado, error: criacaoError } = await supabase
      .from("contatos")
      .insert({
        empresa_id: usuario.empresa_id,
        nome: nome || `Contato ${telefone}`,
        telefone,
        email: email || null,
        origem: "Agenda",
        classificacao: "novo",
        classificacao_atualizada_em: agora,
        status_lead: statusLeadLegadoDaClassificacao("novo"),
        telefone_revisar: false,
      })
      .select(CONTATO_SELECT)
      .single<ContatoAgenda>();

    if (criacaoError || !criado) {
      // Uma criação simultânea com o mesmo número pode ganhar a corrida.
      // Nesse caso, reaproveitamos o contato que acabou de ser criado.
      const { data: concorrente } = await supabase
        .from("contatos")
        .select(CONTATO_SELECT)
        .eq("empresa_id", usuario.empresa_id)
        .in("telefone", variantesTelefone)
        .limit(1)
        .maybeSingle<ContatoAgenda>();

      if (concorrente) {
        return NextResponse.json({
          ok: true,
          criado: false,
          telefone,
          contato: concorrente,
        });
      }

      throw new Error(
        `Erro ao criar contato do agendamento: ${criacaoError?.message || "falha desconhecida"}`,
      );
    }

    return NextResponse.json({
      ok: true,
      criado: true,
      telefone,
      contato: criado,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao vincular o contato ao agendamento.",
      },
      { status: 500 },
    );
  }
}
