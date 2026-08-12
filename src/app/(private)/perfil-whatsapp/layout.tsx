import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function PerfilWhatsappLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("whatsapp.perfil.visualizar");
  return children;
}
