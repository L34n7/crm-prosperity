
import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import { contarLicencasUsadas } from "@/lib/white-label/acesso";
import { normalizarDominioWhiteLabel } from "@/lib/white-label/branding";

const supabaseAdmin = getSupabaseAdmin();

async function validarAdministradorMestre() {
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true });
  if (!contexto.ok) return contexto;

  const permitido = await can(
    contexto.usuario.id,
    PERMISSAO_INTERNA_EMPRESAS
  );

  if (!permitido) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Sem permissão para gerenciar White Labels.",
    };
  }

  return contexto;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await validarAdministradorMestre();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const licencas = Number(body?.licencas_contratadas);
  const valorMensalCentavos = Number(body?.valor_mensal_centavos ?? 0);
  const dominio = normalizarDominioWhiteLabel(body?.dominio);
  const nome = String(body?.nome || "").trim();
  const nomeProduto = String(body?.nome_produto || "").trim();
  const logoUrl = String(body?.logo_url || "").trim() || null;
  const faviconUrl = String(body?.favicon_url || "").trim() || null;
  const corPrimaria = String(body?.cor_primaria || "#0f509a").trim();
  const planoPadraoId = String(body?.plano_padrao_id || "").trim();
  const status = body?.status === "inativo" ? "inativo" : "ativo";

  if (
    !id ||
    !nome ||
    !nomeProduto ||
    !dominio ||
    !Number.isInteger(licencas) ||
    licencas < 1
  ) {
    return NextResponse.json(
      { ok: false, error: "Dados do White Label inválidos." },
      { status: 400 }
    );
  }

  if (
    !Number.isInteger(valorMensalCentavos) ||
    valorMensalCentavos < 0 ||
    valorMensalCentavos > 100_000_000
  ) {
    return NextResponse.json(
      { ok: false, error: "Valor mensal do White Label inválido." },
      { status: 400 }
    );
  }

  const dominioValido =
    /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      dominio
    );

  if (
    !dominioValido ||
    dominio === "crmprosperity.com" ||
    dominio.endsWith(".vercel.app")
  ) {
    return NextResponse.json(
      { ok: false, error: "Informe um domínio próprio válido para o White Label." },
      { status: 400 }
    );
  }

  const usadas = await contarLicencasUsadas(id);
  if (licencas < usadas) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "O White Label possui " +
          usadas +
          " licenças em uso. Cancele clientes antes de reduzir este limite.",
      },
      { status: 409 }
    );
  }

  const { data: plano } = await supabaseAdmin
    .from("planos")
    .select("id")
    .eq("id", planoPadraoId)
    .eq("status", "ativo")
    .maybeSingle();

  if (!plano) {
    return NextResponse.json(
      { ok: false, error: "Plano padrão inválido." },
      { status: 400 }
    );
  }

  const { data: conflito } = await supabaseAdmin
    .from("white_labels")
    .select("id")
    .ilike("dominio", dominio)
    .neq("id", id)
    .limit(1);

  if (conflito?.length) {
    return NextResponse.json(
      { ok: false, error: "Este domínio já está vinculado a outro White Label." },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("white_labels")
    .update({
      nome,
      nome_produto: nomeProduto,
      dominio,
      logo_url: logoUrl,
      favicon_url: faviconUrl,
      cor_primaria: corPrimaria,
      licencas_contratadas: licencas,
      valor_mensal_centavos: valorMensalCentavos,
      plano_padrao_id: planoPadraoId,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "White Label atualizado com sucesso.",
  });
}
