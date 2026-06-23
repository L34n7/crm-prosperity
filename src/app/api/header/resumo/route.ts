import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  podeAtribuirConversas,
  podeVisualizarConversas,
} from "@/lib/auth/authorization";
import { contarConversasNaoLidas } from "@/lib/conversas/nao-lidas";
import { buscarSaldoTokensIa } from "@/lib/ia/tokens";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const RESUMO_HEADERS = {
  "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
};

type ResumoBloco<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
      reason?: "sem_permissao" | "sem_empresa" | "erro";
    };

function blocoOk<T>(data: T): ResumoBloco<T> {
  return { ok: true, data };
}

function blocoErro<T>(
  error: string,
  reason: "sem_permissao" | "sem_empresa" | "erro" = "erro"
): ResumoBloco<T> {
  return { ok: false, error, reason };
}

function getMensagemErro(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function buscarResumoNotificacoes(empresaId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from("notificacoes")
      .select("id,titulo,mensagem,lida,conversa_id,created_at,metadata_json")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return blocoErro(error.message);
    }

    const notificacoes = data || [];
    const naoLidas = notificacoes.filter((notificacao) => !notificacao.lida)
      .length;

    return blocoOk({
      notificacoes,
      nao_lidas: naoLidas,
    });
  } catch (error) {
    return blocoErro(
      getMensagemErro(error, "Erro ao buscar notificacoes do header.")
    );
  }
}

async function buscarResumoConversasNaoLidas(params: {
  empresaId: string;
  usuarioId: string;
  isAdmin: boolean;
  setoresIds: string[];
  usuarioPodeAtribuir: boolean;
}) {
  try {
    const quantidade = await contarConversasNaoLidas(params);

    return blocoOk({
      quantidade,
    });
  } catch (error) {
    return blocoErro(
      getMensagemErro(error, "Erro ao contar conversas nao lidas.")
    );
  }
}

async function buscarResumoDisparosPendentes(empresaId: string) {
  try {
    const { count, error } = await supabaseAdmin
      .from("automacao_agendamentos")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .eq("tipo_agendamento", "disparo_template")
      .eq("status", "pendente");

    if (error) {
      return blocoErro(error.message);
    }

    return blocoOk({
      quantidade: count || 0,
    });
  } catch (error) {
    return blocoErro(
      getMensagemErro(error, "Erro ao contar disparos pendentes.")
    );
  }
}

async function buscarResumoTokensIa(empresaId: string) {
  try {
    const saldo = await buscarSaldoTokensIa(empresaId);

    return blocoOk({
      saldo,
    });
  } catch (error) {
    return blocoErro(
      getMensagemErro(error, "Erro ao buscar saldo de tokens de IA.")
    );
  }
}

export async function GET() {
  const resultado = await getUsuarioContexto({ sincronizarAssinatura: false });

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

  const podeVerConversas = await podeVisualizarConversas(usuario);
  const usuarioPodeAtribuir = podeVerConversas
    ? await podeAtribuirConversas(usuario)
    : false;
  const podeVerTokensIa = usuario.permissoes.includes(
    "ia.tokens.exibir_header"
  );

  const [
    notificacoes,
    conversasNaoLidas,
    disparosPendentes,
    tokensIa,
  ] = await Promise.all([
    buscarResumoNotificacoes(usuario.empresa_id),
    podeVerConversas
      ? buscarResumoConversasNaoLidas({
          empresaId: usuario.empresa_id,
          usuarioId: usuario.id,
          isAdmin: usuario.is_admin,
          setoresIds: usuario.setores_ids ?? [],
          usuarioPodeAtribuir,
        })
      : Promise.resolve(
          blocoErro("Sem permissao para visualizar conversas.", "sem_permissao")
        ),
    buscarResumoDisparosPendentes(usuario.empresa_id),
    podeVerTokensIa
      ? buscarResumoTokensIa(usuario.empresa_id)
      : Promise.resolve(
          blocoErro("Sem permissao para visualizar tokens de IA.", "sem_permissao")
        ),
  ]);

  return NextResponse.json(
    {
      ok: true,
      contexto: {
        usuario_id: usuario.id,
        empresa_id: usuario.empresa_id,
      },
      notificacoes,
      conversas_nao_lidas: conversasNaoLidas,
      disparos_pendentes: disparosPendentes,
      tokens_ia: tokensIa,
    },
    { headers: RESUMO_HEADERS }
  );
}
