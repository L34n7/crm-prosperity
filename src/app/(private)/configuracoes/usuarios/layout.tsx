import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function UsuariosLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("usuarios.visualizar");
  return children;
}
