import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;

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

    const { data: fluxo, error: fluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("id")
      .eq("id", fluxoId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (fluxoError || !fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_gatilhos")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("fluxo_id", fluxoId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar gatilhos: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      gatilhos: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;

    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const valor = String(body?.valor || "").trim().toLowerCase();
    const condicao = String(body?.condicao || "contem").trim();
    const tipoGatilho = String(body?.tipo_gatilho || "palavra_chave").trim();

    if (!valor) {
      return NextResponse.json(
        { ok: false, error: "Informe a palavra-chave do gatilho." },
        { status: 400 }
      );
    }

    const condicoesPermitidas = ["contem", "exata", "inicia_com", "regex"];

    if (!condicoesPermitidas.includes(condicao)) {
      return NextResponse.json(
        { ok: false, error: "Condição inválida." },
        { status: 400 }
      );
    }

    const tiposPermitidos = [
      "palavra_chave",
      "primeira_mensagem",
      "evento",
      "webhook",
      "manual",
    ];

    if (!tiposPermitidos.includes(tipoGatilho)) {
      return NextResponse.json(
        { ok: false, error: "Tipo de gatilho inválido." },
        { status: 400 }
      );
    }

    const { data: fluxo, error: fluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("id")
      .eq("id", fluxoId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (fluxoError || !fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    const { data: gatilhoExistente } = await supabaseAdmin
      .from("automacao_gatilhos")
      .select("id")
      .eq("empresa_id", usuario.empresa_id)
      .eq("fluxo_id", fluxoId)
      .eq("tipo_gatilho", tipoGatilho)
      .eq("valor", valor)
      .maybeSingle();

    if (gatilhoExistente) {
      return NextResponse.json(
        { ok: false, error: "Esse gatilho já existe neste fluxo." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_gatilhos")
      .insert({
        empresa_id: usuario.empresa_id,
        fluxo_id: fluxoId,
        tipo_gatilho: tipoGatilho,
        valor,
        condicao,
        ativo: true,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao criar gatilho: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      gatilho: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;

    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const gatilhoId = String(body?.id || "").trim();

    if (!gatilhoId) {
      return NextResponse.json(
        { ok: false, error: "ID do gatilho é obrigatório." },
        { status: 400 }
      );
    }

    const atualizacao: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body?.valor !== undefined) {
      const valor = String(body.valor || "").trim().toLowerCase();

      if (!valor) {
        return NextResponse.json(
          { ok: false, error: "Informe a palavra-chave do gatilho." },
          { status: 400 }
        );
      }

      atualizacao.valor = valor;
    }

    if (body?.condicao !== undefined) {
      const condicao = String(body.condicao || "contem").trim();
      const condicoesPermitidas = ["contem", "exata", "inicia_com", "regex"];

      if (!condicoesPermitidas.includes(condicao)) {
        return NextResponse.json(
          { ok: false, error: "Condição inválida." },
          { status: 400 }
        );
      }

      atualizacao.condicao = condicao;
    }

    if (body?.ativo !== undefined) {
      atualizacao.ativo = Boolean(body.ativo);
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_gatilhos")
      .update(atualizacao)
      .eq("id", gatilhoId)
      .eq("fluxo_id", fluxoId)
      .eq("empresa_id", usuario.empresa_id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao atualizar gatilho: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      gatilho: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;

    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const gatilhoId = String(body?.id || "").trim();

    if (!gatilhoId) {
      return NextResponse.json(
        { ok: false, error: "ID do gatilho é obrigatório." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("automacao_gatilhos")
      .delete()
      .eq("id", gatilhoId)
      .eq("fluxo_id", fluxoId)
      .eq("empresa_id", usuario.empresa_id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao remover gatilho: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}