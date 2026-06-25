import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";

const supabaseAdmin = getSupabaseAdmin();

type ContatoEntrada = {
  id?: string | null;
  telefone?: string | null;
};

type CampanhaDisparoRelacao = {
  id?: string | null;
  nome?: string | null;
  template_nome?: string | null;
  total_itens?: number | null;
  created_at?: string | null;
};

type ItemDisparoRecente = {
  id: string;
  contato_id?: string | null;
  telefone_normalizado?: string | null;
  campanha_id?: string | null;
  created_at?: string | null;
  processed_at?: string | null;
  campanha?: CampanhaDisparoRelacao | CampanhaDisparoRelacao[] | null;
};

function limparNumero(valor?: string | null) {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarTelefone(valor?: string | null) {
  const limpo = limparNumero(valor);
  if (!limpo) return "";

  return limparNumero(normalizarTelefoneBrasilParaWhatsApp(limpo) || limpo);
}

function obterRelacaoUnica<T>(relacao: T | T[] | null | undefined): T | null {
  if (Array.isArray(relacao)) {
    return relacao[0] ?? null;
  }

  return relacao ?? null;
}

function formatarDataHoraCampanha(data?: string | null) {
  const date = data ? new Date(data) : new Date();

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(",", "");
}

function nomeCampanhaFallback(campanha: CampanhaDisparoRelacao | null) {
  if (campanha?.nome) return campanha.nome;

  const total = Number(campanha?.total_itens || 0);
  const unidade = total === 1 ? "contato" : "contatos";

  return `Disparo em massa - ${formatarDataHoraCampanha(
    campanha?.created_at
  )} - ${total} ${unidade}`;
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

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const contatos = Array.isArray(body?.contatos)
      ? (body.contatos as ContatoEntrada[])
      : [];
    const janelaDias = Math.min(
      Math.max(Number(body?.janela_dias || 7), 1),
      30
    );

    const contatosNormalizados = contatos
      .map((contato) => ({
        id: String(contato.id || "").trim(),
        telefone_normalizado: normalizarTelefone(contato.telefone),
      }))
      .filter((contato) => contato.id && contato.telefone_normalizado.length >= 10);

    if (contatosNormalizados.length === 0) {
      return NextResponse.json({
        ok: true,
        janela_dias: janelaDias,
        total_contatos_com_conflito: 0,
        grupos: [],
        contatos: {},
      });
    }

    const telefonesSelecionados = Array.from(
      new Set(contatosNormalizados.map((contato) => contato.telefone_normalizado))
    );
    const contatosPorTelefone = contatosNormalizados.reduce(
      (mapa, contato) => {
        const lista = mapa.get(contato.telefone_normalizado) || [];
        lista.push(contato.id);
        mapa.set(contato.telefone_normalizado, lista);
        return mapa;
      },
      new Map<string, string[]>()
    );
    const desde = new Date(
      Date.now() - janelaDias * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabaseAdmin
      .from("whatsapp_disparo_itens")
      .select(
        `
          id,
          contato_id,
          telefone_normalizado,
          campanha_id,
          created_at,
          processed_at,
          campanha:campanha_id (
            id,
            nome,
            template_nome,
            total_itens,
            created_at
          )
        `
      )
      .eq("empresa_id", usuario.empresa_id)
      .eq("status", "enviado")
      .gte("created_at", desde)
      .in("telefone_normalizado", telefonesSelecionados)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao verificar contatos repetidos: ${error.message}`,
        },
        { status: 500 }
      );
    }

    const campanhasMap = new Map<
      string,
      {
        campanha_id: string;
        campanha_nome: string;
        template_nome: string | null;
        ultimo_envio_em: string | null;
        contatos: Set<string>;
      }
    >();
    const contatosMap = new Map<
      string,
      Array<{
        campanha_id: string;
        campanha_nome: string;
        template_nome: string | null;
        enviado_em: string | null;
      }>
    >();
    const contatosComConflito = new Set<string>();
    const vistosPorContatoCampanha = new Set<string>();

    for (const item of (data || []) as ItemDisparoRecente[]) {
      const campanhaId = String(item.campanha_id || "").trim();
      const telefone = String(item.telefone_normalizado || "").trim();

      if (!campanhaId || !telefone) continue;

      const campanha = obterRelacaoUnica(item.campanha);
      const campanhaNome = nomeCampanhaFallback(campanha);
      const enviadoEm = item.processed_at || item.created_at || null;
      const contatoIds = contatosPorTelefone.get(telefone) || [];

      for (const contatoId of contatoIds) {
        const chaveContatoCampanha = `${contatoId}:${campanhaId}`;
        if (vistosPorContatoCampanha.has(chaveContatoCampanha)) continue;

        vistosPorContatoCampanha.add(chaveContatoCampanha);
        contatosComConflito.add(contatoId);

        if (!campanhasMap.has(campanhaId)) {
          campanhasMap.set(campanhaId, {
            campanha_id: campanhaId,
            campanha_nome: campanhaNome,
            template_nome: campanha?.template_nome || null,
            ultimo_envio_em: enviadoEm,
            contatos: new Set<string>(),
          });
        }

        const grupo = campanhasMap.get(campanhaId)!;
        grupo.contatos.add(contatoId);

        if (
          enviadoEm &&
          (!grupo.ultimo_envio_em ||
            new Date(enviadoEm).getTime() >
              new Date(grupo.ultimo_envio_em).getTime())
        ) {
          grupo.ultimo_envio_em = enviadoEm;
        }

        const listaContato = contatosMap.get(contatoId) || [];
        listaContato.push({
          campanha_id: campanhaId,
          campanha_nome: campanhaNome,
          template_nome: campanha?.template_nome || null,
          enviado_em: enviadoEm,
        });
        contatosMap.set(contatoId, listaContato);
      }
    }

    const grupos = Array.from(campanhasMap.values())
      .map((grupo) => ({
        campanha_id: grupo.campanha_id,
        campanha_nome: grupo.campanha_nome,
        template_nome: grupo.template_nome,
        total_contatos: grupo.contatos.size,
        contatos_ids: Array.from(grupo.contatos),
        ultimo_envio_em: grupo.ultimo_envio_em,
      }))
      .sort(
        (a, b) =>
          new Date(b.ultimo_envio_em || 0).getTime() -
          new Date(a.ultimo_envio_em || 0).getTime()
      );

    const contatosPayload = Array.from(contatosMap.entries()).reduce(
      (acc, [contatoId, campanhas]) => {
        acc[contatoId] = campanhas.sort(
          (a, b) =>
            new Date(b.enviado_em || 0).getTime() -
            new Date(a.enviado_em || 0).getTime()
        );
        return acc;
      },
      {} as Record<string, Array<{
        campanha_id: string;
        campanha_nome: string;
        template_nome: string | null;
        enviado_em: string | null;
      }>>
    );

    return NextResponse.json({
      ok: true,
      janela_dias: janelaDias,
      total_contatos_com_conflito: contatosComConflito.size,
      grupos,
      contatos: contatosPayload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao verificar conflitos.",
      },
      { status: 500 }
    );
  }
}
