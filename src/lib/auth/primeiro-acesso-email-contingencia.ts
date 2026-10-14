import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

const supabaseAdmin = getSupabaseAdmin();

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizarEmail(valor: unknown) {
  return String(valor || "").trim().toLowerCase();
}

async function buscarAdministradoresInternos() {
  const { data: permissoes, error: permissoesError } = await supabaseAdmin
    .from("perfil_permissoes")
    .select("perfil_empresa_id")
    .eq("permissao_codigo", PERMISSAO_INTERNA_EMPRESAS);

  if (permissoesError) throw permissoesError;

  const perfilIds = Array.from(
    new Set((permissoes || []).map((item) => item.perfil_empresa_id).filter(Boolean))
  );

  if (perfilIds.length === 0) {
    return { empresaId: null as string | null, administradores: [] as Array<{ id: string; nome: string; email: string }> };
  }

  const [{ data: perfisEmpresa, error: perfisError }, { data: vinculos, error: vinculosError }] =
    await Promise.all([
      supabaseAdmin
        .from("perfis_empresa")
        .select("id,empresa_id")
        .in("id", perfilIds),
      supabaseAdmin
        .from("usuarios_perfis")
        .select("usuario_id,perfil_empresa_id")
        .in("perfil_empresa_id", perfilIds),
    ]);

  if (perfisError) throw perfisError;
  if (vinculosError) throw vinculosError;

  const empresaIdsInternas = Array.from(
    new Set((perfisEmpresa || []).map((item) => item.empresa_id).filter(Boolean))
  );
  const usuarioIds = Array.from(
    new Set((vinculos || []).map((item) => item.usuario_id).filter(Boolean))
  );

  if (empresaIdsInternas.length === 0 || usuarioIds.length === 0) {
    return { empresaId: empresaIdsInternas[0] || null, administradores: [] };
  }

  const { data: usuarios, error: usuariosError } = await supabaseAdmin
    .from("usuarios")
    .select("id,nome,email,empresa_id,status")
    .in("id", usuarioIds)
    .eq("status", "ativo");

  if (usuariosError) throw usuariosError;

  const empresaId = empresaIdsInternas[0];
  const administradores = (usuarios || [])
    .filter((usuario) => usuario.empresa_id === empresaId)
    .map((usuario) => ({
      id: usuario.id,
      nome: String(usuario.nome || "Administrador"),
      email: normalizarEmail(usuario.email),
    }))
    .filter((usuario) => Boolean(usuario.email));

  return { empresaId, administradores };
}

export async function notificarFalhaEntregaPrimeiroAcesso(params: {
  empresaId: string;
  email: string;
  status: "bounced" | "failed";
  detalhe?: string | null;
  tokenId?: string | null;
  resendEmailId?: string | null;
  eventId?: string | null;
}) {
  const email = normalizarEmail(params.email);
  const statusLabel = params.status === "bounced" ? "bounced" : "failed";
  const chaveEvento =
    String(params.eventId || params.resendEmailId || params.tokenId || "").trim() ||
    `${params.empresaId}:${email}:${statusLabel}`;

  const [{ data: empresa, error: empresaError }, internos] = await Promise.all([
    supabaseAdmin
      .from("empresas")
      .select("id,nome_fantasia,nome_responsavel,email")
      .eq("id", params.empresaId)
      .maybeSingle(),
    buscarAdministradoresInternos(),
  ]);

  if (empresaError) throw empresaError;
  if (!empresa || !internos.empresaId) return;

  const href = `/configuracoes/empresas?empresa=${encodeURIComponent(
    empresa.id
  )}&acao=corrigir-email`;
  const detalhe = String(params.detalhe || "").trim();
  const mensagem =
    `O primeiro acesso de ${empresa.nome_fantasia} não foi entregue em ${email} (${statusLabel}). ` +
    `Acesse Configurações > Empresas e use “Corrigir e-mail de acesso” para ajustar CRM, autenticação e Prosperity Pay.`;

  const { data: notificacaoExistente, error: notificacaoBuscaError } =
    await supabaseAdmin
      .from("notificacoes")
      .select("id")
      .eq("empresa_id", internos.empresaId)
      .contains("metadata_json", { email_access_event_key: chaveEvento })
      .limit(1)
      .maybeSingle();

  if (notificacaoBuscaError) throw notificacaoBuscaError;

  if (!notificacaoExistente) {
    const { error: notificacaoError } = await supabaseAdmin
      .from("notificacoes")
      .insert({
        empresa_id: internos.empresaId,
        usuario_id: null,
        tipo: "primeiro_acesso_email_falhou",
        titulo: "Falha no envio do primeiro acesso",
        mensagem,
        lida: false,
        metadata_json: {
          tipo_notificacao: "primeiro_acesso_email_falhou",
          href,
          empresa_cliente_id: empresa.id,
          empresa_cliente_nome: empresa.nome_fantasia,
          email_falhou: email,
          delivery_status: statusLabel,
          delivery_detail: detalhe || null,
          resend_email_id: params.resendEmailId || null,
          resend_event_id: params.eventId || null,
          email_access_event_key: chaveEvento,
        },
      });

    if (notificacaoError) throw notificacaoError;
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey || internos.administradores.length === 0) {
    if (params.tokenId) {
      await supabaseAdmin
        .from("primeiro_acesso_tokens")
        .update({
          email_failure_notified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.tokenId);
    }
    return;
  }

  const resend = new Resend(resendApiKey);
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crmprosperity.com"
  ).replace(/\/$/, "");
  const link = `${siteUrl}${href}`;
  const empresaNome = escaparHtml(empresa.nome_fantasia);
  const emailHtml = escaparHtml(email);
  const detalheHtml = escaparHtml(detalhe);
  const texto =
    `Falha no envio do primeiro acesso\n\n` +
    `Empresa: ${empresa.nome_fantasia}\n` +
    `E-mail: ${email}\n` +
    `Status: ${statusLabel}\n` +
    (detalhe ? `Detalhe: ${detalhe}\n` : "") +
    `\nComo corrigir:\n1. Acesse /configuracoes/empresas.\n2. Localize a empresa.\n3. Clique em “Corrigir e-mail de acesso”.\n4. Informe o endereço correto e confirme.\n\n${link}`;

  const resultados = await Promise.all(
    internos.administradores.map(async (administrador) => {
      const envio = await resend.emails.send(
        {
          from: "CRM Prosperity <no-reply@crmprosperity.com>",
          to: administrador.email,
          subject: `[Ação necessária] Falha no primeiro acesso · ${empresa.nome_fantasia}`,
          text: texto,
          html: `
            <div style="margin:0;padding:32px 16px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033">
              <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e3e8f0;border-radius:20px;overflow:hidden">
                <div style="padding:26px 30px;background:#7f1d1d;color:#fff">
                  <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.82">CRM Prosperity · Contingência de acesso</div>
                  <h1 style="margin:9px 0 0;font-size:24px">Falha no envio do primeiro acesso</h1>
                </div>
                <div style="padding:28px 30px;font-size:14px;line-height:1.65">
                  <p style="margin:0 0 18px">O e-mail de primeiro acesso de <strong>${empresaNome}</strong> não foi entregue.</p>
                  <div style="padding:16px;border:1px solid #fecaca;border-radius:14px;background:#fff7f7">
                    <div><strong>E-mail:</strong> ${emailHtml}</div>
                    <div><strong>Status:</strong> ${statusLabel}</div>
                    ${detalheHtml ? `<div><strong>Detalhe:</strong> ${detalheHtml}</div>` : ""}
                  </div>
                  <h2 style="margin:24px 0 10px;font-size:17px">Como corrigir</h2>
                  <ol style="margin:0;padding-left:20px;color:#475569">
                    <li>Acesse <strong>/configuracoes/empresas</strong>.</li>
                    <li>Localize <strong>${empresaNome}</strong>.</li>
                    <li>Clique em <strong>“Corrigir e-mail de acesso”</strong>.</li>
                    <li>Informe o endereço correto e confirme a operação.</li>
                  </ol>
                  <div style="margin-top:24px;text-align:center">
                    <a href="${escaparHtml(link)}" style="display:inline-block;padding:13px 20px;border-radius:12px;background:#0f509a;color:#fff;text-decoration:none;font-weight:800">Abrir empresa no CRM</a>
                  </div>
                </div>
              </div>
            </div>
          `,
        },
        {
          idempotencyKey: `primeiro-acesso-falha/${chaveEvento}/${administrador.id}`.slice(
            0,
            256
          ),
        }
      );

      if (envio.error) {
        throw new Error(envio.error.message || "Falha ao avisar administrador.");
      }

      return envio.data?.id || null;
    })
  );

  if (params.tokenId) {
    const agora = new Date().toISOString();
    const { error: tokenError } = await supabaseAdmin
      .from("primeiro_acesso_tokens")
      .update({
        email_failure_notified_at: agora,
        updated_at: agora,
      })
      .eq("id", params.tokenId);

    if (tokenError) {
      console.error(
        "[PRIMEIRO ACESSO] Falha ao marcar contingência notificada:",
        tokenError
      );
    }
  }

  return { notificacao: true, emails: resultados.filter(Boolean).length };
}
