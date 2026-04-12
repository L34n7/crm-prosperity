import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function onlyDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("[CONTATOS OPCOES] auth user:", user?.id || null);
    console.log("[CONTATOS OPCOES] auth error:", authError || null);

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const { data: usuarioSistema, error: usuarioError } = await supabase
      .from("usuarios")
      .select("id, empresa_id, status")
      .eq("auth_user_id", user.id)
      .single();

    console.log("[CONTATOS OPCOES] usuarioSistema:", usuarioSistema || null);
    console.log("[CONTATOS OPCOES] usuarioError:", usuarioError || null);

    if (usuarioError || !usuarioSistema) {
      return NextResponse.json(
        { ok: false, error: "Usuário do sistema não encontrado." },
        { status: 403 }
      );
    }

    if (usuarioSistema.status !== "ativo") {
      return NextResponse.json(
        { ok: false, error: "Usuário inativo ou bloqueado." },
        { status: 403 }
      );
    }

    const busca = req.nextUrl.searchParams.get("busca")?.trim() || "";
    const buscaNumerica = onlyDigits(busca);

    console.log("[CONTATOS OPCOES] busca:", busca);
    console.log("[CONTATOS OPCOES] buscaNumerica:", buscaNumerica);
    console.log("[CONTATOS OPCOES] empresa_id usuario:", usuarioSistema.empresa_id);

    const { data, error } = await supabase
      .from("contatos")
      .select(`
        id,
        empresa_id,
        nome,
        telefone,
        email,
        origem,
        campanha,
        status_lead,
        created_at,
        updated_at
      `)
      .eq("empresa_id", usuarioSistema.empresa_id)
      .order("nome", { ascending: true })
      .limit(200);

    console.log("[CONTATOS OPCOES] contatos raw error:", error || null);
    console.log("[CONTATOS OPCOES] contatos raw total:", data?.length || 0);
    console.log("[CONTATOS OPCOES] contatos raw sample:", data?.slice(0, 5) || []);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Erro ao buscar contatos." },
        { status: 400 }
      );
    }

    let contatos = Array.isArray(data) ? data : [];

    if (busca) {
      const termo = busca.toLowerCase();

      contatos = contatos.filter((contato) => {
        const nome = String(contato.nome || "").toLowerCase();
        const telefone = String(contato.telefone || "");
        const telefoneNumerico = onlyDigits(telefone);
        const telefoneSem55 = telefoneNumerico.startsWith("55")
          ? telefoneNumerico.slice(2)
          : telefoneNumerico;
        const email = String(contato.email || "").toLowerCase();
        const campanha = String(contato.campanha || "").toLowerCase();
        const statusLead = String(contato.status_lead || "").toLowerCase();
        const origem = String(contato.origem || "").toLowerCase();

        const matchTexto =
          nome.includes(termo) ||
          email.includes(termo) ||
          campanha.includes(termo) ||
          statusLead.includes(termo) ||
          origem.includes(termo);

        const matchTelefone =
          !!buscaNumerica &&
          (
            telefoneNumerico.includes(buscaNumerica) ||
            telefoneSem55.includes(buscaNumerica) ||
            (`55${buscaNumerica}`).includes(telefoneNumerico) ||
            (`55${buscaNumerica}`).includes(telefoneSem55)
          );

        return matchTexto || matchTelefone;
      });
    }

    console.log("[CONTATOS OPCOES] contatos final total:", contatos.length);
    console.log("[CONTATOS OPCOES] contatos final sample:", contatos.slice(0, 5));

    return NextResponse.json({
      ok: true,
      contatos,
    });
  } catch (error: any) {
    console.error("[CONTATOS OPCOES] erro interno:", error);

    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}