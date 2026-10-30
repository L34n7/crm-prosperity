import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  TEXTO_CONFIRMACAO_PROGRAMA,
  VERSAO_CONTRATO_RESPONSABILIDADES,
  VERSAO_POLITICA_PRIVACIDADE,
  VERSAO_TERMOS_SERVICO,
} from "@/lib/lgpd/termos";

export const VERSAO_ACEITE_PROGRAMA = VERSAO_TERMOS_SERVICO;

export async function empresaPrecisaConfirmarPrograma(empresaId: string) {
  const db = getSupabaseAdmin();

  const { data: empresa, error: erroEmpresa } = await db
    .from("empresas")
    .select("termo_aceite,termo_aceite_versao")
    .eq("id", empresaId)
    .maybeSingle();

  if (erroEmpresa) throw new Error(erroEmpresa.message);
  if (!empresa) return false;

  // O cadastro novo já registra o texto e a versão dos Termos em empresas.
  if (
    empresa.termo_aceite === true &&
    empresa.termo_aceite_versao === VERSAO_ACEITE_PROGRAMA
  ) {
    return false;
  }

  const { data, error } = await db
    .from("programa_aceites")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("versao_termos", VERSAO_ACEITE_PROGRAMA)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !data;
}

export async function registrarAceitePrograma(params: {
  empresaId: string;
  usuarioId: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const db = getSupabaseAdmin();
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        versao: VERSAO_ACEITE_PROGRAMA,
        texto: TEXTO_CONFIRMACAO_PROGRAMA,
        politica: VERSAO_POLITICA_PRIVACIDADE,
        mensageria: VERSAO_CONTRATO_RESPONSABILIDADES,
      }),
    )
    .digest("hex");

  const { error: insertError } = await db
    .from("programa_aceites")
    .upsert(
      {
        empresa_id: params.empresaId,
        usuario_id: params.usuarioId,
        versao_termos: VERSAO_ACEITE_PROGRAMA,
        versao_privacidade: VERSAO_POLITICA_PRIVACIDADE,
        versao_mensageria: VERSAO_CONTRATO_RESPONSABILIDADES,
        texto_aceite: TEXTO_CONFIRMACAO_PROGRAMA,
        hash_aceite_sha256: hash,
        ip: params.ip,
        user_agent: params.userAgent,
        origem: "modal_admin",
      },
      {
        onConflict: "empresa_id,versao_termos",
        ignoreDuplicates: true,
      },
    );

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { data, error: readError } = await db
    .from("programa_aceites")
    .select("id,empresa_id,usuario_id,versao_termos,aceito_em")
    .eq("empresa_id", params.empresaId)
    .eq("versao_termos", VERSAO_ACEITE_PROGRAMA)
    .single();

  if (readError || !data) {
    throw new Error(readError?.message || "Não foi possível confirmar o registro do aceite.");
  }

  // Não sobrescrever o histórico de aceites anteriores em empresas.
  return data;
}
