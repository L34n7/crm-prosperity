import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  sendAssinaturaAvisoEmail,
  type TipoAvisoAssinatura,
} from "@/lib/email/send-assinatura-aviso-email";
import { resolverCheckoutRenovacao } from "@/lib/assinaturas/resolver-checkout-renovacao";
import { sincronizarCobrancasWhiteLabelAtivas } from "@/lib/white-label/billing";
import { sincronizarEstadoOperacionalClientesWhiteLabel } from "@/lib/white-label/operacional";

const supabase = getSupabaseAdmin();
const DIA_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 3 * DIA_MS;

function checkoutUrl(slug: string | null) {
  if (slug === "basico" || slug === "basic") {
    return (
      process.env.ATOMOPAY_CHECKOUT_URL_BASICO ||
      process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_BASICO ||
      process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ||
      null
    );
  }

  if (slug === "essencial") {
    return (
      process.env.ATOMOPAY_CHECKOUT_URL_ESSENCIAL ||
      process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_ESSENCIAL ||
      process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ||
      null
    );
  }

  return (
    process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL ||
    process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ||
    null
  );
}

function avisoElegivel(params: {
  status: string;
  vencimento: Date;
  bloqueio: Date | null;
  agora: Date;
}): TipoAvisoAssinatura | null {
  const diasDesdeVencimento =
    (params.agora.getTime() - params.vencimento.getTime()) / DIA_MS;

  if (
    params.status === "ativa" &&
    diasDesdeVencimento >= -3 &&
    diasDesdeVencimento < 0
  ) {
    return "pre_vencimento";
  }

  if (params.status === "vencida") {
    return "vencida";
  }

  if (params.status !== "bloqueada") {
    return null;
  }

  if (!params.bloqueio || Number.isNaN(params.bloqueio.getTime())) {
    return "bloqueada";
  }

  const diasDesdeBloqueio =
    (params.agora.getTime() - params.bloqueio.getTime()) / DIA_MS;

  // Contas que já passaram de 60 dias não recebem um aviso retroativo
  // dizendo que a suspensão ocorrerá "em 10 dias".
  if (diasDesdeBloqueio >= 60) return null;

  if (diasDesdeBloqueio >= 50) return "suspensao_50d";
  if (diasDesdeBloqueio >= 20) return "reativacao_20d";

  return "bloqueada";
}

function limiteEnviosPorTipo(tipo: TipoAvisoAssinatura) {
  if (
    tipo === "pre_vencimento" ||
    tipo === "reativacao_20d" ||
    tipo === "suspensao_50d"
  ) {
    return 1;
  }

  return 2;
}

async function buscarEmailsAdministradores(empresaId: string) {
  const { data: usuarios, error: usuariosError } = await supabase
    .from("usuarios")
    .select("id,email")
    .eq("empresa_id", empresaId)
    .eq("status", "ativo");

  if (usuariosError || !usuarios?.length) return [];

  const { data: vinculos, error: vinculosError } = await supabase
    .from("usuarios_perfis")
    .select("usuario_id,perfis_empresa(nome,ativo,empresa_id)")
    .in(
      "usuario_id",
      usuarios.map((usuario) => usuario.id)
    );

  if (vinculosError) return [];

  const adminIds = new Set(
    (vinculos || [])
      .filter((vinculo: any) => {
        const perfil = Array.isArray(vinculo.perfis_empresa)
          ? vinculo.perfis_empresa[0]
          : vinculo.perfis_empresa;

        return (
          String(perfil?.nome || "").toLowerCase() === "administrador" &&
          perfil?.ativo !== false &&
          perfil?.empresa_id === empresaId
        );
      })
      .map((vinculo: any) => vinculo.usuario_id)
  );

  return usuarios
    .filter((usuario) => adminIds.has(usuario.id))
    .map((usuario) => String(usuario.email || "").trim())
    .filter(Boolean);
}

export async function processarAvisosAssinatura(agora = new Date()) {
  await sincronizarCobrancasWhiteLabelAtivas();

  const { data: empresas, error } = await supabase
    .from("empresas")
    .select(
      "id,email,nome_fantasia,razao_social,assinatura_vencimento_em,assinatura_bloqueio_em,white_label_id,white_label_tipo,planos(slug)"
    )
    .not("assinatura_vencimento_em", "is", null)
    .order("assinatura_vencimento_em", { ascending: true })
    .limit(1000);

  if (error) {
    throw new Error(`Erro ao buscar assinaturas: ${error.message}`);
  }

  const resultado = {
    analisadas: empresas?.length || 0,
    atualizadas: 0,
    enviados: 0,
    ignorados: 0,
    erros: 0,
  };

  const { data: assinaturasProsperityPay, error: assinaturasProsperityPayError } =
    await supabase
      .from("prosperity_pay_assinaturas")
      .select("empresa_id,external_subscription_id,current_period_start")
      .not("empresa_id", "is", null)
      .not("external_subscription_id", "is", null);

  if (assinaturasProsperityPayError) {
    throw new Error(
      `Erro ao verificar assinaturas da Prosperity Pay: ${assinaturasProsperityPayError.message}`
    );
  }

  const empresasComCobrancaProsperityPay = new Set(
    (assinaturasProsperityPay || [])
      .map((item) => String(item.empresa_id || ""))
      .filter(Boolean)
  );

  for (const empresa of empresas || []) {
    try {
      if (empresa.white_label_tipo === "cliente") {
        resultado.ignorados += 1;
        continue;
      }

      const { data: status, error: syncError } = await supabase.rpc(
        "sincronizar_assinatura_empresa",
        { p_empresa_id: empresa.id }
      );

      if (syncError) {
        throw new Error(syncError.message);
      }

      resultado.atualizadas += 1;

      if (
        empresa.white_label_tipo === "gestora" &&
        empresa.white_label_id
      ) {
        await sincronizarEstadoOperacionalClientesWhiteLabel(
          String(empresa.white_label_id)
        );
      }

      // Assinaturas espelhadas na Prosperity Pay continuam tendo o status
      // sincronizado pelo CRM para garantir o bloqueio operacional no prazo,
      // mas os e-mails financeiros ficam sob responsabilidade da Pay.
      const cobrancaProsperityPay =
        empresasComCobrancaProsperityPay.has(empresa.id);
      const gestoraWhiteLabel = empresa.white_label_tipo === "gestora";

      if (cobrancaProsperityPay && !gestoraWhiteLabel) {
        resultado.ignorados += 1;
        continue;
      }

      const vencimento = new Date(String(empresa.assinatura_vencimento_em));
      const bloqueioRaw = empresa.assinatura_bloqueio_em
        ? new Date(String(empresa.assinatura_bloqueio_em))
        : new Date(vencimento.getTime() + 7 * DIA_MS);
      const bloqueio = Number.isNaN(bloqueioRaw.getTime())
        ? null
        : bloqueioRaw;

      let tipo = avisoElegivel({
        status: String(status),
        vencimento,
        bloqueio,
        agora,
      });

      // No White Label com cobrança pela Prosperity Pay, o e-mail do dia do
      // vencimento é enviado pela própria Pay. O CRM mantém o pré-vencimento,
      // o pós-vencimento a partir do 3º dia e os avisos de bloqueio.
      if (
        gestoraWhiteLabel &&
        cobrancaProsperityPay &&
        String(status) === "vencida"
      ) {
        const diasDesdeVencimento =
          (agora.getTime() - vencimento.getTime()) / DIA_MS;

        if (diasDesdeVencimento < 3) {
          tipo = null;
        }
      }

      const emails = Array.from(
        new Set(
          [
            String(empresa.email || "").trim(),
            ...(await buscarEmailsAdministradores(empresa.id)),
          ].filter(Boolean)
        )
      );

      if (
        !tipo ||
        emails.length === 0 ||
        Number.isNaN(vencimento.getTime())
      ) {
        resultado.ignorados += 1;
        continue;
      }

      await supabase
        .from("assinatura_avisos_email")
        .delete()
        .eq("empresa_id", empresa.id)
        .eq("tipo", tipo)
        .is("enviado_em", null)
        .lt(
          "created_at",
          new Date(agora.getTime() - 60 * 60 * 1000).toISOString()
        );

      const { data: historico, error: historicoErro } = await supabase
        .from("assinatura_avisos_email")
        .select("tentativa,enviado_em")
        .eq("empresa_id", empresa.id)
        .eq("tipo", tipo)
        .eq("vencimento_em", vencimento.toISOString())
        .not("enviado_em", "is", null)
        .order("enviado_em", { ascending: false });

      if (historicoErro) {
        throw new Error(historicoErro.message);
      }

      const enviados = historico || [];
      const ultimo = enviados[0]?.enviado_em
        ? new Date(enviados[0].enviado_em)
        : null;
      const limite = limiteEnviosPorTipo(tipo);

      if (
        enviados.length >= limite ||
        (ultimo && agora.getTime() - ultimo.getTime() < COOLDOWN_MS)
      ) {
        resultado.ignorados += 1;
        continue;
      }

      const tentativa = enviados.length + 1;

      const { data: reserva, error: reservaErro } = await supabase
        .from("assinatura_avisos_email")
        .insert({
          empresa_id: empresa.id,
          tipo,
          vencimento_em: vencimento.toISOString(),
          tentativa,
          destinatario: emails.join(", "),
        })
        .select("id")
        .maybeSingle();

      if (reservaErro || !reserva) {
        resultado.ignorados += 1;
        continue;
      }

      const plano = Array.isArray(empresa.planos)
        ? empresa.planos[0]
        : empresa.planos;

      let linkRenovacao = checkoutUrl(plano?.slug || null);

      try {
        const renovacao = await resolverCheckoutRenovacao({
          empresaId: empresa.id,
          planoSlugFallback: plano?.slug || null,
        });

        linkRenovacao = renovacao.motivoBloqueio
          ? null
          : renovacao.checkoutUrl || linkRenovacao;
      } catch (erroCheckout) {
        console.error(
          "[ASSINATURA_AVISOS] Erro ao resolver checkout de renovação",
          empresa.id,
          erroCheckout
        );
      }

      const enviado = await sendAssinaturaAvisoEmail({
        empresaId: empresa.id,
        to: emails,
        nome: String(
          empresa.nome_fantasia || empresa.razao_social || "Cliente"
        ),
        vencimentoEm: vencimento.toISOString(),
        tipo,
        checkoutUrl: linkRenovacao,
      });

      if (!enviado) {
        await supabase
          .from("assinatura_avisos_email")
          .delete()
          .eq("id", reserva.id);

        resultado.erros += 1;
        continue;
      }

      await supabase
        .from("assinatura_avisos_email")
        .update({
          enviado_em: agora.toISOString(),
          updated_at: agora.toISOString(),
        })
        .eq("id", reserva.id);

      resultado.enviados += 1;
    } catch (erro) {
      console.error(
        "[ASSINATURA_AVISOS] Erro ao processar empresa",
        empresa.id,
        erro
      );
      resultado.erros += 1;
    }
  }

  return resultado;
}
