import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type NotificarCampanhaPausadaParams = {
  empresaId: string;
  campanhaId: string;
  integracaoWhatsappId: string;
  usuarioId?: string | null;
  statusPausa: string;
  motivo: string;
  erroCodigoMeta?: number | null;
};

type UsuarioRow = {
  id: string;
  nome: string | null;
  email: string | null;
  status: string | null;
};

type UsuarioPerfilRow = {
  usuario_id: string;
  perfis_empresa?:
    | {
        nome?: string | null;
        ativo?: boolean | null;
        empresa_id?: string | null;
      }
    | Array<{
        nome?: string | null;
        ativo?: boolean | null;
        empresa_id?: string | null;
      }>
    | null;
};

type CampanhaRow = {
  id: string;
  usuario_id: string | null;
  template_nome: string | null;
  template_idioma: string | null;
  status: string;
  total_itens: number | null;
  total_pendentes: number | null;
  total_processando: number | null;
  total_enviados: number | null;
  total_falhas: number | null;
  total_cancelados: number | null;
  pausa_motivo: string | null;
  paused_at: string | null;
  created_at: string | null;
  integracoes_whatsapp?:
    | {
        nome_conexao?: string | null;
        numero?: string | null;
      }
    | Array<{
        nome_conexao?: string | null;
        numero?: string | null;
      }>
    | null;
};

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatarDataEmail(data?: string | null) {
  const dataBase = data ? new Date(data) : new Date();

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(Number.isNaN(dataBase.getTime()) ? new Date() : dataBase);
}

function formatarStatusPausa(status: string) {
  const mapa: Record<string, string> = {
    pausada_por_falhas: "Pausada por falhas",
    pausada_por_lista_invalida: "Pausada por lista invalida",
    pausada_por_erro_meta: "Pausada por erro da Meta",
    pausada_por_conta_bloqueada: "Pausada por conta bloqueada",
  };

  return mapa[status] || "Campanha pausada";
}

function obterIntegracao(campanha: CampanhaRow) {
  const integracao = campanha.integracoes_whatsapp;
  return Array.isArray(integracao) ? integracao[0] || null : integracao || null;
}

function obterPerfilEmpresa(vinculo: UsuarioPerfilRow) {
  const perfil = vinculo.perfis_empresa;
  return Array.isArray(perfil) ? perfil[0] || null : perfil || null;
}

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crmprosperity.com"
  ).replace(/\/$/, "");
}

async function buscarCampanha(campanhaId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_disparo_campanhas")
    .select(
      `
        id,
        usuario_id,
        template_nome,
        template_idioma,
        status,
        total_itens,
        total_pendentes,
        total_processando,
        total_enviados,
        total_falhas,
        total_cancelados,
        pausa_motivo,
        paused_at,
        created_at,
        integracoes_whatsapp:integracao_whatsapp_id (
          nome_conexao,
          numero
        )
      `
    )
    .eq("id", campanhaId)
    .maybeSingle();

  if (error || !data) {
    console.warn("[WHATSAPP DISPARO ALERTA] Campanha nao encontrada:", {
      campanhaId,
      erro: error,
    });
    return null;
  }

  return data as CampanhaRow;
}

async function listarUsuariosAtivosDaEmpresa(empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("usuarios")
    .select("id,nome,email,status")
    .eq("empresa_id", empresaId)
    .eq("status", "ativo");

  if (error) {
    console.warn("[WHATSAPP DISPARO ALERTA] Erro ao buscar usuarios:", error);
    return [];
  }

  return (data || []) as UsuarioRow[];
}

async function listarAdministradores(
  empresaId: string,
  usuarios: UsuarioRow[]
) {
  const usuarioIds = usuarios.map((usuario) => usuario.id).filter(Boolean);

  if (usuarioIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("usuarios_perfis")
    .select(
      `
        usuario_id,
        perfis_empresa (
          nome,
          ativo,
          empresa_id
        )
      `
    )
    .in("usuario_id", usuarioIds);

  if (error) {
    console.warn("[WHATSAPP DISPARO ALERTA] Erro ao buscar perfis:", error);
    return [];
  }

  const adminIds = new Set(
    ((data || []) as UsuarioPerfilRow[])
      .filter((vinculo) => {
        const perfil = obterPerfilEmpresa(vinculo);
        return (
          String(perfil?.nome || "") === "Administrador" &&
          perfil?.ativo !== false &&
          String(perfil?.empresa_id || "") === empresaId
        );
      })
      .map((vinculo) => vinculo.usuario_id)
      .filter(Boolean)
  );

  return usuarios.filter((usuario) => adminIds.has(usuario.id));
}

async function criarNotificacaoSininho(params: {
  empresaId: string;
  usuarioId?: string | null;
  campanha: CampanhaRow;
  integracaoWhatsappId: string;
  statusPausa: string;
  motivo: string;
  erroCodigoMeta?: number | null;
}) {
  const statusLabel = formatarStatusPausa(params.statusPausa);
  const titulo = `Campanha de WhatsApp pausada`;
  const mensagem = `${statusLabel}: ${
    params.motivo
  } Template: ${params.campanha.template_nome || "Nao informado"}.`;

  const { error } = await supabaseAdmin.from("notificacoes").insert({
    empresa_id: params.empresaId,
    usuario_id: params.usuarioId || params.campanha.usuario_id || null,
    tipo: "whatsapp_disparo_pausado",
    titulo,
    mensagem,
    lida: false,
    metadata_json: {
      campanha_id: params.campanha.id,
      integracao_whatsapp_id: params.integracaoWhatsappId,
      status_pausa: params.statusPausa,
      erro_codigo_meta: params.erroCodigoMeta || null,
      motivo: params.motivo,
      total_itens: params.campanha.total_itens || 0,
      total_enviados: params.campanha.total_enviados || 0,
      total_falhas: params.campanha.total_falhas || 0,
      rota: "/disparos-whatsapp",
    },
  });

  if (error) {
    console.warn(
      "[WHATSAPP DISPARO ALERTA] Erro ao criar notificacao:",
      error
    );
  }
}

async function enviarEmailAdministradores(params: {
  administradores: UsuarioRow[];
  campanha: CampanhaRow;
  statusPausa: string;
  motivo: string;
  erroCodigoMeta?: number | null;
}) {
  if (!resend) {
    console.warn("[WHATSAPP DISPARO ALERTA] RESEND_API_KEY nao configurada.");
    return;
  }

  const destinatarios = Array.from(
    new Set(
      params.administradores
        .map((usuario) => String(usuario.email || "").trim())
        .filter(Boolean)
    )
  );

  if (destinatarios.length === 0) {
    console.warn(
      "[WHATSAPP DISPARO ALERTA] Nenhum administrador com email valido."
    );
    return;
  }

  const integracao = obterIntegracao(params.campanha);
  const statusLabel = formatarStatusPausa(params.statusPausa);
  const linkCampanhas = `${appUrl()}/disparos-whatsapp`;
  const templateSeguro = escaparHtml(
    params.campanha.template_nome || "Template nao informado"
  );
  const motivoSeguro = escaparHtml(params.motivo);
  const statusSeguro = escaparHtml(statusLabel);
  const dataSeguro = escaparHtml(formatarDataEmail(params.campanha.paused_at));
  const numeroSeguro = escaparHtml(integracao?.numero || "Nao informado");
  const integracaoSeguro = escaparHtml(
    integracao?.nome_conexao || "Nao informada"
  );
  const totalSeguro = escaparHtml(String(params.campanha.total_itens || 0));
  const enviadosSeguro = escaparHtml(
    String(params.campanha.total_enviados || 0)
  );
  const falhasSeguro = escaparHtml(String(params.campanha.total_falhas || 0));
  const erroMetaSeguro = escaparHtml(
    params.erroCodigoMeta ? String(params.erroCodigoMeta) : "Nao informado"
  );

  try {
    await resend.emails.send({
      from: "CRM Prosperity <no-reply@crmprosperity.com>",
      to: destinatarios,
      subject: `Campanha WhatsApp pausada - ${statusLabel}`,
      html: `
        <div style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 18px 45px rgba(15,23,42,0.10);">
                  <tr>
                    <td style="background:linear-gradient(135deg,#991b1b,#0f172a);padding:28px 32px;color:#ffffff;">
                      <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">
                        CRM Prosperity
                      </div>
                      <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;font-weight:800;">
                        Campanha de WhatsApp pausada
                      </h1>
                      <p style="margin:10px 0 0;font-size:14px;line-height:1.6;opacity:0.9;">
                        O disparo foi interrompido automaticamente para proteger a conta WhatsApp e a estabilidade do sistema.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:30px 32px 18px;">
                      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:16px;padding:18px 20px;">
                        <div style="font-size:12px;font-weight:800;color:#b91c1c;text-transform:uppercase;letter-spacing:0.06em;">
                          ${statusSeguro}
                        </div>
                        <h2 style="margin:8px 0 8px;color:#0f172a;font-size:20px;line-height:1.3;">
                          ${templateSeguro}
                        </h2>
                        <p style="margin:0;color:#475569;font-size:15px;line-height:1.6;">
                          ${motivoSeguro}
                        </p>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:0 32px 0;">
                      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;">
                        <div style="font-size:12px;font-weight:800;color:#0f509a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">
                          Detalhes da campanha
                        </div>
                        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 10px;">
                          <tr>
                            <td style="width:170px;color:#64748b;font-size:13px;">Integração</td>
                            <td style="color:#0f172a;font-size:14px;font-weight:700;">${integracaoSeguro}</td>
                          </tr>
                          <tr>
                            <td style="width:170px;color:#64748b;font-size:13px;">Número</td>
                            <td style="color:#0f172a;font-size:14px;font-weight:700;">${numeroSeguro}</td>
                          </tr>
                          <tr>
                            <td style="width:170px;color:#64748b;font-size:13px;">Total</td>
                            <td style="color:#0f172a;font-size:14px;font-weight:700;">${totalSeguro}</td>
                          </tr>
                          <tr>
                            <td style="width:170px;color:#64748b;font-size:13px;">Enviados</td>
                            <td style="color:#0f172a;font-size:14px;font-weight:700;">${enviadosSeguro}</td>
                          </tr>
                          <tr>
                            <td style="width:170px;color:#64748b;font-size:13px;">Falhas</td>
                            <td style="color:#0f172a;font-size:14px;font-weight:700;">${falhasSeguro}</td>
                          </tr>
                          <tr>
                            <td style="width:170px;color:#64748b;font-size:13px;">Erro Meta</td>
                            <td style="color:#0f172a;font-size:14px;font-weight:700;">${erroMetaSeguro}</td>
                          </tr>
                          <tr>
                            <td style="width:170px;color:#64748b;font-size:13px;">Data e hora</td>
                            <td style="color:#0f172a;font-size:14px;font-weight:700;">${dataSeguro}</td>
                          </tr>
                        </table>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:26px 32px 34px;">
                      <a
                        href="${linkCampanhas}"
                        style="display:inline-block;background:#0f509a;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-size:14px;font-weight:800;"
                      >
                        Abrir campanhas no CRM
                      </a>

                      <p style="margin:18px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
                        Revise o motivo da pausa antes de retomar qualquer envio. Campanhas pausadas não continuam processando novos contatos.
                      </p>
                    </td>
                  </tr>

                  <tr>
                    <td style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;">
                      <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                        Este email foi enviado automaticamente pelo CRM Prosperity porque o circuit breaker de disparos WhatsApp pausou uma campanha.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `,
    });
  } catch (error) {
    console.error(
      "[WHATSAPP DISPARO ALERTA] Erro ao enviar email para administradores:",
      error
    );
  }
}

export async function notificarCampanhaDisparoPausada({
  empresaId,
  campanhaId,
  integracaoWhatsappId,
  usuarioId,
  statusPausa,
  motivo,
  erroCodigoMeta,
}: NotificarCampanhaPausadaParams) {
  try {
    const campanha = await buscarCampanha(campanhaId);

    if (!campanha) {
      return;
    }

    const usuarios = await listarUsuariosAtivosDaEmpresa(empresaId);
    const administradores = await listarAdministradores(empresaId, usuarios);

    await criarNotificacaoSininho({
      empresaId,
      usuarioId,
      campanha,
      integracaoWhatsappId,
      statusPausa,
      motivo,
      erroCodigoMeta,
    });

    await enviarEmailAdministradores({
      administradores,
      campanha,
      statusPausa,
      motivo,
      erroCodigoMeta,
    });
  } catch (error) {
    console.error("[WHATSAPP DISPARO ALERTA] Erro geral:", error);
  }
}
