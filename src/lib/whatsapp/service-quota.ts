import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export const WHATSAPP_SERVICE_FREE_LIMIT = 1000;
export const WHATSAPP_SERVICE_ALERT_THRESHOLDS = [80, 95, 100] as const;

type ResumoIntegracao = {
  id: string;
  nome: string;
  numero: string;
  usados: number;
  limite: number;
  restantes: number;
  percentual: number;
  service_cobrado: number;
  free_entry_point: number;
};

type AlertaPendente = {
  id: string;
  percentual: number;
  service_usado: number;
  service_limite: number;
  integracao_whatsapp_id: string;
  numero: string;
  nome: string;
};

export type ResumoFranquiaServiceEmpresa = {
  mes: string;
  total_usado: number;
  total_limite: number;
  total_restante: number;
  percentual: number;
  nivel_percentual_maximo: number;
  integracoes: ResumoIntegracao[];
  alerta_pendente: AlertaPendente | null;
};

function mesAtual() {
  const agora = new Date();
  return `${agora.getUTCFullYear()}-${String(
    agora.getUTCMonth() + 1
  ).padStart(2, "0")}-01`;
}

function numero(valor: unknown) {
  const parsed = Number(valor || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentual(usados: number, limite: number) {
  if (limite <= 0) return 0;
  return Number(Math.min(100, (usados / limite) * 100).toFixed(1));
}

export async function buscarResumoFranquiaServiceEmpresa(params: {
  empresaId: string;
  usuarioId?: string | null;
  isAdmin?: boolean;
}): Promise<ResumoFranquiaServiceEmpresa> {
  const mes = mesAtual();

  const { data: integracoes, error: integracoesError } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id,nome_conexao,numero,posicao")
    .eq("empresa_id", params.empresaId)
    .eq("provider", "meta_official")
    .eq("status", "ativa")
    .order("posicao", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (integracoesError) {
    throw new Error(
      `Erro ao buscar integrações WhatsApp: ${integracoesError.message}`
    );
  }

  const ids = (integracoes || []).map((item) => item.id);
  let custos: Array<Record<string, any>> = [];

  if (ids.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_custos_mensais_integracao")
      .select(
        "integracao_whatsapp_id,service_gratis,service_cobrado,free_entry_point"
      )
      .eq("empresa_id", params.empresaId)
      .eq("mes", mes)
      .in("integracao_whatsapp_id", ids);

    if (error) {
      throw new Error(`Erro ao buscar consumo Service: ${error.message}`);
    }

    custos = (data || []) as Array<Record<string, any>>;
  }

  const custosPorIntegracao = new Map(
    custos.map((item) => [String(item.integracao_whatsapp_id), item])
  );

  const resumoIntegracoes: ResumoIntegracao[] = (integracoes || []).map(
    (integracao) => {
      const custo = custosPorIntegracao.get(String(integracao.id));
      const usadosRaw = numero(custo?.service_gratis);
      const usados = Math.min(WHATSAPP_SERVICE_FREE_LIMIT, usadosRaw);
      const restantes = Math.max(WHATSAPP_SERVICE_FREE_LIMIT - usados, 0);

      return {
        id: String(integracao.id),
        nome: String(integracao.nome_conexao || "WhatsApp"),
        numero: String(integracao.numero || ""),
        usados,
        limite: WHATSAPP_SERVICE_FREE_LIMIT,
        restantes,
        percentual: percentual(usados, WHATSAPP_SERVICE_FREE_LIMIT),
        service_cobrado: numero(custo?.service_cobrado),
        free_entry_point: numero(custo?.free_entry_point),
      };
    }
  );

  const totalUsado = resumoIntegracoes.reduce(
    (total, item) => total + item.usados,
    0
  );
  const totalLimite =
    resumoIntegracoes.length * WHATSAPP_SERVICE_FREE_LIMIT;
  const totalRestante = Math.max(totalLimite - totalUsado, 0);
  const nivelPercentualMaximo = resumoIntegracoes.reduce(
    (maximo, item) => Math.max(maximo, item.percentual),
    0
  );

  let alertaPendente: AlertaPendente | null = null;

  if (params.isAdmin && params.usuarioId) {
    const { data: alertas, error: alertasError } = await supabaseAdmin
      .from("whatsapp_service_franquia_alertas")
      .select(
        "id,percentual,service_usado,service_limite,integracao_whatsapp_id"
      )
      .eq("empresa_id", params.empresaId)
      .eq("mes", mes)
      .order("percentual", { ascending: false })
      .order("created_at", { ascending: false });

    if (alertasError) {
      throw new Error(`Erro ao buscar alertas Service: ${alertasError.message}`);
    }

    const alertaIds = (alertas || []).map((item) => item.id);
    let confirmados = new Set<string>();

    if (alertaIds.length > 0) {
      const { data: confirmacoes, error: confirmacoesError } =
        await supabaseAdmin
          .from("whatsapp_service_franquia_alertas_confirmacoes")
          .select("alerta_id")
          .eq("usuario_id", params.usuarioId)
          .in("alerta_id", alertaIds);

      if (confirmacoesError) {
        throw new Error(
          `Erro ao buscar confirmações Service: ${confirmacoesError.message}`
        );
      }

      confirmados = new Set(
        (confirmacoes || []).map((item) => String(item.alerta_id))
      );
    }

    const pendente = (alertas || []).find(
      (item) => !confirmados.has(String(item.id))
    );

    if (pendente) {
      const integracao = resumoIntegracoes.find(
        (item) => item.id === String(pendente.integracao_whatsapp_id)
      );

      alertaPendente = {
        id: String(pendente.id),
        percentual: numero(pendente.percentual),
        service_usado: numero(pendente.service_usado),
        service_limite: numero(pendente.service_limite),
        integracao_whatsapp_id: String(pendente.integracao_whatsapp_id),
        numero: integracao?.numero || "",
        nome: integracao?.nome || "WhatsApp",
      };
    }
  }

  return {
    mes,
    total_usado: totalUsado,
    total_limite: totalLimite,
    total_restante: totalRestante,
    percentual: percentual(totalUsado, totalLimite),
    nivel_percentual_maximo: nivelPercentualMaximo,
    integracoes: resumoIntegracoes,
    alerta_pendente: alertaPendente,
  };
}

async function buscarEmailsAdministradores(empresaId: string) {
  const { data: perfis, error: perfisError } = await supabaseAdmin
    .from("perfis_empresa")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .ilike("nome", "Administrador");

  if (perfisError) {
    throw new Error(`Erro ao buscar perfil administrador: ${perfisError.message}`);
  }

  const perfilIds = (perfis || []).map((item) => item.id);
  const usuarioIds = new Set<string>();

  if (perfilIds.length > 0) {
    const { data: vinculos, error: vinculosError } = await supabaseAdmin
      .from("usuarios_perfis")
      .select("usuario_id")
      .in("perfil_empresa_id", perfilIds);

    if (vinculosError) {
      throw new Error(
        `Erro ao buscar administradores: ${vinculosError.message}`
      );
    }

    for (const vinculo of vinculos || []) {
      if (vinculo.usuario_id) usuarioIds.add(String(vinculo.usuario_id));
    }
  }

  const emails = new Set<string>();

  if (usuarioIds.size > 0) {
    const { data: usuarios, error: usuariosError } = await supabaseAdmin
      .from("usuarios")
      .select("email")
      .eq("empresa_id", empresaId)
      .eq("status", "ativo")
      .in("id", Array.from(usuarioIds));

    if (usuariosError) {
      throw new Error(
        `Erro ao buscar e-mails dos administradores: ${usuariosError.message}`
      );
    }

    for (const usuario of usuarios || []) {
      const email = String(usuario.email || "").trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        emails.add(email);
      }
    }
  }

  if (emails.size === 0) {
    const { data: empresa } = await supabaseAdmin
      .from("empresas")
      .select("email")
      .eq("id", empresaId)
      .maybeSingle();

    const emailEmpresa = String(empresa?.email || "").trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailEmpresa)) {
      emails.add(emailEmpresa);
    }
  }

  return Array.from(emails);
}

async function enviarEmailAlerta(params: {
  empresaId: string;
  numero: string | null;
  nomeConexao: string | null;
  percentual: number;
  usados: number;
  limite: number;
}) {
  if (!resend) {
    throw new Error("RESEND_API_KEY não configurada.");
  }

  const destinatarios = await buscarEmailsAdministradores(params.empresaId);
  if (destinatarios.length === 0) {
    throw new Error("Nenhum e-mail de administrador encontrado.");
  }

  const { data: empresa } = await supabaseAdmin
    .from("empresas")
    .select("nome_fantasia")
    .eq("id", params.empresaId)
    .maybeSingle();

  const empresaNome = String(empresa?.nome_fantasia || "Sua empresa");
  const restante = Math.max(params.limite - params.usados, 0);
  const critico = params.percentual >= 95;
  const cor = params.percentual >= 100 ? "#dc2626" : critico ? "#d97706" : "#0f9f78";
  const titulo =
    params.percentual >= 100
      ? "Franquia Service gratuita atingiu 100%"
      : `Franquia Service atingiu ${params.percentual}%`;
  const appUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crmprosperity.com"
  ).replace(/\/$/, "");
  const numeroExibicao = params.numero || params.nomeConexao || "WhatsApp";

  const html = `
    <div style="margin:0;padding:34px 16px;background:#eef4f2;font-family:Arial,Helvetica,sans-serif">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr><td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;background:#fff;border:1px solid #dce7e4;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(7,19,26,.10)">
            <tr><td style="padding:30px 32px;background:linear-gradient(135deg,${cor},#07131a);color:#fff">
              <div style="font-size:12px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;opacity:.86">CRM Prosperity · Meta Service</div>
              <h1 style="margin:12px 0 0;font-size:25px;line-height:1.25">${titulo}</h1>
            </td></tr>
            <tr><td style="padding:30px 32px;color:#38524c;font-size:15px;line-height:1.65">
              <p style="margin:0 0 16px"><strong>${empresaNome}</strong>, o número <strong>${numeroExibicao}</strong> consumiu <strong>${params.usados} de ${params.limite}</strong> mensagens Service gratuitas no mês.</p>
              <div style="margin:22px 0;padding:20px;background:#f5f9f8;border:1px solid #dce7e4;border-radius:14px">
                <div style="display:flex;justify-content:space-between;gap:16px"><span>Consumo</span><strong>${params.percentual}%</strong></div>
                <div style="margin-top:10px;height:8px;background:#dfeae7;border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.min(params.percentual,100)}%;background:${cor};border-radius:999px"></div></div>
                <div style="margin-top:12px;color:#61756f;font-size:13px">Restam <strong>${restante}</strong> mensagens gratuitas neste ciclo.</div>
              </div>
              <p style="margin:0 0 22px">Ao finalizar a franquia, novas mensagens classificadas pela Meta como Service poderão ser cobradas. Mensagens Free Entry Point são contabilizadas separadamente.</p>
              <div style="text-align:center"><a href="${appUrl}" style="display:inline-block;padding:14px 24px;border-radius:11px;background:${cor};color:#fff;text-decoration:none;font-weight:800">Abrir CRM Prosperity</a></div>
            </td></tr>
            <tr><td style="padding:16px 32px;background:#f6f9f8;border-top:1px solid #dce7e4;color:#8ca09b;font-size:12px">Aviso automático de consumo da franquia Meta Service.</td></tr>
          </table>
        </td></tr>
      </table>
    </div>`;

  await Promise.all(
    destinatarios.map(async (to) => {
      const { error } = await resend.emails.send({
        from: "CRM Prosperity <no-reply@crmprosperity.com>",
        to,
        subject: `[CRM Prosperity] ${titulo}`,
        text: `${empresaNome}: ${params.usados}/${params.limite} mensagens Service gratuitas usadas no número ${numeroExibicao}. Restam ${restante}.`,
        html,
      });

      if (error) throw new Error(error.message);
    })
  );
}

export async function processarAlertaFranquiaService(params: {
  empresaId: string;
  integracaoWhatsappId: string;
  numero: string | null;
  nomeConexao: string | null;
  status: string | null;
  pricingCategory: string | null;
  pricingType: string | null;
}) {
  try {
    if (!["entregue", "lida"].includes(String(params.status || ""))) return;
    if (params.pricingCategory !== "service") return;
    if (params.pricingType !== "free_customer_service") return;

    const mes = mesAtual();
    const { data: consumo, error: consumoError } = await supabaseAdmin
      .from("whatsapp_custos_mensais_integracao")
      .select("service_gratis")
      .eq("empresa_id", params.empresaId)
      .eq("integracao_whatsapp_id", params.integracaoWhatsappId)
      .eq("mes", mes)
      .maybeSingle();

    if (consumoError) {
      throw new Error(`Erro ao consultar franquia Service: ${consumoError.message}`);
    }

    const usados = Math.min(
      WHATSAPP_SERVICE_FREE_LIMIT,
      numero(consumo?.service_gratis)
    );
    const atingidos = WHATSAPP_SERVICE_ALERT_THRESHOLDS.filter(
      (marco) => usados >= Math.ceil((WHATSAPP_SERVICE_FREE_LIMIT * marco) / 100)
    );

    if (atingidos.length === 0) return;

    const { data: existentes, error: existentesError } = await supabaseAdmin
      .from("whatsapp_service_franquia_alertas")
      .select("percentual")
      .eq("integracao_whatsapp_id", params.integracaoWhatsappId)
      .eq("mes", mes);

    if (existentesError) {
      throw new Error(`Erro ao consultar alertas Service: ${existentesError.message}`);
    }

    const existentesSet = new Set(
      (existentes || []).map((item) => numero(item.percentual))
    );
    const marco = atingidos.find((item) => !existentesSet.has(item));
    if (!marco) return;

    const { data: alerta, error: alertaError } = await supabaseAdmin
      .from("whatsapp_service_franquia_alertas")
      .insert({
        empresa_id: params.empresaId,
        integracao_whatsapp_id: params.integracaoWhatsappId,
        mes,
        percentual: marco,
        service_usado: usados,
        service_limite: WHATSAPP_SERVICE_FREE_LIMIT,
      })
      .select("id")
      .single();

    if (alertaError) {
      if (alertaError.code === "23505") return;
      throw new Error(`Erro ao registrar alerta Service: ${alertaError.message}`);
    }

    try {
      await enviarEmailAlerta({
        empresaId: params.empresaId,
        numero: params.numero,
        nomeConexao: params.nomeConexao,
        percentual: marco,
        usados,
        limite: WHATSAPP_SERVICE_FREE_LIMIT,
      });

      await supabaseAdmin
        .from("whatsapp_service_franquia_alertas")
        .update({
          email_enviado_em: new Date().toISOString(),
          email_erro: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", alerta.id);
    } catch (emailError) {
      const mensagem =
        emailError instanceof Error ? emailError.message : String(emailError);

      await supabaseAdmin
        .from("whatsapp_service_franquia_alertas")
        .update({
          email_erro: mensagem.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", alerta.id);

      console.error("[WHATSAPP SERVICE] Falha ao enviar alerta de franquia:", {
        empresaId: params.empresaId,
        integracaoWhatsappId: params.integracaoWhatsappId,
        marco,
        erro: mensagem,
      });
    }
  } catch (error) {
    console.error("[WHATSAPP SERVICE] Falha ao processar franquia:", {
      empresaId: params.empresaId,
      integracaoWhatsappId: params.integracaoWhatsappId,
      erro: error instanceof Error ? error.message : String(error),
    });
  }
}
