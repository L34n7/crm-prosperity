import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
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

    const { data, error } = await supabaseAdmin
      .from("automacao_fluxos")
      .select(`
        id,
        nome,
        descricao,
        status,
        canal,
        created_at,
        updated_at
      `)
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar fluxos: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      fluxos: data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

    const nome = String(body?.nome || "").trim();
    const descricao = String(body?.descricao || "").trim();
    const canal = String(body?.canal || "whatsapp").trim();
    const status = String(body?.status || "rascunho").trim();

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Nome do fluxo é obrigatório." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_fluxos")
      .insert({
        empresa_id: usuario.empresa_id,
        nome,
        descricao: descricao || null,
        canal,
        status,
        criado_por: usuario.id,
        atualizado_por: usuario.id,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao criar fluxo: ${error.message}` },
        { status: 500 }
      );
    }

    const { error: inicioError } = await supabaseAdmin
      .from("automacao_nos")
      .insert({
        empresa_id: usuario.empresa_id,
        fluxo_id: data.id,
        tipo_no: "inicio",
        titulo: "Início",
        descricao: null,
        posicao_x: 120,
        posicao_y: 180,
        configuracao_json: {},
        ativo: true,
      });

    if (inicioError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Fluxo criado, mas houve erro ao criar o bloco inicial: ${inicioError.message}`,
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      ok: true,
      fluxo: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
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

    const atualizacao: Record<string, any> = {
      updated_at: new Date().toISOString(),
      atualizado_por: usuario.id,
    };

    if (body?.nome !== undefined) {
      atualizacao.nome = String(body.nome || "").trim();
    }

    if (body?.descricao !== undefined) {
      const descricao = String(body.descricao || "").trim();
      atualizacao.descricao = descricao || null;
    }

    if (body?.canal !== undefined) {
      atualizacao.canal = String(body.canal || "whatsapp").trim();
    }

    if (body?.status !== undefined) {
      atualizacao.status = String(body.status || "rascunho").trim();
    }

    if (atualizacao.nome !== undefined && !atualizacao.nome) {
      return NextResponse.json(
        { ok: false, error: "Nome do fluxo é obrigatório." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_fluxos")
      .update(atualizacao)
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao atualizar fluxo: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      fluxo: data,
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
    const definitivo = Boolean(body?.definitivo);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do fluxo é obrigatório." },
        { status: 400 }
      );
    }

    if (definitivo) {
      const { error } = await supabaseAdmin
        .from("automacao_fluxos")
        .delete()
        .eq("id", id)
        .eq("empresa_id", usuario.empresa_id)
        .eq("status", "arquivado");

      if (error) {
        return NextResponse.json(
          { ok: false, error: `Erro ao apagar definitivamente: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        definitivo: true,
      });
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
        { ok: false, error: `Erro ao arquivar fluxo: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      definitivo: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
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

    const id = String(body?.id || "").trim();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do fluxo é obrigatório." },
        { status: 400 }
      );
    }

    const { data: fluxoOriginal, error: fluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("*")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .single();

    if (fluxoError || !fluxoOriginal) {
      return NextResponse.json(
        { ok: false, error: "Fluxo original não encontrado." },
        { status: 404 }
      );
    }

    const { data: novoFluxo, error: novoFluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .insert({
        empresa_id: usuario.empresa_id,
        nome: `${fluxoOriginal.nome} - cópia`,
        descricao: fluxoOriginal.descricao,
        canal: fluxoOriginal.canal,
        status: "rascunho",
        criado_por: usuario.id,
        atualizado_por: usuario.id,
      })
      .select("*")
      .single();

    if (novoFluxoError || !novoFluxo) {
      return NextResponse.json(
        { ok: false, error: `Erro ao duplicar fluxo: ${novoFluxoError?.message}` },
        { status: 500 }
      );
    }

    const { data: nosOriginais, error: nosError } = await supabaseAdmin
      .from("automacao_nos")
      .select("*")
      .eq("fluxo_id", fluxoOriginal.id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("ativo", true);

    if (nosError) {
      return NextResponse.json(
        { ok: false, error: nosError.message },
        { status: 500 }
      );
    }

    const mapaIds = new Map<string, string>();

    const nosDuplicados = (nosOriginais || []).map((no) => {
      const novoId = crypto.randomUUID();
      mapaIds.set(no.id, novoId);

      return {
        id: novoId,
        empresa_id: usuario.empresa_id,
        fluxo_id: novoFluxo.id,
        tipo_no: no.tipo_no,
        titulo: no.titulo,
        descricao: no.descricao,
        posicao_x: no.posicao_x,
        posicao_y: no.posicao_y,
        configuracao_json: no.configuracao_json || {},
        ativo: true,
      };
    });

    if (nosDuplicados.length > 0) {
      const { error: inserirNosError } = await supabaseAdmin
        .from("automacao_nos")
        .insert(nosDuplicados);

      if (inserirNosError) {
        return NextResponse.json(
          { ok: false, error: inserirNosError.message },
          { status: 500 }
        );
      }
    }

    const { data: conexoesOriginais, error: conexoesError } = await supabaseAdmin
      .from("automacao_conexoes")
      .select("*")
      .eq("fluxo_id", fluxoOriginal.id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("ativo", true);

    if (conexoesError) {
      return NextResponse.json(
        { ok: false, error: conexoesError.message },
        { status: 500 }
      );
    }

    const conexoesDuplicadas = (conexoesOriginais || [])
      .map((conexao) => {
        const novoOrigemId = mapaIds.get(conexao.no_origem_id);
        const novoDestinoId = mapaIds.get(conexao.no_destino_id);

        if (!novoOrigemId || !novoDestinoId) return null;

        return {
          id: crypto.randomUUID(),
          empresa_id: usuario.empresa_id,
          fluxo_id: novoFluxo.id,
          no_origem_id: novoOrigemId,
          no_destino_id: novoDestinoId,
          condicao_json: conexao.condicao_json || {},
          rotulo: conexao.rotulo,
          ordem: conexao.ordem,
          ativo: true,
        };
      })
      .filter(Boolean);

    if (conexoesDuplicadas.length > 0) {
      const { error: inserirConexoesError } = await supabaseAdmin
        .from("automacao_conexoes")
        .insert(conexoesDuplicadas);

      if (inserirConexoesError) {
        return NextResponse.json(
          { ok: false, error: inserirConexoesError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      fluxo: novoFluxo,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}