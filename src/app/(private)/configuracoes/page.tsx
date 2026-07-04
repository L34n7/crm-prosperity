import { redirect } from "next/navigation";
import ConfiguracoesClient from "./configuracoes-client";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";

export default async function ConfiguracoesPage() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    redirect("/login");
  }

  if (!isAdministrador(resultado.usuario) || !resultado.usuario.empresa_id) {
    redirect("/painel");
  }

  return <ConfiguracoesClient />;
}
