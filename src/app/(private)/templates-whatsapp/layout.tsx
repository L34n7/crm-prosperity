import type { ReactNode } from "react";
import { garantirPermissaoPagina } from "@/lib/permissoes/servidor";

export default async function TemplatesWhatsappLayout({ children }: { children: ReactNode }) {
  await garantirPermissaoPagina("whatsapp_templates.visualizar");
  return children;
}
