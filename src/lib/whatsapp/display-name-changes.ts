import { createClient } from "@/lib/supabase/server";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { getWhatsAppGraphUrl } from "@/lib/whatsapp/graph-api";
import { decryptText } from "@/lib/security/crypto";


const GRAPH_VERSION = "v23.0";

type IntegracaoWhatsapp = {
  id: string;
  empresa_id: string;
  nome_conexao: string | null;
  numero: string | null;
  provider: string | null;
  modo_integracao: string | null;
  phone_number_id: string | null;
  token_ref: string | null;
  pin_encrypted: string | null;
  verified_name?: string | null;
  config_json: any;
};

type DisplayNameChange = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id: string;
  phone_number_id: string;
  nome_solicitado: string;
  tentativas_verificacao: number;
  max_tentativas: number;
};

function objetoConfig(configJson: any) {
  return configJson && typeof configJson === "object" && !Array.isArray(configJson)
    ? configJson
    : {};
}

function normalizarTexto(valor?: string | null) {
  return String(valor || "").trim().toLowerCase();
}

function nomesIguais(a?: string | null, b?: string | null) {
  return normalizarTexto(a) === normalizarTexto(b);
}

function statusProntoParaRegistro(status?: string | null) {
  return ["APPROVED", "AVAILABLE_WITHOUT_REVIEW"].includes(
    String(status || "").trim().toUpperCase()
  );
}

function calcularProximaTentativa(tentativas: number) {
  const minutos = tentativas < 5 ? 10 : 60;
  return new Date(Date.now() + minutos * 60 * 1000).toISOString();
}

async function consultarStatusNome(params: {
  phoneNumberId: string;
  token: string;
}) {
  const { phoneNumberId, token } = params;

  const res = await fetch(
    getWhatsAppGraphUrl(
      `${phoneNumberId}?fields=verified_name,name_status,new_name_status,new_certificate,display_phone_number`
    ),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const json = await res.json();

  return {
    ok: res.ok,
    status: res.status,
    json,
  };
}

async function registrarNumero(params: {
  phoneNumberId: string;
  token: string;
  pin: string;
}) {
  const { phoneNumberId, token, pin } = params;

  const res = await fetch(
    getWhatsAppGraphUrl(`${phoneNumberId}/register`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        pin,
      }),
    }
  );

  const json = await res.json();

  return {
    ok: res.ok,
    status: res.status,
    json,
  };
}

function extrairPin(integracao: IntegracaoWhatsapp) {
  if (!integracao.pin_encrypted) {
    return null;
  }

  try {
    const pin = decryptText(integracao.pin_encrypted);
    const pinNormalizado = String(pin || "").trim();

    if (!/^\d{6}$/.test(pinNormalizado)) {
      console.error("[WHATSAPP DISPLAY NAME] PIN descriptografado inválido:", {
        integracaoId: integracao.id,
      });

      return null;
    }

    return pinNormalizado;
  } catch (error) {
    console.error("[WHATSAPP DISPLAY NAME] Erro ao descriptografar PIN:", {
      integracaoId: integracao.id,
      error,
    });

    return null;
  }
}

export async function processarAlteracoesNomeWhatsappPendentes(params?: {
  limite?: number;
}) {
  const limite = params?.limite || 10;
  const supabase = await createClient();
  const agoraIso = new Date().toISOString();

  const { data: pendencias, error: pendenciasError } = await supabase
    .from("whatsapp_display_name_changes")
    .select(
      "id, empresa_id, integracao_whatsapp_id, phone_number_id, nome_solicitado, tentativas_verificacao, max_tentativas"
    )
    .eq("auto_aplicar", true)
    .eq("precisa_registro", true)
    .in("status", [
      "solicitado",
      "em_analise",
      "aguardando_liberacao_meta",
      "erro_verificacao",
      "pronto_para_registro",
    ])
    .lte("proxima_verificacao_em", agoraIso)
    .order("proxima_verificacao_em", { ascending: true })
    .limit(limite);

  if (pendenciasError) {
    console.error("[WHATSAPP DISPLAY NAME] Erro ao buscar pendências:", pendenciasError);

    return {
      ok: false,
      error: pendenciasError.message,
      processados: 0,
      resultados: [],
    };
  }

  const resultados: any[] = [];

  for (const pendencia of (pendencias || []) as DisplayNameChange[]) {
    const { data: integracao, error: integracaoError } = await supabase
      .from("integracoes_whatsapp")
      .select(
        "id, empresa_id, nome_conexao, numero, provider, modo_integracao, phone_number_id, token_ref, pin_encrypted, verified_name, config_json"
      )
      .eq("id", pendencia.integracao_whatsapp_id)
      .eq("empresa_id", pendencia.empresa_id)
      .maybeSingle<IntegracaoWhatsapp>();

    if (integracaoError || !integracao) {
      await supabase
        .from("whatsapp_display_name_changes")
        .update({
          status: "erro_verificacao",
          ultimo_erro: {
            message: "Integração não encontrada.",
            error: integracaoError,
          },
          tentativas_verificacao: pendencia.tentativas_verificacao + 1,
          proxima_verificacao_em: calcularProximaTentativa(
            pendencia.tentativas_verificacao + 1
          ),
          updated_at: agoraIso,
        })
        .eq("id", pendencia.id);

      resultados.push({
        id: pendencia.id,
        ok: false,
        motivo: "integracao_nao_encontrada",
      });

      continue;
    }

    if (integracao.modo_integracao === "coexistence") {
      await supabase
        .from("whatsapp_display_name_changes")
        .update({
          status: "cancelado",
          auto_aplicar: false,
          precisa_registro: false,
          ultimo_erro: {
            message:
              "Integração por coexistência. Alteração automática não será aplicada pelo CRM.",
          },
          cancelado_em: agoraIso,
          updated_at: agoraIso,
        })
        .eq("id", pendencia.id);

      resultados.push({
        id: pendencia.id,
        ok: false,
        motivo: "coexistence",
      });

      continue;
    }

    const token = getWhatsAppAccessToken(integracao, {
      allowGlobalFallback: false,
    });

    if (!token || !integracao.phone_number_id) {
      await supabase
        .from("whatsapp_display_name_changes")
        .update({
          status: "erro_verificacao",
          ultimo_erro: {
            message: "Token ou phone_number_id ausente.",
          },
          tentativas_verificacao: pendencia.tentativas_verificacao + 1,
          proxima_verificacao_em: calcularProximaTentativa(
            pendencia.tentativas_verificacao + 1
          ),
          updated_at: agoraIso,
        })
        .eq("id", pendencia.id);

      resultados.push({
        id: pendencia.id,
        ok: false,
        motivo: "sem_token_ou_phone_number_id",
      });

      continue;
    }

    const statusMeta = await consultarStatusNome({
      phoneNumberId: integracao.phone_number_id,
      token,
    });

    if (!statusMeta.ok) {
      await supabase
        .from("whatsapp_display_name_changes")
        .update({
          status: "erro_verificacao",
          ultimo_erro: statusMeta.json,
          tentativas_verificacao: pendencia.tentativas_verificacao + 1,
          proxima_verificacao_em: calcularProximaTentativa(
            pendencia.tentativas_verificacao + 1
          ),
          meta_status_response: statusMeta.json,
          updated_at: agoraIso,
        })
        .eq("id", pendencia.id);

      resultados.push({
        id: pendencia.id,
        ok: false,
        motivo: "erro_status_meta",
        meta: statusMeta.json,
      });

      continue;
    }

    const verifiedName = String(statusMeta.json?.verified_name || "");
    const nameStatus = String(statusMeta.json?.name_status || "");
    const newNameStatus = String(statusMeta.json?.new_name_status || "");
    const displayPhoneNumber = String(statusMeta.json?.display_phone_number || "");

    if (nomesIguais(verifiedName, pendencia.nome_solicitado)) {
      await supabase
        .from("whatsapp_display_name_changes")
        .update({
          status: "aplicado",
          nome_atual_meta: verifiedName,
          name_status: nameStatus,
          new_name_status: newNameStatus,
          display_phone_number: displayPhoneNumber,
          precisa_registro: false,
          auto_aplicar: false,
          aplicado_em: agoraIso,
          meta_status_response: statusMeta.json,
          updated_at: agoraIso,
        })
        .eq("id", pendencia.id);

      await supabase
        .from("integracoes_whatsapp")
        .update({
          verified_name: verifiedName,
          ultimo_sync_at: agoraIso,
          updated_at: agoraIso,
        })
        .eq("id", integracao.id)
        .eq("empresa_id", integracao.empresa_id);

      resultados.push({
        id: pendencia.id,
        ok: true,
        status: "ja_aplicado",
        verified_name: verifiedName,
      });

      continue;
    }

    if (!statusProntoParaRegistro(newNameStatus)) {
      await supabase
        .from("whatsapp_display_name_changes")
        .update({
          status: "aguardando_liberacao_meta",
          nome_atual_meta: verifiedName,
          name_status: nameStatus,
          new_name_status: newNameStatus,
          display_phone_number: displayPhoneNumber,
          tentativas_verificacao: pendencia.tentativas_verificacao + 1,
          proxima_verificacao_em: calcularProximaTentativa(
            pendencia.tentativas_verificacao + 1
          ),
          meta_status_response: statusMeta.json,
          updated_at: agoraIso,
        })
        .eq("id", pendencia.id);

      resultados.push({
        id: pendencia.id,
        ok: true,
        status: "aguardando_liberacao_meta",
        new_name_status: newNameStatus,
      });

      continue;
    }

    const pin = extrairPin(integracao);

    if (!pin) {
      await supabase
        .from("whatsapp_display_name_changes")
        .update({
          status: "aprovado_pendente_pin",
          nome_atual_meta: verifiedName,
          name_status: nameStatus,
          new_name_status: newNameStatus,
          display_phone_number: displayPhoneNumber,
          auto_aplicar: false,
          precisa_registro: true,
          meta_status_response: statusMeta.json,
          ultimo_erro: {
            message:
              "PIN não encontrado. Informe o PIN para aplicar o nome aprovado.",
          },
          updated_at: agoraIso,
        })
        .eq("id", pendencia.id);

      resultados.push({
        id: pendencia.id,
        ok: false,
        motivo: "pin_nao_encontrado",
      });

      continue;
    }

    const registerMeta = await registrarNumero({
      phoneNumberId: integracao.phone_number_id,
      token,
      pin,
    });

    if (!registerMeta.ok) {
      await supabase
        .from("whatsapp_display_name_changes")
        .update({
          status: "erro_ao_aplicar",
          nome_atual_meta: verifiedName,
          name_status: nameStatus,
          new_name_status: newNameStatus,
          display_phone_number: displayPhoneNumber,
          auto_aplicar: false,
          precisa_registro: true,
          register_response: registerMeta.json,
          ultimo_erro: registerMeta.json,
          updated_at: agoraIso,
        })
        .eq("id", pendencia.id);

      resultados.push({
        id: pendencia.id,
        ok: false,
        motivo: "erro_register",
        meta: registerMeta.json,
      });

      continue;
    }

    const statusDepoisRegister = await consultarStatusNome({
      phoneNumberId: integracao.phone_number_id,
      token,
    });

    const verifiedNameFinal =
      statusDepoisRegister.ok && statusDepoisRegister.json?.verified_name
        ? String(statusDepoisRegister.json.verified_name)
        : verifiedName;

    const aplicado = nomesIguais(
      verifiedNameFinal,
      pendencia.nome_solicitado
    );

    await supabase
      .from("whatsapp_display_name_changes")
      .update({
        status: aplicado ? "aplicado" : "registro_enviado",
        nome_atual_meta: verifiedNameFinal,
        name_status: statusDepoisRegister.json?.name_status || nameStatus,
        new_name_status:
          statusDepoisRegister.json?.new_name_status || newNameStatus,
        display_phone_number:
          statusDepoisRegister.json?.display_phone_number || displayPhoneNumber,
        precisa_registro: false,
        auto_aplicar: false,
        aplicado_em: aplicado ? agoraIso : null,
        register_response: registerMeta.json,
        meta_status_response: statusDepoisRegister.json,
        updated_at: agoraIso,
      })
      .eq("id", pendencia.id);

    await supabase
      .from("integracoes_whatsapp")
      .update({
        verified_name: verifiedNameFinal,
        ultimo_sync_at: agoraIso,
        updated_at: agoraIso,
      })
      .eq("id", integracao.id)
      .eq("empresa_id", integracao.empresa_id);

    resultados.push({
      id: pendencia.id,
      ok: true,
      status: aplicado ? "aplicado" : "registro_enviado",
      verified_name_final: verifiedNameFinal,
    });
  }

  return {
    ok: true,
    processados: resultados.length,
    resultados,
  };
}