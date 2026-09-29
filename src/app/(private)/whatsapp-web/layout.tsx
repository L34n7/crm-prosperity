import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { empresaPodeAcessarWhatsappWebLocal } from "@/lib/whatsapp-web/acesso";

export default async function WhatsappWebLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    redirect(resultado.status === 401 ? "/login" : "/painel");
  }

  const permitido = await empresaPodeAcessarWhatsappWebLocal(
    resultado.usuario.empresa_id
  );

  if (!permitido) {
    redirect("/painel");
  }

  return children;
}
