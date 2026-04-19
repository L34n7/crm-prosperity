import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { criarEmpresaSelfService } from "@/lib/usuarios/criar-empresa-self-service";

const supabase = getSupabaseAdmin();

type LeadCadastroRow = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  empresa: string | null;
  status: string;
  plano_slug: string;
  pago: boolean | null;
  pago_em: string | null;
  empresa_id: string | null;
  usuario_id: string | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();

    console.log("[ATOMOPAY WEBHOOK] Payload recebido:", JSON.stringify(body, null, 2));

    const status = String(body?.status ?? "").trim().toLowerCase();
    const email = String(body?.customer?.email ?? "").trim().toLowerCase();
    const nome = String(body?.customer?.name ?? "").trim();
    const telefone = String(body?.customer?.phone_number ?? "").trim();

    if (!status) {
      return NextResponse.json({ error: "Status não enviado." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "Email do cliente não enviado." }, { status: 400 });
    }

    const statusPagoAceitos = ["paid", "pago"];

    const statusIgnorados = [
      "waiting_payment",
      "aguardando pagamento",
      "processing",
      "prossessing",
      "authorized",
      "refused",
      "refunded",
      "chargedback",
      "chargeback",
      "cancelado",
      "falha",
      "antifraud",
      "pre chargeback",
    ];

    if (!statusPagoAceitos.includes(status)) {
      if (statusIgnorados.includes(status)) {
        console.log("[ATOMOPAY WEBHOOK] Status ignorado:", status);
        return NextResponse.json({ ok: true, ignored: true });
      }

      console.log("[ATOMOPAY WEBHOOK] Status não tratado:", status);
      return NextResponse.json({ ok: true, ignored: true });
    }

    const { data: leadPorEmail, error: leadEmailError } = await supabase
      .from("leads_cadastro")
      .select("*")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<LeadCadastroRow>();

    if (leadEmailError) {
      console.error("[ATOMOPAY WEBHOOK] Erro ao buscar lead por email:", leadEmailError);
      return NextResponse.json({ error: "Erro ao buscar lead." }, { status: 500 });
    }

    let lead = leadPorEmail;

    if (!lead && telefone) {
      const { data: leadPorTelefone, error: leadTelefoneError } = await supabase
        .from("leads_cadastro")
        .select("*")
        .eq("telefone", telefone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<LeadCadastroRow>();

      if (leadTelefoneError) {
        console.error(
          "[ATOMOPAY WEBHOOK] Erro ao buscar lead por telefone:",
          leadTelefoneError
        );
        return NextResponse.json({ error: "Erro ao buscar lead." }, { status: 500 });
      }

      lead = leadPorTelefone;
    }

    if (!lead) {
      console.error("[ATOMOPAY WEBHOOK] Lead não encontrado para email/telefone.");
      return NextResponse.json({ ok: true, not_found: true });
    }

    if (lead.status === "convertido" || lead.empresa_id || lead.usuario_id) {
      console.log("[ATOMOPAY WEBHOOK] Lead já convertido:", lead.id);
      return NextResponse.json({ ok: true, already_converted: true });
    }

    const { data: usuarioAuthExistente, error: authExistenteError } =
      await supabase.auth.admin.listUsers();

    if (authExistenteError) {
      console.error("[ATOMOPAY WEBHOOK] Erro ao listar usuários auth:", authExistenteError);
      return NextResponse.json({ error: "Erro ao validar usuário auth." }, { status: 500 });
    }

    const usuarioMesmoEmail = usuarioAuthExistente.users.find(
      (item) => item.email?.toLowerCase() === email
    );

    let authUserId: string | null = null;

    if (usuarioMesmoEmail) {
      authUserId = usuarioMesmoEmail.id;
    } else {
      const { data: novoAuthUser, error: novoAuthError } =
        await supabase.auth.admin.createUser({
          email,
          email_confirm: false,
          user_metadata: {
            nome: nome || lead.nome,
          },
        });

      if (novoAuthError || !novoAuthUser?.user) {
        console.error("[ATOMOPAY WEBHOOK] Erro ao criar auth user:", novoAuthError);
        return NextResponse.json(
          { error: "Erro ao criar usuário de autenticação." },
          { status: 500 }
        );
      }

      authUserId = novoAuthUser.user.id;
    }

    if (!authUserId) {
      return NextResponse.json(
        { error: "Não foi possível definir o auth user." },
        { status: 500 }
      );
    }

    const resultadoCriacao = await criarEmpresaSelfService({
      auth_user_id: authUserId,
      nome_fantasia: lead.empresa || nome || lead.nome,
      razao_social: "",
      documento: "",
      email_empresa: email,
      telefone_empresa: telefone || lead.telefone || "",
      nome_responsavel: nome || lead.nome,
      nome_usuario: nome || lead.nome,
      email_usuario: email,
      plano_slug: lead.plano_slug || "basico",
    });

    const { error: updateLeadError } = await supabase
      .from("leads_cadastro")
      .update({
        status: "convertido",
        pago: true,
        pago_em: new Date().toISOString(),
        empresa_id: resultadoCriacao.empresa_id,
        usuario_id: resultadoCriacao.usuario_id,
        updated_at: new Date().toISOString(),
        metadata_json: body,
      })
      .eq("id", lead.id);

    if (updateLeadError) {
      console.error("[ATOMOPAY WEBHOOK] Erro ao atualizar lead:", updateLeadError);
      return NextResponse.json(
        { error: "Conta criada, mas falhou ao atualizar lead." },
        { status: 500 }
      );
    }

    console.log("[ATOMOPAY WEBHOOK] Lead convertido com sucesso:", {
      lead_id: lead.id,
      empresa_id: resultadoCriacao.empresa_id,
      usuario_id: resultadoCriacao.usuario_id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ATOMOPAY WEBHOOK] Erro interno:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro interno no webhook.",
      },
      { status: 500 }
    );
  }
}