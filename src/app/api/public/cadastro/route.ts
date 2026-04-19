import { NextResponse } from "next/server";
import { criarEmpresaSelfService } from "@/lib/usuarios/criar-empresa-self-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const resultado = await criarEmpresaSelfService({
      auth_user_id: String(body?.auth_user_id ?? ""),
      nome_fantasia: String(body?.nome_fantasia ?? ""),
      razao_social: String(body?.razao_social ?? ""),
      documento: String(body?.documento ?? ""),
      email_empresa: String(body?.email_empresa ?? ""),
      telefone_empresa: String(body?.telefone_empresa ?? ""),
      nome_responsavel: String(body?.nome_responsavel ?? ""),
      nome_usuario: String(body?.nome_usuario ?? ""),
      email_usuario: String(body?.email_usuario ?? ""),
      plano_slug: String(body?.plano_slug ?? "basico"),
    });

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    console.error("Erro na API de cadastro:", error);

    const mensagem =
      error instanceof Error ? error.message : "Erro interno ao criar cadastro.";

    return NextResponse.json({ error: mensagem }, { status: 400 });
  }
}