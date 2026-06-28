import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { podeVisualizarDisparos } from "@/lib/whatsapp/disparo-permissoes";

export default async function DisparosAgendadosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    redirect("/login");
  }

  if (resultado.usuario.assinatura?.status === "bloqueada") {
    redirect("/conversas");
  }

  if (!podeVisualizarDisparos(resultado.usuario)) {
    redirect("/");
  }

  return children;
}
