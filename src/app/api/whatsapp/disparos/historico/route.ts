import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export async function GET(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const limitParam = Number(searchParams.get("limit") || "50");

    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 200)
      : 50;

    const { data, error } = await supabaseAdmin
      .from("whatsapp_disparos_logs")
      .select(`
        id,
        conversa_id,
        conversa_protocolo_id,
        contato_id,
        numero,
        nome_contato,
        template_nome,
        template_idioma,
        mensagem,
        status,
        erro,
        status_http,
        message_id,
        created_at
      `)
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao buscar histórico de disparos: ${error.message}`,
        },
        { status: 500 }
      );
    }

    const resultados = (data || []).map((item) => ({
      id: item.id,
      created_at: item.created_at,
      conversa_id: item.conversa_id || null,
      conversa_protocolo_id: item.conversa_protocolo_id || null,
      contato_id: item.contato_id || null,
      numero: item.numero || "-",
      nome_contato: item.nome_contato || "Sem nome",
      template_nome: item.template_nome || "-",
      template_idioma: item.template_idioma || null,
      mensagem_template: item.mensagem || "Sem conteúdo",
      status_disparo: item.status || "falha",
      status_label: item.status === "sucesso" ? "Enviado" : "Falhou",
      status_http: item.status_http || null,
      message_id: item.message_id || null,
      erro: item.erro || null,
      ok: item.status === "sucesso",
    }));

    return NextResponse.json({
      ok: true,
      total: resultados.length,
      resultados,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro interno ao buscar histórico.",
      },
      { status: 500 }
    );
  }
}