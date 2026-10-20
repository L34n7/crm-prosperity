import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import CrmShell from "@/components/CrmShell";
import AmbienteObrigatorioGuard from "@/components/AmbienteObrigatorioGuard";
import MobileEmpresaMenuLink from "@/components/MobileEmpresaMenuLink";
import AgendaMenuLabel from "@/components/AgendaMenuLabel";
import AcessoTemporarioEmpresaBanner from "@/components/AcessoTemporarioEmpresaBanner";
import MetaWhatsAppPricingNotice from "@/components/MetaWhatsAppPricingNotice";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { usuarioConfirmouAvisoMetaWhatsapp } from "@/lib/avisos/meta-whatsapp-cobranca";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import type { NichoCodigo } from "@/lib/nichos/config";
import { empresaPodeAcessarWhatsappWebLocal } from "@/lib/whatsapp-web/acesso";
import { obterBrandingPorHost } from "@/lib/white-label/branding";
import { BRANDING_PROSPERITY } from "@/lib/white-label/types";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("crm-sidebar-collapsed")?.value;
  const initialCollapsed = sidebarCookie === "true";
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host");
  let branding = await obterBrandingPorHost(host);

  let profileName = "Usuario";
  let avatarUrl = "";
  let permissoes: string[] = [];
  let assinatura: AssinaturaEmpresa | null = null;
  let isAdmin = false;
  let nichoCodigo: NichoCodigo = "comercio";
  let exibirAvisoMetaWhatsapp = false;
  let podeAcessarWhatsappWebLocal = false;

  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    if (resultado.status === 401) {
      redirect("/login");
    }

    redirect("/conta-incompleta");
  }

  const acessoTemporario = resultado.usuario.acesso_temporario ?? null;

  if (
    branding.id === BRANDING_PROSPERITY.id &&
    resultado.usuario.white_label_admin?.white_label
  ) {
    branding = resultado.usuario.white_label_admin.white_label;
  }

  profileName =
    acessoTemporario?.operador.nome || resultado.usuario.nome || "Usuario";
  avatarUrl =
    acessoTemporario?.operador.avatar_url || resultado.usuario.avatar_url || "";
  permissoes = resultado.usuario.permissoes;
  assinatura = resultado.usuario.assinatura;
  isAdmin = resultado.usuario.is_admin;

  if (isAdmin && resultado.usuario.empresa_id && !acessoTemporario) {
    try {
      exibirAvisoMetaWhatsapp = !(await usuarioConfirmouAvisoMetaWhatsapp(
        resultado.usuario.id
      ));
    } catch (error) {
      console.error(
        "[AVISO_META_WHATSAPP] Erro ao verificar confirmacao do usuario:",
        error
      );
    }
  }

  if (resultado.usuario.empresa_id) {
    try {
      podeAcessarWhatsappWebLocal =
        await empresaPodeAcessarWhatsappWebLocal(resultado.usuario.empresa_id);
    } catch (error) {
      console.error(
        "[WHATSAPP_WEB_LOCAL] Erro ao validar acesso da empresa:",
        error
      );
    }

    try {
      const nicho = await buscarNichoEmpresa(resultado.usuario.empresa_id);
      nichoCodigo = nicho.codigo;
    } catch (error) {
      console.error("Erro ao carregar nicho da empresa:", error);
    }
  }

  return (
    <CrmShell
      initialCollapsed={initialCollapsed}
      profileName={profileName}
      avatarUrl={avatarUrl}
      permissoes={permissoes}
      assinatura={assinatura}
      isAdmin={isAdmin}
      nichoCodigo={nichoCodigo}
      podeAcessarWhatsappWebLocal={podeAcessarWhatsappWebLocal}
      branding={branding}
    >
      {acessoTemporario && (
        <AcessoTemporarioEmpresaBanner acesso={acessoTemporario} />
      )}
      <MetaWhatsAppPricingNotice initialOpen={exibirAvisoMetaWhatsapp} />
      {children}
      <AmbienteObrigatorioGuard />
      <MobileEmpresaMenuLink isAdmin={isAdmin} />
      <AgendaMenuLabel />
    </CrmShell>
  );
}
