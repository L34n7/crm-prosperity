import { NextRequest, NextResponse } from "next/server";
import { autenticarProsperityApi } from "@/lib/integracoes/prosperity-external-api";
import { CRM_PROSPERITY_SISTEMA_MAPEADO } from "@/lib/integracoes/sistemas-mapeados";

export async function GET(request: NextRequest) {
  const auth = await autenticarProsperityApi(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    ok: true,
    servico: "CRM Prosperity External API",
    versao: "v1",
    autenticado: true,
    conexao: auth.apiKey.nome,
    sistema: CRM_PROSPERITY_SISTEMA_MAPEADO.chave,
    versao_mapeamento: CRM_PROSPERITY_SISTEMA_MAPEADO.versao_mapeamento,
    schema_endpoint: "/schema",
    recursos: CRM_PROSPERITY_SISTEMA_MAPEADO.recursos.map((recurso) => ({
      chave: recurso.chave,
      nome: recurso.nome,
      endpoint: recurso.endpoint,
      descricao: recurso.descricao,
      eventos: recurso.eventos.map((evento) => ({
        chave: evento.chave,
        nome: evento.nome,
      })),
    })),
    filtros_comuns: {
      pagina: "Página iniciando em 1.",
      limite: "Quantidade por página, de 1 a 100.",
    },
  });
}
