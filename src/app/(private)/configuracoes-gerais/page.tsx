import { redirect } from "next/navigation";
import ConfiguracoesClient from "./configuracoes-client";
import IntegracaoEntradaImoveisSection from "./IntegracaoEntradaImoveisSection";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";

export default async function ConfiguracoesPage() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    redirect("/login");
  }

  if (!isAdministrador(resultado.usuario) || !resultado.usuario.empresa_id) {
    redirect("/painel");
  }

  const nicho = await buscarNichoEmpresa(resultado.usuario.empresa_id);
  const imobiliaria = nicho.codigo === "imobiliaria";

  return (
    <>
      <ConfiguracoesClient />
      {imobiliaria ? <IntegracaoEntradaImoveisSection /> : null}
    </>
  );
}
