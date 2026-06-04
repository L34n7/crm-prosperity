import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { listarPermissoesDoUsuario } from "@/lib/permissoes/can";
import CrmShell from "@/components/CrmShell";
import AmbienteObrigatorioGuard from "@/components/AmbienteObrigatorioGuard";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("crm-sidebar-collapsed")?.value;
  const initialCollapsed = sidebarCookie === "true";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profileName = "Usuário";
  let avatarUrl = "";
  let permissoes: string[] = [];

  if (user) {
    const { data: usuarioSistema } = await supabase
      .from("usuarios")
      .select("id, nome, avatar_url")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    profileName = usuarioSistema?.nome || "Usuário";
    avatarUrl = usuarioSistema?.avatar_url || "";

    if (usuarioSistema?.id) {
      permissoes = await listarPermissoesDoUsuario(usuarioSistema.id);
    }
  }
 
  return (
    <CrmShell
      initialCollapsed={initialCollapsed}
      profileName={profileName}
      avatarUrl={avatarUrl}
      permissoes={permissoes}
    >
        {children}
      <AmbienteObrigatorioGuard/>
    </CrmShell>
  );
}
