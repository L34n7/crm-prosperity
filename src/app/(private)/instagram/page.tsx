import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { podeAcessarInstagram } from "@/lib/instagram/config";
import InstagramClient from "./InstagramClient";

export default async function InstagramPage() {
  const auth = await getUsuarioContexto();
  if (!auth.ok) redirect("/login");
  if (!podeAcessarInstagram(auth.usuario.empresa_id)) redirect("/painel");
  return <InstagramClient podeGerenciar={isAdministrador(auth.usuario)} />;
}
