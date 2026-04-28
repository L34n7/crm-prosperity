import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;

    const { data: fluxo, error: fluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("*")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .single();

    if (fluxoError || !fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    const { data: nos, error: nosError } = await supabaseAdmin
      .from("automacao_nos")
      .select("*")
      .eq("fluxo_id", id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("ativo", true)
      .order("created_at", { ascending: true });

    if (nosError) {
      return NextResponse.json(
        { ok: false, error: nosError.message },
        { status: 500 }
      );
    }

    const { data: conexoes, error: conexoesError } = await supabaseAdmin
      .from("automacao_conexoes")
      .select("*")
      .eq("fluxo_id", id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    if (conexoesError) {
      return NextResponse.json(
        { ok: false, error: conexoesError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      fluxo,
      nos: nos || [],
      conexoes: conexoes || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    const nos = Array.isArray(body?.nos) ? body.nos : [];
    const conexoes = Array.isArray(body?.conexoes) ? body.conexoes : [];

    const { data: fluxo, error: fluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("id, empresa_id")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .single();

    if (fluxoError || !fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    const agora = new Date().toISOString();

    await supabaseAdmin
      .from("automacao_conexoes")
      .update({ ativo: false, updated_at: agora })
      .eq("fluxo_id", id)
      .eq("empresa_id", usuario.empresa_id);

    await supabaseAdmin
      .from("automacao_nos")
      .update({ ativo: false, updated_at: agora })
      .eq("fluxo_id", id)
      .eq("empresa_id", usuario.empresa_id);

    if (nos.length > 0) {
      const nosParaSalvar = nos.map((no: any) => ({
        id: no.id,
        empresa_id: usuario.empresa_id,
        fluxo_id: id,
        tipo_no: no.tipo_no,
        titulo: no.titulo || "Bloco",
        descricao: no.descricao || null,
        posicao_x: Math.round(Number(no.posicao_x || 0)),
        posicao_y: Math.round(Number(no.posicao_y || 0)),
        configuracao_json: no.configuracao_json || {},
        ativo: true,
        updated_at: agora,
      }));

      const { error: nosUpsertError } = await supabaseAdmin
        .from("automacao_nos")
        .upsert(nosParaSalvar, { onConflict: "id" });

      if (nosUpsertError) {
        return NextResponse.json(
          { ok: false, error: nosUpsertError.message },
          { status: 500 }
        );
      }
    }

    if (conexoes.length > 0) {
      const conexoesParaSalvar = conexoes.map((conexao: any, index: number) => ({
        id: conexao.id,
        empresa_id: usuario.empresa_id,
        fluxo_id: id,
        no_origem_id: conexao.no_origem_id,
        no_destino_id: conexao.no_destino_id,
        condicao_json: conexao.condicao_json || {},
        rotulo: conexao.rotulo || null,
        ordem: Number(conexao.ordem || index + 1),
        ativo: true,
        updated_at: agora,
      }));

      const { error: conexoesUpsertError } = await supabaseAdmin
        .from("automacao_conexoes")
        .upsert(conexoesParaSalvar, { onConflict: "id" });

      if (conexoesUpsertError) {
        return NextResponse.json(
          { ok: false, error: conexoesUpsertError.message },
          { status: 500 }
        );
      }
    }

    await supabaseAdmin
      .from("automacao_fluxos")
      .update({
        updated_at: agora,
        atualizado_por: usuario.id,
      })
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id);

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

export async function DELETE(req: NextRequest) {
  try {
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

    const id = String(body?.id || "").trim();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do fluxo é obrigatório." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("automacao_fluxos")
      .update({
        status: "arquivado",
        updated_at: new Date().toISOString(),
        atualizado_por: usuario.id,
      })
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao apagar fluxo: ${error.message}` },
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