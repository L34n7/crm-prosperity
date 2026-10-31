import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  normalizarTelefoneMetaLimite,
  obterResumoLimiteMeta,
} from "@/lib/whatsapp/meta-limites";

const supabaseAdmin = getSupabaseAdmin();

export async function GET(req: NextRequest) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuario sem empresa vinculada." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const integracaoId = searchParams.get("integracao_id");
  const telefoneNormalizado = normalizarTelefoneMetaLimite(
    searchParams.get("telefone")
  );

  if (!integracaoId) {
    return NextResponse.json(
      { ok: false, error: "integracao_id e obrigatorio." },
      { status: 400 }
    );
  }

  const { data: integracao, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select(
      `
        id,
        empresa_id,
        nome_conexao,
        numero,
        status,
        phone_number_id,
        phone_number_status,
        quality_rating,
        meta_messaging_limit,
        meta_messaging_limit_tier,
        meta_account_mode,
        meta_saude_ultima_verificacao_em,
        config_json
      `
    )
    .eq("id", integracaoId)
    .eq("empresa_id", usuario.empresa_id)
    .eq("provider", "meta_official")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!integracao) {
    return NextResponse.json(
      { ok: false, error: "Integracao WhatsApp nao encontrada." },
      { status: 404 }
    );
  }

  const limiteMeta = await obterResumoLimiteMeta({
    empresaId: usuario.empresa_id,
    integracao,
  });

  // A janela de capacidade e movel (24h): esta e apenas a proxima
  // liberacao de vaga, nunca uma renovacao integral do limite.
  const { data: janelasAtivas, error: liberacoesError } = await supabaseAdmin
    .from("whatsapp_meta_conversas_iniciadas")
    .select("telefone_normalizado, janela_expira_em")
    .eq("empresa_id", usuario.empresa_id)
    .eq("integracao_whatsapp_id", integracao.id)
    .gt("janela_expira_em", new Date().toISOString())
    .in("status", ["reservado", "processando", "enviado"]);

  if (liberacoesError) {
    return NextResponse.json(
      { ok: false, error: liberacoesError.message },
      { status: 500 }
    );
  }

  const expiracaoPorTelefone = new Map<string, number>();
  for (const item of janelasAtivas || []) {
    const telefone = normalizarTelefoneMetaLimite(item.telefone_normalizado);
    const expiraEm = new Date(item.janela_expira_em).getTime();
    if (!telefone || !Number.isFinite(expiraEm)) continue;
    expiracaoPorTelefone.set(
      telefone,
      Math.max(expiracaoPorTelefone.get(telefone) || 0, expiraEm)
    );
  }
  const proximaLiberacaoMs = Array.from(expiracaoPorTelefone.values())
    .reduce((menor, timestamp) => Math.min(menor, timestamp), Infinity);
  const proximaLiberacaoEm = Number.isFinite(proximaLiberacaoMs)
    ? new Date(Math.ceil(proximaLiberacaoMs / 60000) * 60000).toISOString()
    : null;
  // Cronograma independente da lista de contatos, disponivel antes de qualquer
  // selecao. Agrupa liberacoes por minuto e nao implica renovacao integral.
  const liberacoesPorMinuto = new Map<number, number>();
  for (const expiracao of expiracaoPorTelefone.values()) {
    const minuto = Math.ceil(expiracao / 60000) * 60000;
    liberacoesPorMinuto.set(minuto, (liberacoesPorMinuto.get(minuto) || 0) + 1);
  }
  let acumulado = Math.max(0, limiteMeta.restantes);
  const liberacoesPrevistas = Array.from(liberacoesPorMinuto.entries())
    .sort(([primeira], [segunda]) => primeira - segunda)
    .map(([minuto, quantidadeLiberada]) => {
      acumulado = Math.min(limiteMeta.limite, acumulado + quantidadeLiberada);
      return {
        horario: new Date(minuto).toISOString(),
        quantidadeLiberada,
        disponivelAcumulado: acumulado,
      };
    });
  const quantidadeProximaLiberacao = liberacoesPrevistas[0]?.quantidadeLiberada || 0;

  let telefoneMetaLimite = null;

  if (telefoneNormalizado.length >= 10) {
    const { data: conversasIniciadas, error: telefoneError } =
      await supabaseAdmin
      .from("whatsapp_meta_conversas_iniciadas")
      .select("id, status, janela_expira_em")
      .eq("empresa_id", usuario.empresa_id)
      .eq("integracao_whatsapp_id", integracao.id)
      .eq("telefone_normalizado", telefoneNormalizado)
      .gt("janela_expira_em", new Date().toISOString())
      .in("status", ["reservado", "processando", "enviado"])
      .limit(1);

    if (telefoneError) {
      return NextResponse.json(
        { ok: false, error: telefoneError.message },
        { status: 500 }
      );
    }

    const conversaIniciada = Array.isArray(conversasIniciadas)
      ? conversasIniciadas[0]
      : null;
    const jaContabilizado = Boolean(conversaIniciada);
    const impacto = jaContabilizado ? 0 : 1;
    const restanteAposEnvio = limiteMeta.restantes - impacto;

    telefoneMetaLimite = {
      telefone_normalizado: telefoneNormalizado,
      ja_contabilizado: jaContabilizado,
      impacto,
      restantes_apos_envio: Math.max(restanteAposEnvio, 0),
      excede_limite: restanteAposEnvio < 0,
      janela_expira_em: conversaIniciada?.janela_expira_em || null,
    };
  }

  return NextResponse.json(
    {
      ok: true,
      limite_meta: {
        ...limiteMeta,
        proxima_liberacao_em: proximaLiberacaoEm,
        quantidade_proxima_liberacao: quantidadeProximaLiberacao,
        liberacoes_previstas: liberacoesPrevistas,
      },
      telefone_meta_limite: telefoneMetaLimite,
      integracao: {
        id: integracao.id,
        nome_conexao: integracao.nome_conexao,
        numero: integracao.numero,
        status: integracao.status,
        phone_number_status: integracao.phone_number_status,
        quality_rating: integracao.quality_rating,
        meta_messaging_limit_tier: integracao.meta_messaging_limit_tier,
        meta_messaging_limit: integracao.meta_messaging_limit,
        meta_account_mode: integracao.meta_account_mode,
        meta_saude_ultima_verificacao_em:
          integracao.meta_saude_ultima_verificacao_em,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
