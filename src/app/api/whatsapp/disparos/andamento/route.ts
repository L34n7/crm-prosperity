import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

const STATUS_ATIVOS = ["pendente", "enviando"];
const STATUS_TERMINAIS_RECENTES = [
  "concluida",
  "pausada_por_falhas",
  "pausada_por_lista_invalida",
  "pausada_por_erro_meta",
  "pausada_por_conta_bloqueada",
  "cancelada",
  "erro",
];

type CampanhaDisparo = {
  id: string;
  status: string | null;
  template_nome: string | null;
  total_itens: number | null;
  total_pendentes: number | null;
  total_processando: number | null;
  total_enviados: number | null;
  total_falhas: number | null;
  total_cancelados: number | null;
  pausa_motivo: string | null;
  erro: string | null;
  created_at: string | null;
  updated_at: string | null;
  started_at: string | null;
  paused_at: string | null;
  finished_at: string | null;
};

function inteiro(valor: unknown) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

function motivoCampanha(campanha: CampanhaDisparo) {
  if (campanha.pausa_motivo || campanha.erro) {
    return campanha.pausa_motivo || campanha.erro;
  }

  switch (campanha.status) {
    case "pausada_por_conta_bloqueada":
      return "A Meta bloqueou ou desativou a conta WhatsApp Business durante o disparo.";
    case "pausada_por_lista_invalida":
      return "A lista apresentou muitos numeros invalidos ou indisponiveis.";
    case "pausada_por_erro_meta":
      return "A Meta retornou erros que exigem pausa operacional.";
    case "pausada_por_falhas":
      return "Muitas mensagens falharam no lote processado.";
    case "cancelada":
      return "O disparo foi cancelado antes de concluir todos os envios.";
    case "erro":
      return "O disparo foi interrompido por erro operacional.";
    default:
      return null;
  }
}

function mapearCampanha(campanha: CampanhaDisparo) {
  const total = inteiro(campanha.total_itens);
  const enviados = inteiro(campanha.total_enviados);
  const falhas = inteiro(campanha.total_falhas);
  const cancelados = inteiro(campanha.total_cancelados);
  const pendentes = inteiro(campanha.total_pendentes);
  const processando = inteiro(campanha.total_processando);
  const processados = Math.min(total, enviados + falhas + cancelados);

  return {
    id: campanha.id,
    status: campanha.status,
    template_nome: campanha.template_nome,
    total,
    enviados,
    falhas,
    cancelados,
    pendentes,
    processando,
    processados,
    motivo: motivoCampanha(campanha),
    created_at: campanha.created_at,
    updated_at: campanha.updated_at,
    started_at: campanha.started_at,
    paused_at: campanha.paused_at,
    finished_at: campanha.finished_at,
  };
}

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
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const campos = `
      id,
      status,
      template_nome,
      total_itens,
      total_pendentes,
      total_processando,
      total_enviados,
      total_falhas,
      total_cancelados,
      pausa_motivo,
      erro,
      created_at,
      updated_at,
      started_at,
      paused_at,
      finished_at
    `;

    const { data: campanhaAtiva, error: campanhaAtivaError } =
      await supabaseAdmin
        .from("whatsapp_disparo_campanhas")
        .select(campos)
        .eq("empresa_id", usuario.empresa_id)
        .eq("usuario_id", usuario.id)
        .in("status", STATUS_ATIVOS)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (campanhaAtivaError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao buscar disparo em andamento: ${campanhaAtivaError.message}`,
        },
        { status: 500 }
      );
    }

    if (campanhaAtiva) {
      return NextResponse.json({
        ok: true,
        usuario_id: usuario.id,
        empresa_id: usuario.empresa_id,
        bloquear_disparos: true,
        campanha: mapearCampanha(campanhaAtiva as CampanhaDisparo),
      });
    }

    const atualizadoDepoisDe = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: campanhaRecente, error: campanhaRecenteError } =
      await supabaseAdmin
        .from("whatsapp_disparo_campanhas")
        .select(campos)
        .eq("empresa_id", usuario.empresa_id)
        .eq("usuario_id", usuario.id)
        .in("status", STATUS_TERMINAIS_RECENTES)
        .gte("updated_at", atualizadoDepoisDe)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (campanhaRecenteError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao buscar disparo recente: ${campanhaRecenteError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      usuario_id: usuario.id,
      empresa_id: usuario.empresa_id,
      bloquear_disparos: false,
      campanha: campanhaRecente
        ? mapearCampanha(campanhaRecente as CampanhaDisparo)
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao buscar disparo em andamento.",
      },
      { status: 500 }
    );
  }
}
