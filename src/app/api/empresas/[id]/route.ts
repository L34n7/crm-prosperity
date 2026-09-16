import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import { invalidarCacheNichoEmpresa } from "@/lib/nichos/empresa-nicho";

const supabaseAdmin = getSupabaseAdmin();
const LIMITE_COMERCIAL_MAXIMO = 10;

type EmpresaAtualRow = {
  id: string;
  status: string;
  nicho_id: string | null;
  plano_id: string | null;
  limite_integracoes_whatsapp: number | null;
  limite_usuarios: number | null;
};

type PlanoLimitesRow = {
  id: string;
  limite_integracoes_whatsapp: number | null;
  limite_usuarios: number | null;
};

function lerLimiteComercial(valor: unknown) {
  const limite = Number(valor);

  if (
    !Number.isInteger(limite) ||
    limite < 1 ||
    limite > LIMITE_COMERCIAL_MAXIMO
  ) {
    return null;
  }

  return limite;
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

  if (
    !can(usuario.permissoes, PERMISSAO_INTERNA_EMPRESAS) ||
    !can(usuario.permissoes, "empresas.editar")
  ) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para editar empresa" },
      { status: 403 }
    );
  }

  const body = await request.json();

  const nome_fantasia = body?.nome_fantasia?.trim();
  const razao_social = body?.razao_social?.trim() || null;
  const documento = body?.documento?.trim() || null;
  const email = body?.email?.trim()?.toLowerCase();
  const telefone = body?.telefone?.trim() || null;
  const nome_responsavel = body?.nome_responsavel?.trim() || null;
  const plano_id = body?.plano_id || null;
  const nicho_id = body?.nicho_id || null;
  const timezone = body?.timezone?.trim() || "America/Sao_Paulo";
  const logo_url = body?.logo_url?.trim() || null;
  const observacoes = body?.observacoes?.trim() || null;
  const status = body?.status;
  const informouLimiteWhatsapp = Object.prototype.hasOwnProperty.call(
    body,
    "limite_integracoes_whatsapp"
  );
  const informouLimiteUsuarios = Object.prototype.hasOwnProperty.call(
    body,
    "limite_usuarios"
  );

  if (!nome_fantasia) {
    return NextResponse.json(
      { ok: false, error: "Nome fantasia é obrigatório" },
      { status: 400 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Email é obrigatório" },
      { status: 400 }
    );
  }

  if (!plano_id) {
    return NextResponse.json(
      { ok: false, error: "Plano é obrigatório" },
      { status: 400 }
    );
  }

  if (!["ativa", "inativa", "suspensa", "cancelada"].includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Status inválido" },
      { status: 400 }
    );
  }

  const { data: empresaAtual, error: empresaAtualError } = await supabaseAdmin
    .from("empresas")
    .select(
      `
        id,
        status,
        nicho_id,
        plano_id,
        limite_integracoes_whatsapp,
        limite_usuarios
      `
    )
    .eq("id", id)
    .maybeSingle<EmpresaAtualRow>();

  if (empresaAtualError) {
    return NextResponse.json(
      { ok: false, error: empresaAtualError.message },
      { status: 500 }
    );
  }

  if (!empresaAtual) {
    return NextResponse.json(
      { ok: false, error: "Empresa não encontrada" },
      { status: 404 }
    );
  }

  if (
    empresaAtual.status !== status &&
    !can(usuario.permissoes, "empresas.alterar_status")
  ) {
    return NextResponse.json(
      { ok: false, error: "Sem permissao para alterar status da empresa" },
      { status: 403 }
    );
  }

  const { data: plano, error: planoError } = await supabaseAdmin
    .from("planos")
    .select("id, limite_integracoes_whatsapp, limite_usuarios")
    .eq("id", plano_id)
    .maybeSingle<PlanoLimitesRow>();

  if (planoError) {
    return NextResponse.json(
      { ok: false, error: planoError.message },
      { status: 500 }
    );
  }

  if (!plano) {
    return NextResponse.json(
      { ok: false, error: "Plano não encontrado" },
      { status: 404 }
    );
  }

  const limiteWhatsappPlano = Math.max(
    1,
    Number(plano.limite_integracoes_whatsapp) || 1
  );
  const limiteUsuariosPlano = Math.max(1, Number(plano.limite_usuarios) || 2);

  let limiteIntegracoesWhatsapp = empresaAtual.limite_integracoes_whatsapp;
  let limiteUsuarios = empresaAtual.limite_usuarios;

  if (informouLimiteWhatsapp) {
    const limiteSolicitado = lerLimiteComercial(
      body.limite_integracoes_whatsapp
    );

    if (limiteSolicitado === null) {
      return NextResponse.json(
        {
          ok: false,
          error: `O limite de números WhatsApp deve ser um inteiro entre 1 e ${LIMITE_COMERCIAL_MAXIMO}.`,
        },
        { status: 400 }
      );
    }

    if (limiteSolicitado < limiteWhatsappPlano) {
      return NextResponse.json(
        {
          ok: false,
          error: `O plano selecionado já inclui ${limiteWhatsappPlano} número(s) WhatsApp. O limite não pode ser menor que o plano.`,
        },
        { status: 400 }
      );
    }

    limiteIntegracoesWhatsapp =
      limiteSolicitado === limiteWhatsappPlano ? null : limiteSolicitado;
  } else if (
    limiteIntegracoesWhatsapp !== null &&
    limiteIntegracoesWhatsapp <= limiteWhatsappPlano
  ) {
    limiteIntegracoesWhatsapp = null;
  }

  if (informouLimiteUsuarios) {
    const limiteSolicitado = lerLimiteComercial(body.limite_usuarios);

    if (limiteSolicitado === null) {
      return NextResponse.json(
        {
          ok: false,
          error: `O limite de usuários deve ser um inteiro entre 1 e ${LIMITE_COMERCIAL_MAXIMO}.`,
        },
        { status: 400 }
      );
    }

    if (limiteSolicitado < limiteUsuariosPlano) {
      return NextResponse.json(
        {
          ok: false,
          error: `O plano selecionado já inclui ${limiteUsuariosPlano} usuário(s). O limite não pode ser menor que o plano.`,
        },
        { status: 400 }
      );
    }

    limiteUsuarios =
      limiteSolicitado === limiteUsuariosPlano ? null : limiteSolicitado;
  } else if (
    limiteUsuarios !== null &&
    limiteUsuarios <= limiteUsuariosPlano
  ) {
    limiteUsuarios = null;
  }

  if (informouLimiteWhatsapp || informouLimiteUsuarios) {
    const [integracoesResult, usuariosResult] = await Promise.all([
      informouLimiteWhatsapp
        ? supabaseAdmin
            .from("integracoes_whatsapp")
            .select("id", { count: "exact", head: true })
            .eq("empresa_id", id)
            .eq("provider", "meta_official")
        : Promise.resolve({ count: null, error: null }),
      informouLimiteUsuarios
        ? supabaseAdmin
            .from("usuarios")
            .select("id", { count: "exact", head: true })
            .eq("empresa_id", id)
            .eq("status", "ativo")
        : Promise.resolve({ count: null, error: null }),
    ]);

    if (integracoesResult.error) {
      return NextResponse.json(
        { ok: false, error: integracoesResult.error.message },
        { status: 500 }
      );
    }

    if (usuariosResult.error) {
      return NextResponse.json(
        { ok: false, error: usuariosResult.error.message },
        { status: 500 }
      );
    }

    if (
      informouLimiteWhatsapp &&
      Number(body.limite_integracoes_whatsapp) < (integracoesResult.count ?? 0)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: `A empresa já possui ${integracoesResult.count ?? 0} conexão(ões) WhatsApp. Remova conexões antes de reduzir o limite.`,
        },
        { status: 409 }
      );
    }

    if (
      informouLimiteUsuarios &&
      Number(body.limite_usuarios) < (usuariosResult.count ?? 0)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: `A empresa já possui ${usuariosResult.count ?? 0} usuário(s) ativo(s). Desative usuários antes de reduzir o limite.`,
        },
        { status: 409 }
      );
    }
  }

  const nichoIdFinal = nicho_id || empresaAtual.nicho_id;
  const { data: nicho } = await supabaseAdmin
    .from("nichos")
    .select("id, grupo")
    .eq("id", nichoIdFinal)
    .eq("ativo", true)
    .maybeSingle();

  if (!nicho) {
    return NextResponse.json(
      { ok: false, error: "Nicho não encontrado" },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("empresas")
    .update({
      nome_fantasia,
      razao_social,
      documento,
      email,
      telefone,
      nome_responsavel,
      plano_id,
      nicho_id: nichoIdFinal,
      timezone,
      logo_url,
      observacoes,
      status,
      limite_integracoes_whatsapp: limiteIntegracoesWhatsapp,
      limite_usuarios: limiteUsuarios,
    })
    .eq("id", id)
    .select(`
      id,
      nome_fantasia,
      razao_social,
      documento,
      email,
      telefone,
      nome_responsavel,
      status,
      timezone,
      logo_url,
      observacoes,
      created_at,
      updated_at,
      plano_id,
      limite_integracoes_whatsapp,
      limite_usuarios,
      nicho_id,
      nichos (
        id,
        codigo,
        nome
      )
    `)
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  invalidarCacheNichoEmpresa(id);

  return NextResponse.json({
    ok: true,
    message: "Empresa atualizada com sucesso",
    empresa: data,
  });
}
