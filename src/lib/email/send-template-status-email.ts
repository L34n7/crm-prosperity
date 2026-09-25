import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusInfo(status: string) {
  const normalizado = String(status || "").trim().toUpperCase();

  const mapa: Record<
    string,
    { titulo: string; etiqueta: string; cor: string; descricao: string }
  > = {
    APPROVED: {
      titulo: "Template aprovado",
      etiqueta: "Aprovado",
      cor: "#20b486",
      descricao:
        "A Meta aprovou o template e ele já pode ser utilizado conforme as regras da categoria.",
    },
    REJECTED: {
      titulo: "Template rejeitado",
      etiqueta: "Rejeitado",
      cor: "#b42318",
      descricao:
        "A Meta rejeitou o template. Revise o motivo informado antes de criar uma nova versão.",
    },
    PENDING: {
      titulo: "Template em análise",
      etiqueta: "Em análise",
      cor: "#b7791f",
      descricao: "A Meta informou que o template está em análise.",
    },
    PAUSED: {
      titulo: "Template pausado",
      etiqueta: "Pausado",
      cor: "#b7791f",
      descricao:
        "A Meta pausou temporariamente este template. Ele pode ficar indisponível para novos envios.",
    },
    DISABLED: {
      titulo: "Template desativado",
      etiqueta: "Desativado",
      cor: "#b42318",
      descricao:
        "A Meta desativou este template. Ele não deve ser usado enquanto permanecer nesse estado.",
    },
    FLAGGED: {
      titulo: "Template sinalizado",
      etiqueta: "Sinalizado",
      cor: "#b7791f",
      descricao:
        "A Meta sinalizou este template por qualidade ou política. Acompanhe o status antes de novos envios.",
    },
    REINSTATED: {
      titulo: "Template reativado",
      etiqueta: "Reativado",
      cor: "#20b486",
      descricao: "A Meta reativou este template.",
    },
    ARCHIVED: {
      titulo: "Template arquivado",
      etiqueta: "Arquivado",
      cor: "#667085",
      descricao: "A Meta informou que este template foi arquivado.",
    },
    DELETED: {
      titulo: "Template excluído",
      etiqueta: "Excluído",
      cor: "#667085",
      descricao: "A Meta informou que este template foi excluído.",
    },
    PENDING_DELETION: {
      titulo: "Template com exclusão pendente",
      etiqueta: "Exclusão pendente",
      cor: "#b7791f",
      descricao: "A Meta informou que a exclusão deste template está pendente.",
    },
    IN_APPEAL: {
      titulo: "Template em recurso",
      etiqueta: "Em recurso",
      cor: "#2563eb",
      descricao: "A Meta informou que este template está em processo de recurso.",
    },
  };

  return (
    mapa[normalizado] || {
      titulo: "Status do template atualizado",
      etiqueta: normalizado || "Atualizado",
      cor: "#2563eb",
      descricao: "A Meta enviou uma atualização de status para este template.",
    }
  );
}

function categoriaLabel(categoria: string | null | undefined) {
  switch (String(categoria || "").trim().toUpperCase()) {
    case "UTILITY":
      return "Utilidade (Utility)";
    case "MARKETING":
      return "Marketing";
    case "AUTHENTICATION":
      return "Autenticação";
    default:
      return categoria || "Não informada";
  }
}

async function buscarEmailsAdministradores(empresaId: string) {
  const { data: perfis, error: perfisError } = await supabaseAdmin
    .from("perfis_empresa")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .ilike("nome", "Administrador");

  if (perfisError) {
    console.error(
      "[TEMPLATE_STATUS_EMAIL] Erro ao buscar perfil Administrador:",
      perfisError
    );
    return [];
  }

  const perfilIds = (perfis || []).map((perfil) => perfil.id).filter(Boolean);
  if (perfilIds.length === 0) return [];

  const { data: vinculos, error: vinculosError } = await supabaseAdmin
    .from("usuarios_perfis")
    .select("usuario_id")
    .in("perfil_empresa_id", perfilIds);

  if (vinculosError) {
    console.error(
      "[TEMPLATE_STATUS_EMAIL] Erro ao buscar administradores:",
      vinculosError
    );
    return [];
  }

  const usuarioIds = Array.from(
    new Set((vinculos || []).map((item) => item.usuario_id).filter(Boolean))
  );

  if (usuarioIds.length === 0) return [];

  const { data: usuarios, error: usuariosError } = await supabaseAdmin
    .from("usuarios")
    .select("id,email,status")
    .eq("empresa_id", empresaId)
    .eq("status", "ativo")
    .in("id", usuarioIds);

  if (usuariosError) {
    console.error(
      "[TEMPLATE_STATUS_EMAIL] Erro ao buscar emails dos administradores:",
      usuariosError
    );
    return [];
  }

  return Array.from(
    new Set(
      (usuarios || [])
        .map((usuario) => String(usuario.email || "").trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    )
  );
}

export async function sendTemplateStatusEmail(params: {
  empresaId: string;
  integracaoId: string;
  templateNome: string;
  status: string;
  categoria: string | null;
  idioma?: string | null;
  motivo?: string | null;
}) {
  if (!resend) {
    console.warn("[TEMPLATE_STATUS_EMAIL] RESEND_API_KEY não configurada.");
    return false;
  }

  const destinatarios = await buscarEmailsAdministradores(params.empresaId);
  if (destinatarios.length === 0) {
    console.warn("[TEMPLATE_STATUS_EMAIL] Nenhum administrador destinatário.", {
      empresaId: params.empresaId,
    });
    return false;
  }

  const [{ data: empresa }, { data: integracao }] = await Promise.all([
    supabaseAdmin
      .from("empresas")
      .select("nome_fantasia,razao_social")
      .eq("id", params.empresaId)
      .maybeSingle(),
    supabaseAdmin
      .from("integracoes_whatsapp")
      .select("nome_conexao,numero")
      .eq("id", params.integracaoId)
      .eq("empresa_id", params.empresaId)
      .maybeSingle(),
  ]);

  const info = statusInfo(params.status);
  const nomeEmpresa =
    String(empresa?.nome_fantasia || empresa?.razao_social || "").trim() ||
    "sua empresa";
  const nomeIntegracao =
    String(integracao?.nome_conexao || "").trim() || "WhatsApp";
  const numero = String(integracao?.numero || "").trim();
  const categoria = categoriaLabel(params.categoria);
  const motivo = String(params.motivo || "").trim();
  const idioma = String(params.idioma || "").trim() || "-";

  const appUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crmprosperity.com"
  ).replace(/\/$/, "");
  const logoUrl = `${appUrl}/logo.png`;
  const templatesUrl = `${appUrl}/templates-whatsapp`;

  const templateSeguro = escaparHtml(params.templateNome || "Template");
  const empresaSegura = escaparHtml(nomeEmpresa);
  const integracaoSegura = escaparHtml(
    numero ? `${nomeIntegracao} · ${numero}` : nomeIntegracao
  );
  const categoriaSegura = escaparHtml(categoria);
  const idiomaSeguro = escaparHtml(idioma);
  const motivoSeguro = escaparHtml(motivo);
  const tituloSeguro = escaparHtml(info.titulo);
  const descricaoSegura = escaparHtml(info.descricao);

  const motivoHtml = motivo
    ? `
      <tr>
        <td style="width:150px;color:#68827d;font-size:13px;padding-top:11px;">Motivo informado</td>
        <td style="color:#17322f;font-size:14px;font-weight:700;padding-top:11px;">${motivoSeguro}</td>
      </tr>
    `
    : "";

  const texto = [
    info.titulo,
    `Empresa: ${nomeEmpresa}`,
    `Template: ${params.templateNome}`,
    `Categoria: ${categoria}`,
    `Status: ${info.etiqueta}`,
    `Integração: ${numero ? `${nomeIntegracao} · ${numero}` : nomeIntegracao}`,
    `Idioma: ${idioma}`,
    motivo ? `Motivo: ${motivo}` : "",
    "",
    info.descricao,
    "",
    `Acesse: ${templatesUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const emailBase = {
      from: "CRM Prosperity <no-reply@crmprosperity.com>",
      subject: `${info.titulo}: ${params.templateNome} • CRM Prosperity`,
      text: texto,
      html: `
        <div style="margin:0;padding:32px 16px;background:#eef4f2;font-family:Arial,Helvetica,sans-serif">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr><td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;background:#fff;border:1px solid #dce7e4;border-radius:20px;overflow:hidden;box-shadow:0 18px 45px rgba(7,19,26,.10)">
                <tr><td style="padding:28px 32px;background:linear-gradient(135deg,${info.cor},#07131a);color:#fff">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
                    <td style="vertical-align:middle">
                      <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.85">CRM Prosperity · Templates WhatsApp</div>
                      <h1 style="margin:11px 0 0;font-size:25px;line-height:1.25">${tituloSeguro}</h1>
                    </td>
                    <td width="82" align="right" style="padding-left:18px;vertical-align:middle">
                      <img src="${logoUrl}" alt="CRM Prosperity" width="68" style="display:block;width:68px;height:auto;border:0" />
                    </td>
                  </tr></table>
                </td></tr>

                <tr><td style="padding:30px 32px;color:#3f5752;font-size:15px;line-height:1.65">
                  <p style="margin:0 0 16px">Olá! A Meta enviou uma atualização sobre um template da <strong>${empresaSegura}</strong>.</p>

                  <div style="padding:18px 20px;background:#f6f9f8;border:1px solid #dce7e4;border-left:4px solid ${info.cor};border-radius:12px">
                    <div style="font-size:12px;font-weight:800;color:${info.cor};text-transform:uppercase;letter-spacing:.06em">${escaparHtml(info.etiqueta)}</div>
                    <div style="margin-top:7px;color:#17322f;font-size:20px;font-weight:800">${templateSeguro}</div>
                    <p style="margin:9px 0 0;color:#506862;font-size:14px;line-height:1.55">${descricaoSegura}</p>
                  </div>

                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:22px">
                    <tr>
                      <td style="width:150px;color:#68827d;font-size:13px">Categoria</td>
                      <td style="color:#17322f;font-size:14px;font-weight:700">${categoriaSegura}</td>
                    </tr>
                    <tr>
                      <td style="width:150px;color:#68827d;font-size:13px;padding-top:11px">Integração</td>
                      <td style="color:#17322f;font-size:14px;font-weight:700;padding-top:11px">${integracaoSegura}</td>
                    </tr>
                    <tr>
                      <td style="width:150px;color:#68827d;font-size:13px;padding-top:11px">Idioma</td>
                      <td style="color:#17322f;font-size:14px;font-weight:700;padding-top:11px">${idiomaSeguro}</td>
                    </tr>
                    ${motivoHtml}
                  </table>

                  <div style="text-align:center;margin-top:28px">
                    <a href="${templatesUrl}" style="display:inline-block;background:#20b486;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:14px;font-weight:800">Abrir Templates no CRM</a>
                  </div>
                </td></tr>

                <tr><td style="padding:16px 32px;background:#f6f9f8;border-top:1px solid #dce7e4;color:#8ca09b;font-size:12px;line-height:1.5">
                  Este email foi enviado automaticamente porque a Meta alterou o status de um template do WhatsApp.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </div>
      `,
    };

    await Promise.all(
      destinatarios.map(async (to) => {
        const { error } = await resend.emails.send({
          ...emailBase,
          to,
        });

        if (error) {
          throw new Error(error.message);
        }
      })
    );

    console.log("[TEMPLATE_STATUS_EMAIL] Email enviado.", {
      empresaId: params.empresaId,
      template: params.templateNome,
      status: params.status,
      destinatarios: destinatarios.length,
    });

    return true;
  } catch (error) {
    console.error("[TEMPLATE_STATUS_EMAIL] Erro ao enviar email:", error);
    return false;
  }
}
