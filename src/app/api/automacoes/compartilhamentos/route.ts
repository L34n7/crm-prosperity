import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import {
  criarCopiaFluxoCompartilhado,
  formatarCodigoCompartilhamento,
  gerarCodigoCompartilhamentoFluxo,
  montarSnapshotCompartilhamentoFluxo,
  normalizarCodigoCompartilhamento,
  type SnapshotCompartilhamentoFluxo,
} from "@/lib/automacoes/compartilhamento-fluxos";

const supabaseAdmin = getSupabaseAdmin();

function obterMensagemErro(error: unknown, fallback = "Erro interno.") {
  return error instanceof Error ? error.message : fallback;
}

async function obterOuCriarCompartilhamentoComCodigo(params: {
  empresaId: string;
  fluxoId: string;
  usuarioId: string;
  snapshot: SnapshotCompartilhamentoFluxo;
}) {
  const { data: compartilhamentoExistente, error: compartilhamentoExistenteError } =
    await supabaseAdmin
      .from("automacao_fluxo_compartilhamentos")
      .select("*")
      .eq("empresa_origem_id", params.empresaId)
      .eq("fluxo_origem_id", params.fluxoId)
      .eq("ativo", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  if (compartilhamentoExistenteError) {
    throw new Error(
      `Erro ao buscar codigo de compartilhamento: ${compartilhamentoExistenteError.message}`
    );
  }

  if (compartilhamentoExistente) {
    const { data, error } = await supabaseAdmin
      .from("automacao_fluxo_compartilhamentos")
      .update({
        nome_fluxo: params.snapshot.fluxo.nome,
        snapshot_json: params.snapshot,
        updated_at: new Date().toISOString(),
      })
      .eq("id", compartilhamentoExistente.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(
        `Erro ao atualizar compartilhamento: ${error?.message}`
      );
    }

    return {
      compartilhamento: data,
      criado: false,
    };
  }

  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const codigo = gerarCodigoCompartilhamentoFluxo();

    const { data, error } = await supabaseAdmin
      .from("automacao_fluxo_compartilhamentos")
      .insert({
        codigo,
        empresa_origem_id: params.empresaId,
        fluxo_origem_id: params.fluxoId,
        nome_fluxo: params.snapshot.fluxo.nome,
        snapshot_json: params.snapshot,
        criado_por: params.usuarioId,
      })
      .select("*")
      .single();

    if (!error && data) {
      return {
        compartilhamento: data,
        criado: true,
      };
    }

    if (!error?.message?.toLowerCase().includes("duplicate")) {
      throw new Error(
        `Erro ao gerar codigo de compartilhamento: ${error?.message}`
      );
    }
  }

  throw new Error("Nao foi possivel gerar um codigo unico para o fluxo.");
}

export async function POST(req: NextRequest) {
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
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const fluxoId = String(body?.fluxo_id || "").trim();

    if (!fluxoId) {
      return NextResponse.json(
        { ok: false, error: "ID do fluxo e obrigatorio." },
        { status: 400 }
      );
    }

    const snapshot = await montarSnapshotCompartilhamentoFluxo({
      supabase: supabaseAdmin,
      empresaId: usuario.empresa_id,
      fluxoId,
    });

    const { compartilhamento, criado } =
      await obterOuCriarCompartilhamentoComCodigo({
        empresaId: usuario.empresa_id,
        fluxoId,
        usuarioId: usuario.id,
        snapshot,
      });

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: fluxoId,
      acao: criado
        ? "fluxo_codigo_compartilhamento_gerado"
        : "fluxo_codigo_compartilhamento_atualizado",
      descricao: criado
        ? `Codigo de compartilhamento gerado para ${snapshot.fluxo.nome}`
        : `Codigo de compartilhamento atualizado para ${snapshot.fluxo.nome}`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      depois: {
        codigo: compartilhamento.codigo,
        nos: snapshot.nos.length,
        conexoes: snapshot.conexoes.length,
        gatilhos: snapshot.gatilhos.length,
        criado,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      codigo: formatarCodigoCompartilhamento(compartilhamento.codigo),
      compartilhamento: {
        id: compartilhamento.id,
        codigo: formatarCodigoCompartilhamento(compartilhamento.codigo),
        nome_fluxo: compartilhamento.nome_fluxo,
        created_at: compartilhamento.created_at,
        updated_at: compartilhamento.updated_at,
        criado,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
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
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const codigo = normalizarCodigoCompartilhamento(body?.codigo);

    if (!codigo) {
      return NextResponse.json(
        { ok: false, error: "Informe o codigo do fluxo." },
        { status: 400 }
      );
    }

    const { data: compartilhamento, error: compartilhamentoError } =
      await supabaseAdmin
        .from("automacao_fluxo_compartilhamentos")
        .select("*")
        .eq("codigo", codigo)
        .eq("ativo", true)
        .maybeSingle();

    if (compartilhamentoError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao buscar codigo: ${compartilhamentoError.message}`,
        },
        { status: 500 }
      );
    }

    if (!compartilhamento) {
      return NextResponse.json(
        { ok: false, error: "Codigo de fluxo nao encontrado ou inativo." },
        { status: 404 }
      );
    }

    const snapshot =
      compartilhamento.snapshot_json as SnapshotCompartilhamentoFluxo;

    const copia = await criarCopiaFluxoCompartilhado({
      supabase: supabaseAdmin,
      snapshot,
      empresaDestinoId: usuario.empresa_id,
      usuarioId: usuario.id,
    });

    await supabaseAdmin
      .from("automacao_fluxo_compartilhamentos")
      .update({
        total_importacoes: Number(compartilhamento.total_importacoes || 0) + 1,
        ultimo_importado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", compartilhamento.id);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: copia.fluxo.id,
      acao: "fluxo_importado_por_codigo",
      descricao: `Fluxo ${snapshot.fluxo.nome} importado por codigo`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: {
        codigo: formatarCodigoCompartilhamento(compartilhamento.codigo),
        empresa_origem_id: compartilhamento.empresa_origem_id,
        fluxo_origem_id: compartilhamento.fluxo_origem_id,
      },
      depois: {
        fluxo_id: copia.fluxo.id,
        nome: copia.fluxo.nome,
        ...copia.totais,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      fluxo: copia.fluxo,
      totais: copia.totais,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}
