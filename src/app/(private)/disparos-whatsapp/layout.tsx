import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

export default async function DisparosWhatsappLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const resultado = await getUsuarioContexto();

  if (resultado.ok && resultado.usuario.assinatura?.status === "bloqueada") {
    redirect("/conversas");
  }

  return children;
}
