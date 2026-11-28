import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { podeAcessarInstagram, buscarIntegracaoInstagram, tokenInstagramAtivo, INSTAGRAM_GRAPH_VERSION, INSTAGRAM_GRAPH_URL } from "@/lib/instagram/config";
import { isAdministrador } from "@/lib/auth/authorization";

export async function GET() {
  const auth = await getUsuarioContexto();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!podeAcessarInstagram(auth.usuario.empresa_id)) {
    return NextResponse.json({ ok: false, error: "Módulo indisponível para esta empresa." }, { status: 403 });
  }
  const { data, error } = await getSupabaseAdmin().from("integracoes_instagram")
    .select("id,nome_conexao,instagram_user_id,username,foto_perfil_url,status,token_expires_at,webhook_verificado,ultimo_webhook_em,ultimo_erro,created_at")
    .eq("empresa_id", auth.usuario.empresa_id!).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: "Não foi possível listar conexões Instagram." }, { status: 500 });
  return NextResponse.json({ ok: true, integracoes: data || [] });
}

export async function DELETE(request: Request) {
  const auth = await getUsuarioContexto();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!podeAcessarInstagram(auth.usuario.empresa_id) || !isAdministrador(auth.usuario)) {
    return NextResponse.json({ ok: false, error: "Sem permissão para desconectar Instagram." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (body.confirmar !== true || typeof body.id !== "string") {
    return NextResponse.json({ ok: false, error: "Confirme qual conta deseja desconectar." }, { status: 400 });
  }
  const integracao = await buscarIntegracaoInstagram(body.id, auth.usuario.empresa_id!);
  if (!integracao) return NextResponse.json({ ok: false, error: "Integração não encontrada." }, { status: 404 });
  let aviso: string | null = null;
  if (integracao.status === "ativa") {
    try {
      const token = await tokenInstagramAtivo(integracao);
      const url = `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(integracao.instagram_user_id)}/subscribed_apps`;
      const response = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Meta não confirmou o cancelamento do webhook.");
    } catch {
      aviso = "A assinatura não pôde ser cancelada na Meta. O CRM deixará de processar eventos desta conta.";
    }
  }
  // Mantém o vínculo de conversas, contatos e histórico; inutiliza o token local.
  const { error } = await getSupabaseAdmin().from("integracoes_instagram")
    .update({
      status: "desconectada",
      access_token_encrypted: "revoked",
      token_expires_at: null,
      webhook_verificado: false,
      ultimo_erro: aviso,
      updated_at: new Date().toISOString()
    })
    .eq("id", integracao.id).eq("empresa_id", auth.usuario.empresa_id!);
  if (error) return NextResponse.json({ ok: false, error: "Erro ao desconectar integração." }, { status: 500 });
  return NextResponse.json({ ok: true, aviso });

}
