import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import CrmShell from "@/components/CrmShell";
import AmbienteObrigatorioGuard from "@/components/AmbienteObrigatorioGuard";
import MobileEmpresaMenuLink from "@/components/MobileEmpresaMenuLink";
import AgendaMenuLabel from "@/components/AgendaMenuLabel";
import AcessoTemporarioEmpresaBanner from "@/components/AcessoTemporarioEmpresaBanner";
import ProgramaAceiteModal from "@/components/ProgramaAceiteModal";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { empresaPrecisaConfirmarPrograma, VERSAO_ACEITE_PROGRAMA } from "@/lib/contratos/programa-aceite";
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
  let exibirAceitePrograma = false;
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

  if (
    isAdmin &&
    resultado.usuario.empresa_id &&
    !acessoTemporario &&
    branding.id === BRANDING_PROSPERITY.id
  ) {
    try {
      exibirAceitePrograma = await empresaPrecisaConfirmarPrograma(
        resultado.usuario.empresa_id
      );
    } catch (error) {
      console.error(
        "[ACEITE_PROGRAMA] Erro ao consultar confirmação contratual:",
        error
      );
      // Em caso de falha temporária, apresentar o modal sem supor aceite.
      exibirAceitePrograma = true;
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
      <ProgramaAceiteModal
        initialOpen={exibirAceitePrograma}
        versao={VERSAO_ACEITE_PROGRAMA}
      />
      {children}
      <AmbienteObrigatorioGuard />
      <MobileEmpresaMenuLink isAdmin={isAdmin} />
      <AgendaMenuLabel />
    </CrmShell>
  );
}
