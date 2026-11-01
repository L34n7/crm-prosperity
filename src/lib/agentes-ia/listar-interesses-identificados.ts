import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  consolidarInteressesIdentificadosIa,
  type CapturaInteresseIa,
  type EstadoInteressesIa,
} from "./interesses-identificados";

/**
 * Somente chamar após verificar autenticação, permissão, empresa e contato.
 * Consultas service_role sempre têm filtros explícitos de empresa e contato.
 */
export async function listarInteressesIdentificadosContato(
  empresaId: string,
  contatoId: string
) {
  const supabase = getSupabaseAdmin();

  // O limite evita listas de UUIDs ilimitadas no PostgREST.
  // A ordenação dá prioridade às conversas mais recentes.
  const { data: conversas, error: conversasError } = await supabase
    .from("conversas")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("contato_id", contatoId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (conversasError) throw new Error(conversasError.message);

  const ids = (conversas || []).map((item) => String(item.id));
  const autorizadas = new Set(ids);

  const [capturasResultado, estadosResultado] = await Promise.all([
    supabase
      .from("contato_informacoes_captura")
      .select("id,valor,capturado_em,metadata_json")
      .eq("empresa_id", empresaId)
      .eq("contato_id", contatoId)
      .eq("variavel_origem", "agente_ia_interesse_preferencia")
      .eq("ativo", true)
      .order("capturado_em", { ascending: false })
      .limit(300),
    ids.length
      ? supabase
          .from("agente_ia_conversa_estados")
          .select("conversa_id,updated_at,estado_json")
          .eq("empresa_id", empresaId)
          .in("conversa_id", ids)
          .order("updated_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as EstadoInteressesIa[], error: null }),
  ]);
  if (capturasResultado.error) throw new Error(capturasResultado.error.message);
  if (estadosResultado.error) throw new Error(estadosResultado.error.message);

  return consolidarInteressesIdentificadosIa(
    (estadosResultado.data || []) as EstadoInteressesIa[],
    (capturasResultado.data || []) as CapturaInteresseIa[],
    autorizadas
  );
}
