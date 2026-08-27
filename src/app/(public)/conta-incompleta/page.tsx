import { redirect } from "next/navigation";
import { getUsuarioBasico } from "@/lib/auth/get-usuario-contexto";
import { createClient } from "@/lib/supabase/server";

export default async function ContaIncompletaPage() {
  const resultado = await getUsuarioBasico();

  if (resultado.ok) {
    redirect("/painel");
  }

  if (resultado.status === 401) {
    redirect("/login");
  }

  async function sair() {
    "use server";

    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-xl items-center">
        <section className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
            CRM Prosperity
          </p>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Não foi possível concluir seu acesso
          </h1>

          <p className="mt-4 text-sm leading-6 text-slate-300">
            Sua sessão está válida, mas o cadastro interno da conta não pôde
            ser recuperado automaticamente com segurança.
          </p>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Nenhum vínculo com empresa foi criado automaticamente. Saia da
            sessão e tente outro acesso ou entre em contato com o suporte para
            revisar o cadastro.
          </p>

          <form action={sair} className="mt-7">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Sair e tentar outro acesso
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
