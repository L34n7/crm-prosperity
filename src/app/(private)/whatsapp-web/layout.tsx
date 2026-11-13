import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { empresaPodeAcessarWhatsappWebLocal } from "@/lib/whatsapp-web/acesso";
import { PERMISSAO_WHATSAPP_WEB_LOCAL } from "@/lib/permissoes/internas";

export default async function WhatsappWebLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    redirect(resultado.status === 401 ? "/login" : "/painel");
  }

  // Acesso restrito: a permissão comum de Disparos não habilita o agente local.
  const permitido =
    resultado.usuario.permissoes.includes(PERMISSAO_WHATSAPP_WEB_LOCAL) &&
    await empresaPodeAcessarWhatsappWebLocal(resultado.usuario.empresa_id);

  if (!permitido) {
    redirect("/painel");
  }

  return children;
}
