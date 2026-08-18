import { NextRequest, NextResponse } from "next/server";
import { autenticarProsperityApi } from "@/lib/integracoes/prosperity-external-api";

export async function GET(request: NextRequest) {
  const auth = await autenticarProsperityApi(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    ok: true,
    servico: "CRM Prosperity External API",
    versao: "v1",
    autenticado: true,
    conexao: auth.apiKey.nome,
    recursos: [
      {
        chave: "clientes",
        endpoint: "/clientes",
        descricao: "Leads e clientes originados do cadastro/checkout do CRM Prosperity.",
      },
      {
        chave: "pagamentos",
        endpoint: "/pagamentos",
        descricao: "Transações e estados de pagamento recebidos do gateway.",
      },
      {
        chave: "carrinhos_abandonados",
        endpoint: "/carrinhos-abandonados",
        descricao: "Eventos cart.abandoned com checkout e estado atual de pagamento.",
      },
      {
        chave: "assinaturas",
        endpoint: "/assinaturas",
        descricao: "Situação da assinatura das empresas clientes do CRM Prosperity.",
      },
      {
        chave: "onboarding",
        endpoint: "/onboardings",
        descricao: "Situação do onboarding e ativação das integrações WhatsApp dos clientes.",
      },
    ],
    filtros_comuns: {
      pagina: "Página iniciando em 1.",
      limite: "Quantidade por página, de 1 a 100.",
    },
  });
}
