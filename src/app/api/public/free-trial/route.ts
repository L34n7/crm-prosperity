import { NextResponse } from "next/server";
import { enviarPrimeiroAcesso } from "@/lib/auth/enviar-primeiro-acesso";
import { publicarEventoAgendadoQstash } from "@/lib/eventos-db/qstash";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();
const TRIAL_DIAS = 4;
const DIA_MS = 24 * 60 * 60 * 1000;

function metadataObj(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const leadId = String(body?.lead_id ?? "").trim();

    if (!leadId) {
      throw new Error("Cadastro do teste não informado.");
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads_cadastro")
      .select(
        "id,nome,email,telefone,empresa,nicho_id,empresa_id,pago,plano_slug,metadata_json,termo_aceite,termo_aceite_em,termo_aceite_ip,termo_aceite_user_agent,termo_aceite_versao,politica_privacidade_versao,contrato_responsabilidades_versao,termo_aceite_texto"
      )
      .eq("id", leadId)
      .maybeSingle();

    if (leadError || !lead) {
      throw new Error("Cadastro do teste não encontrado.");
    }

    const leadMetadata = metadataObj(lead.metadata_json);

    if (leadMetadata.free_trial_4d !== true) {
      throw new Error("Este cadastro não pertence ao Free Trial de 4 dias.");
    }

    if (lead.pago === true) {
      throw new Error("Este cadastro já possui pagamento confirmado.");
    }

    const email = String(lead.email || "").trim().toLowerCase();
    const telefone = String(lead.telefone || "").replace(/\D/g, "");

    if (!email || !telefone) {
      throw new Error("Cadastro sem e-mail ou telefone pessoal válido.");
    }

    const { data: usuarioExistente, error: usuarioError } = await supabase
      .from("usuarios")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (usuarioError) {
      throw new Error("Não foi possível validar o usuário do teste.");
    }

    if (usuarioExistente) {
      throw new Error(
        "Já existe uma conta com este e-mail. Faça login ou recupere sua senha."
      );
    }

    const { data: plano, error: planoError } = await supabase
      .from("planos")
      .select("id,slug,nome")
      .eq("slug", "basico")
      .eq("status", "ativo")
      .maybeSingle();

    if (planoError || !plano) {
      throw new Error("Plano Básico não está disponível para o teste.");
    }

    let empresaTrial: {
      id: string;
      assinatura_vencimento_em: string | null;
      assinatura_metadata_json: Record<string, unknown> | null;
    } | null = null;

    if (lead.empresa_id) {
      const { data: empresaVinculada, error: empresaVinculadaError } =
        await supabase
          .from("empresas")
          .select(
            "id,assinatura_vencimento_em,assinatura_gateway,assinatura_metadata_json"
          )
          .eq("id", lead.empresa_id)
          .maybeSingle();

      if (empresaVinculadaError || !empresaVinculada) {
        throw new Error("Empresa do teste não encontrada.");
      }

      const empresaMetadata = metadataObj(
        empresaVinculada.assinatura_metadata_json
      );
      const ehTrial =
        empresaVinculada.assinatura_gateway === "free_trial_4d" ||
        empresaMetadata.free_trial_4d === true;

      if (!ehTrial) {
        throw new Error("Este cadastro já está vinculado a uma empresa.");
      }

      empresaTrial = empresaVinculada;
    } else {
      const { data: empresaExistente, error: empresaExistenteError } =
        await supabase
          .from("empresas")
          .select("id")
          .ilike("email", email)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

      if (empresaExistenteError) {
        throw new Error("Não foi possível validar a empresa do teste.");
      }

      if (empresaExistente) {
        throw new Error(
          "Já existe uma empresa vinculada a este e-mail. Faça login para continuar."
        );
      }

      const inicio = new Date();
      const fim = new Date(inicio.getTime() + TRIAL_DIAS * DIA_MS);
      const affiliateRef =
        typeof leadMetadata.affiliate_ref === "string"
          ? leadMetadata.affiliate_ref
          : null;
      const assinaturaMetadata = {
        origem: "free_trial_4d",
        free_trial_4d: true,
        trial_dias: TRIAL_DIAS,
        trial_inicio_em: inicio.toISOString(),
        trial_fim_em: fim.toISOString(),
        plano_slug: "basico",
        tipo_oferta: affiliateRef ? "af" : "normal",
        affiliate_ref: affiliateRef,
        affiliate_source: leadMetadata.affiliate_source ?? null,
        affiliate_membership_id:
          leadMetadata.affiliate_membership_id ?? null,
      };

      const { data: empresaCriada, error: empresaError } = await supabase
        .from("empresas")
        .insert({
          plano_id: plano.id,
          nicho_id:
            lead.nicho_id ?? "10000000-0000-4000-8000-000000000001",
          nome_fantasia:
            String(lead.empresa || "").trim() ||
            String(lead.nome || "").trim() ||
            "Cliente Free Trial",
          razao_social:
            String(lead.empresa || "").trim() ||
            String(lead.nome || "").trim() ||
            "Cliente Free Trial",
          email,
          telefone,
          nome_responsavel: String(lead.nome || "").trim() || null,
          status: "ativa",
          timezone: "America/Sao_Paulo",
          observacoes: "Criada automaticamente via Free Trial de 4 dias",
          assinatura_status: "ativa",
          assinatura_inicio_em: inicio.toISOString(),
          assinatura_vencimento_em: fim.toISOString(),
          assinatura_bloqueio_em: fim.toISOString(),
          assinatura_renovada_em: null,
          assinatura_gateway: "free_trial_4d",
          assinatura_referencia: `free_trial_4d:${lead.id}`,
          assinatura_metadata_json: assinaturaMetadata,
          assinatura_fluxos_pausados_em: null,
          termo_aceite: lead.termo_aceite ?? false,
          termo_aceite_em: lead.termo_aceite_em ?? null,
          termo_aceite_ip: lead.termo_aceite_ip ?? null,
          termo_aceite_user_agent: lead.termo_aceite_user_agent ?? null,
          termo_aceite_versao: lead.termo_aceite_versao ?? null,
          politica_privacidade_versao:
            lead.politica_privacidade_versao ?? null,
          contrato_responsabilidades_versao:
            lead.contrato_responsabilidades_versao ?? null,
          termo_aceite_texto: lead.termo_aceite_texto ?? null,
        })
        .select(
          "id,assinatura_vencimento_em,assinatura_metadata_json"
        )
        .single();

      if (empresaError || !empresaCriada) {
        console.error("[FREE_TRIAL_4D] Erro ao criar empresa:", empresaError);
        throw new Error("Não foi possível criar a empresa do teste.");
      }

      empresaTrial = empresaCriada;

      const { error: tokenError } = await supabase.rpc(
        "sincronizar_empresa_tokens_ia",
        { p_empresa_id: empresaTrial.id }
      );

      if (tokenError) {
        throw new Error(
          `Não foi possível liberar os tokens do teste: ${tokenError.message}`
        );
      }

      const metadataAtualizado = {
        ...leadMetadata,
        free_trial_4d: true,
        trial_dias: TRIAL_DIAS,
        trial_plano_slug: "basico",
        trial_inicio_em: inicio.toISOString(),
        trial_fim_em: fim.toISOString(),
      };

      const { error: leadUpdateError } = await supabase
        .from("leads_cadastro")
        .update({
          empresa_id: empresaTrial.id,
          plano_slug: "basico",
          metadata_json: metadataAtualizado,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      if (leadUpdateError) {
        throw new Error("Não foi possível vincular o teste ao cadastro.");
      }
    }

    if (!empresaTrial) {
      throw new Error("Não foi possível concluir a criação da empresa do teste.");
    }

    const fimTrial = String(
      empresaTrial.assinatura_vencimento_em || ""
    ).trim();

    if (!fimTrial || !Number.isFinite(Date.parse(fimTrial))) {
      throw new Error("Data final do teste gratuito é inválida.");
    }

    const agendamentoExpiracao = await publicarEventoAgendadoQstash({
      tipo: "free_trial_expirar",
      id: empresaTrial.id,
      executarEm: fimTrial,
    });

    if (!agendamentoExpiracao.ok) {
      console.error(
        "[FREE_TRIAL_4D] Falha ao agendar expiração:",
        agendamentoExpiracao.erro
      );
      throw new Error(
        "Não foi possível agendar o encerramento automático do teste. Tente novamente."
      );
    }

    const metadataMaisRecente =
      lead.empresa_id
        ? leadMetadata
        : {
            ...leadMetadata,
            trial_inicio_em:
              metadataObj(empresaTrial?.assinatura_metadata_json)
                .trial_inicio_em ?? leadMetadata.trial_inicio_em,
            trial_fim_em:
              metadataObj(empresaTrial?.assinatura_metadata_json).trial_fim_em ??
              leadMetadata.trial_fim_em,
          };

    if (!metadataMaisRecente.trial_acesso_enviado_em) {
      await enviarPrimeiroAcesso({
        email,
        nome: String(lead.nome || "").trim() || "Cliente",
        empresaId: empresaTrial.id,
        telefone,
      });

      const agora = new Date().toISOString();
      const { error: acessoUpdateError } = await supabase
        .from("leads_cadastro")
        .update({
          metadata_json: {
            ...metadataMaisRecente,
            free_trial_4d: true,
            trial_acesso_enviado_em: agora,
          },
          updated_at: agora,
        })
        .eq("id", lead.id);

      if (acessoUpdateError) {
        console.error(
          "[FREE_TRIAL_4D] Acesso enviado, mas falhou ao registrar envio:",
          acessoUpdateError
        );
      }
    }

    return NextResponse.json({
      ok: true,
      empresa_id: empresaTrial.id,
      plano_slug: "basico",
      trial_dias: TRIAL_DIAS,
      trial_fim_em: empresaTrial.assinatura_vencimento_em,
      affiliate_ref:
        typeof leadMetadata.affiliate_ref === "string"
          ? leadMetadata.affiliate_ref
          : null,
    });
  } catch (error) {
    console.error("[FREE_TRIAL_4D] Erro ao ativar teste:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao ativar teste gratuito.",
      },
      { status: 400 }
    );
  }
}
