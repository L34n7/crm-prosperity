
import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarWhiteLabelAdminPorUsuario } from "@/lib/white-label/acesso";

export default async function WhiteLabelClientesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true });

  if (!contexto.ok) {
    redirect("/login");
  }

  const admin =
    contexto.usuario.white_label_admin ||
    (await buscarWhiteLabelAdminPorUsuario(contexto.usuario));

  if (!admin) {
    redirect("/painel");
  }

  return children;
}
