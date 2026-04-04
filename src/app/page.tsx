import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: usuarioSistema } = await supabase
    .from("usuarios")
    .select("id, nome, email, perfil, empresa_id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!usuarioSistema) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard inicial</h1>
          <LogoutButton />
        </div>

        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-gray-600">
            Você está autenticado no CRM.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-4">
              <h2 className="font-semibold">Usuário autenticado</h2>
              <p className="mt-2 text-sm"><strong>Nome:</strong> {usuarioSistema.nome}</p>
              <p className="text-sm"><strong>Email:</strong> {usuarioSistema.email}</p>
              <p className="text-sm"><strong>Perfil:</strong> {usuarioSistema.perfil}</p>
              <p className="text-sm">
                <strong>Empresa:</strong>{" "}
                {usuarioSistema.empresa_id ?? "Super Admin sem empresa vinculada"}
              </p>
              <p className="text-sm"><strong>Status:</strong> {usuarioSistema.status}</p>
            </div>

            <div className="rounded-xl border p-4">
              <h2 className="font-semibold">Próximos módulos</h2>
              <ul className="mt-2 space-y-2 text-sm text-gray-700">
                <li>• Setores</li>
                <li>• Usuários</li>
                <li>• Empresas</li>
                <li>• Conversas</li>
                <li>• Chatbot</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}