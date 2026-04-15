import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import CrmShell from "@/components/CrmShell";

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

  if (user) {
    const { data: usuarioSistema } = await supabase
      .from("usuarios")
      .select("nome, avatar_url")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    profileName = usuarioSistema?.nome || "Usuário";
    avatarUrl = usuarioSistema?.avatar_url || "";
  }

  return (
    <CrmShell
      initialCollapsed={initialCollapsed}
      profileName={profileName}
      avatarUrl={avatarUrl}
    >
      {children}
    </CrmShell>
  );
}