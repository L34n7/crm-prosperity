import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const LIMITE_DELAY_SEGUNDOS = 23 * 60 * 60; // 82800 segundos = 23 horas

function normalizarDelaySegundosApi(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return null;
  }

  return Math.max(0, Math.min(LIMITE_DELAY_SEGUNDOS, Math.floor(numero)));
}

const supabaseAdmin = getSupabaseAdmin();

type ResumoConexaoAuditoria = {
  id: string;
  no_origem_id: string;
  no_destino_id: string;
  rotulo: string | null;
  ordem: number;
  condicao_json: unknown;
  usar_ia: boolean;
  descricao_ia: string | null;
};

type AlteracaoConexaoAuditoria = {
  id: string;
  antes: ResumoConexaoAuditoria | null;
  depois: ResumoConexaoAuditoria | null;
};

type ResumoNoAuditoria = {
  id: string;
  tipo_no: string;
  titulo: string | null;
  descricao: string | null;
  configuracao_json: unknown;
  delay_segundos: number | null;
};

type AlteracaoNoAuditoria = {
  id: string;
  antes: ResumoNoAuditoria | null;
  depois: ResumoNoAuditoria | null;
};

function resumirConexaoAuditoria(
  conexao: Record<string, unknown>,
  index?: number
): ResumoConexaoAuditoria {
  return {
    id: String(conexao.id || ""),
    no_origem_id: String(conexao.no_origem_id || ""),
    no_destino_id: String(conexao.no_destino_id || ""),
    rotulo: conexao.rotulo ? String(conexao.rotulo) : null,
    ordem: Number(conexao.ordem || (index != null ? index + 1 : 0)),
    condicao_json: conexao.condicao_json || {},
    usar_ia: conexao.usar_ia === true,
    descricao_ia: conexao.descricao_ia
      ? String(conexao.descricao_ia).trim()
      : null,
  };
}

function listarConexoesAlteradas(
  conexoesAntes: Record<string, unknown>[],
  conexoesDepois: Record<string, unknown>[]
) {
  const antesPorId = new Map(
    conexoesAntes.map((conexao) => [conexao.id, resumirConexaoAuditoria(conexao)])
  );
  const depoisPorId = new Map(
    conexoesDepois.map((conexao, index) => [
      conexao.id,
      resumirConexaoAuditoria(conexao, index),
    ])
  );
  const ids = new Set([...antesPorId.keys(), ...depoisPorId.keys()]);

  return Array.from(ids)
    .map((id) => {
      const antes = antesPorId.get(id) || null;
      const depois = depoisPorId.get(id) || null;

      return JSON.stringify(antes) === JSON.stringify(depois)
        ? null
        : { id, antes, depois };
    })
    .filter(
      (item): item is AlteracaoConexaoAuditoria => item !== null
    );
}

function resumirNoAuditoria(no: Record<string, unknown>): ResumoNoAuditoria {
  return {
    id: String(no.id || ""),
    tipo_no: String(no.tipo_no || ""),
    titulo: no.titulo ? String(no.titulo) : null,
    descricao: no.descricao ? String(no.descricao) : null,
    configuracao_json: no.configuracao_json || {},
    delay_segundos:
      no.tipo_no === "inicio"
        ? null
        : normalizarDelaySegundosApi(no.delay_segundos),
  };
}

function listarNosAlterados(
  nosAntes: Record<string, unknown>[],
  nosDepois: Record<string, unknown>[]
) {
  const antesPorId = new Map(
    nosAntes.map((no) => [no.id, resumirNoAuditoria(no)])
  );
  const depoisPorId = new Map(
    nosDepois.map((no) => [no.id, resumirNoAuditoria(no)])
  );
  const ids = new Set([...antesPorId.keys(), ...depoisPorId.keys()]);

  return Array.from(ids)
    .map((id) => {
      const antes = antesPorId.get(id) || null;
      const depois = depoisPorId.get(id) || null;

      return JSON.stringify(antes) === JSON.stringify(depois)
        ? null
        : { id, antes, depois };
    })
    .filter((item): item is AlteracaoNoAuditoria => item !== null);
}

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
    const auditMeta = getRequestAuditMetadata(req);
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

    const [{ data: nosAntes }, { data: conexoesAntes }] = await Promise.all([
      supabaseAdmin
        .from("automacao_nos")
        .select(
          "id, tipo_no, titulo, descricao, configuracao_json, delay_segundos, ativo"
        )
        .eq("fluxo_id", id)
        .eq("empresa_id", usuario.empresa_id)
        .eq("ativo", true),
      supabaseAdmin
        .from("automacao_conexoes")
        .select(
          "id, no_origem_id, no_destino_id, rotulo, ordem, condicao_json, usar_ia, descricao_ia, ativo"
        )
        .eq("fluxo_id", id)
        .eq("empresa_id", usuario.empresa_id)
        .eq("ativo", true),
    ]);

    const agora = new Date().toISOString();
    const conexoesAlteradas = listarConexoesAlteradas(
      conexoesAntes || [],
      conexoes
    );
    const nosAlterados = listarNosAlterados(nosAntes || [], nos);

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
      const nosParaSalvar = nos.map((no: any) => {
        const tipoNo = String(no.tipo_no || "");

        return {
          id: no.id,
          empresa_id: usuario.empresa_id,
          fluxo_id: id,
          tipo_no: tipoNo,
          titulo: no.titulo || "Bloco",
          descricao: no.descricao || null,
          posicao_x: Math.round(Number(no.posicao_x || 0)),
          posicao_y: Math.round(Number(no.posicao_y || 0)),
          configuracao_json: no.configuracao_json || {},
          delay_segundos:
            tipoNo === "inicio"
              ? null
              : normalizarDelaySegundosApi(no.delay_segundos),
          ativo: true,
          updated_at: agora,
        };
      });

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

        usar_ia: conexao.usar_ia === true,
        descricao_ia: conexao.descricao_ia
          ? String(conexao.descricao_ia).trim()
          : null,

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

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id!,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: id,
      acao: "fluxo_estrutura_salva",
      descricao: "Estrutura do fluxo salva",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: {
        nos: nosAntes?.length || 0,
        conexoes: conexoesAntes?.length || 0,
        nos_alterados: nosAlterados.map((item) => item.antes),
        conexoes_alteradas: conexoesAlteradas.map((item) => item.antes),
      },
      depois: {
        nos: nos.length,
        conexoes: conexoes.length,
        nos_alterados: nosAlterados.map((item) => item.depois),
        conexoes_alteradas: conexoesAlteradas.map((item) => item.depois),
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

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
    const auditMeta = getRequestAuditMetadata(req);

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

    const { data: fluxoAntes } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("*")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

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

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: id,
      acao: "fluxo_arquivado",
      descricao: `Fluxo ${fluxoAntes?.nome || id} arquivado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: fluxoAntes,
      depois: { status: "arquivado" },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

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
