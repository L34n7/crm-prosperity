import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { podeVisualizarDisparos } from "@/lib/whatsapp/disparo-permissoes";
import { listarIntegracoesWhatsappPermitidas } from "@/lib/whatsapp/integracoes-multiplas";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseAdmin = getSupabaseAdmin();

type LinhaRelatorio = {
  numero?: string | null;
  nome_contato?: string | null;
  status_disparo?: string | null;
  situacao?: string | null;
  primeira_resposta?: string | null;
  enviado_em?: string | null;
  resposta_em?: string | null;
  status_mensagem?: string | null;
  erro?: string | null;
};

function formatarDataHora(valor?: string | null) {
  if (!valor) return "";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .format(data)
    .replace(",", "");
}

function statusDisparoLabel(status?: string | null) {
  switch (String(status || "").trim().toLowerCase()) {
    case "enviado":
      return "Enviado";
    case "falha":
      return "Falha";
    case "cancelado":
      return "Cancelado";
    case "processando":
      return "Processando";
    case "pendente":
      return "Pendente";
    default:
      return status || "Pendente";
  }
}

function limparNomeArquivo(valor: string) {
  return String(valor || "campanha")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "campanha";
}

function aplicarLarguras(sheet: XLSX.WorkSheet) {
  sheet["!cols"] = [
    { wch: 19 },
    { wch: 32 },
    { wch: 18 },
    { wch: 18 },
    { wch: 58 },
    { wch: 22 },
    { wch: 22 },
    { wch: 18 },
    { wch: 42 },
  ];
}

export async function GET(req: NextRequest) {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const { usuario } = contexto;
    const empresaId = usuario?.empresa_id;

    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (!podeVisualizarDisparos(usuario)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não tem permissão para visualizar disparos.",
        },
        { status: 403 }
      );
    }

    const campanhaId = req.nextUrl.searchParams.get("campanha_id")?.trim();

    if (!campanhaId) {
      return NextResponse.json(
        { ok: false, error: "Selecione uma campanha para gerar o relatório." },
        { status: 400 }
      );
    }

    const { data: campanha, error: campanhaError } = await supabaseAdmin
      .from("whatsapp_disparo_campanhas")
      .select(
        "id,nome,integracao_whatsapp_id,template_nome,template_categoria,status,total_itens,total_enviados,total_falhas,total_cancelados,created_at,finished_at"
      )
      .eq("id", campanhaId)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (campanhaError) {
      throw new Error(
        `Erro ao buscar a campanha: ${campanhaError.message}`
      );
    }

    if (!campanha) {
      return NextResponse.json(
        { ok: false, error: "Campanha não encontrada." },
        { status: 404 }
      );
    }

    const acessoIntegracoes = await listarIntegracoesWhatsappPermitidas({
      usuario,
      empresaId,
    });

    if (
      !acessoIntegracoes.idsPermitidos.includes(
        String(campanha.integracao_whatsapp_id || "")
      )
    ) {
      return NextResponse.json(
        { ok: false, error: "Sem acesso a esta integração WhatsApp." },
        { status: 403 }
      );
    }

    const { data: linhasData, error: linhasError } = await supabaseAdmin.rpc(
      "relatorio_whatsapp_disparo_campanha",
      {
        p_empresa_id: empresaId,
        p_campanha_id: campanhaId,
      }
    );

    if (linhasError) {
      throw new Error(
        `Erro ao montar o relatório: ${linhasError.message}`
      );
    }

    const linhas = Array.isArray(linhasData)
      ? (linhasData as LinhaRelatorio[])
      : [];

    const totaisSituacao = linhas.reduce(
      (acc, linha) => {
        const situacao = String(linha.situacao || "Sem resposta");
        acc[situacao] = (acc[situacao] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const workbook = XLSX.utils.book_new();

    const resumo = XLSX.utils.aoa_to_sheet([
      ["Relatório de campanha WhatsApp"],
      [],
      ["Campanha", campanha.nome || campanha.id],
      ["Template", campanha.template_nome || "-"],
      ["Categoria", campanha.template_categoria || "-"],
      ["Status da campanha", campanha.status || "-"],
      ["Criada em", formatarDataHora(campanha.created_at)],
      ["Finalizada em", formatarDataHora(campanha.finished_at)],
      [],
      ["Total de contatos", Number(campanha.total_itens || linhas.length || 0)],
      ["Enviados", Number(campanha.total_enviados || 0)],
      ["Falhas", Number(campanha.total_falhas || 0)],
      ["Cancelados", Number(campanha.total_cancelados || 0)],
      ["Respondidos", Number(totaisSituacao.Respondido || 0)],
      ["Lidos sem resposta", Number(totaisSituacao.Lido || 0)],
      ["Sem resposta", Number(totaisSituacao["Sem resposta"] || 0)],
      ["Recusados", Number(totaisSituacao.Recusado || 0)],
    ]);
    resumo["!cols"] = [{ wch: 26 }, { wch: 68 }];
    XLSX.utils.book_append_sheet(workbook, resumo, "Resumo");

    const dadosContatos = [
      [
        "Número",
        "Nome",
        "Status do disparo",
        "Situação",
        "Primeira mensagem da resposta",
        "Data/hora do disparo",
        "Data/hora da primeira resposta",
        "Status da mensagem",
        "Motivo da falha/recusa",
      ],
      ...linhas.map((linha) => [
        linha.numero || "",
        linha.nome_contato || "Sem nome",
        statusDisparoLabel(linha.status_disparo),
        linha.situacao || "Sem resposta",
        linha.primeira_resposta || "",
        formatarDataHora(linha.enviado_em),
        formatarDataHora(linha.resposta_em),
        linha.status_mensagem || "",
        linha.erro || "",
      ]),
    ];

    const contatos = XLSX.utils.aoa_to_sheet(dadosContatos);
    aplicarLarguras(contatos);

    if (linhas.length > 0) {
      contatos["!autofilter"] = {
        ref: `A1:I${linhas.length + 1}`,
      };
    }

    XLSX.utils.book_append_sheet(workbook, contatos, "Contatos");

    const arquivo = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
      compression: true,
    }) as Buffer;

    const baseNome = limparNomeArquivo(
      campanha.nome || campanha.template_nome || "campanha-whatsapp"
    );
    const nomeArquivo = `relatorio-${baseNome}.xlsx`;

    return new NextResponse(new Uint8Array(arquivo), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"; filename*=UTF-8''${encodeURIComponent(
          nomeArquivo
        )}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[RELATORIO DISPARO CAMPANHA] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao gerar relatório.",
      },
      { status: 500 }
    );
  }
}
