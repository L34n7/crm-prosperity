import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const AVISO_META_WHATSAPP_COBRANCA_2026_10 =
  "meta_whatsapp_cobranca_2026_10";

export async function usuarioConfirmouAvisoMetaWhatsapp(
  usuarioId: string
): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("usuarios_avisos_confirmados")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("aviso_codigo", AVISO_META_WHATSAPP_COBRANCA_2026_10)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(
      `Erro ao consultar confirmacao do aviso da Meta: ${error.message}`
    );
  }

  return Boolean(data?.id);
}

export async function confirmarAvisoMetaWhatsapp(params: {
  usuarioId: string;
  empresaId: string;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const confirmadoEm = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("usuarios_avisos_confirmados")
    .upsert(
      {
        usuario_id: params.usuarioId,
        empresa_id: params.empresaId,
        aviso_codigo: AVISO_META_WHATSAPP_COBRANCA_2026_10,
        confirmado_em: confirmadoEm,
      },
      {
        onConflict: "usuario_id,aviso_codigo",
      }
    );

  if (error) {
    throw new Error(
      `Erro ao salvar confirmacao do aviso da Meta: ${error.message}`
    );
  }

  return confirmadoEm;
}
