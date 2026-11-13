import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  MAX_MATERIAIS_POR_VINCULO,
  MAX_CONHECIMENTOS_POR_MATERIAL,
  UUID_MATERIAL,
  normalizarMateriais,
  type MaterialVinculado,
} from "./materiais-config";

/** Verifica rigorosamente os IDs no tenant, inclusive para requests de edição. */
export async function validarMateriaisEmpresa(
  empresaId: string,
  valor: unknown,
): Promise<MaterialVinculado[]> {
  if (valor == null) return [];
  if (!Array.isArray(valor) || valor.length > MAX_MATERIAIS_POR_VINCULO) {
    throw new Error("Selecione no máximo "+MAX_MATERIAIS_POR_VINCULO+" materiais válidos da biblioteca.");
  }
  const materiais = normalizarMateriais(valor);
  if (materiais.length !== valor.length) {
    throw new Error("Cada material precisa de um arquivo válido e uma regra de envio, sem repetições.");
  }
  if (!materiais.length) return materiais;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("midias")
    .select("id, url")
    .eq("empresa_id", empresaId)
    .in("tipo", ["imagem", "video", "audio", "arquivo"])
    .in("id", materiais.map((item) => item.midia_id));
  if (error) throw new Error(error.message);
  const validos = new Set(
    (data || []).filter((item) => Boolean(item.url)).map((item) => String(item.id)),
  );
  if (materiais.some((item) => !validos.has(item.midia_id))) {
    throw new Error("Um dos arquivos não pertence à empresa ou não está disponível na biblioteca.");
  }
  return materiais;
}


/** Garante que cada vínculo a conhecimento pertence AO MESMO AGENTE E TENANT.
 * Rejeita IDs inválidos e duplicados sem descartá-los silenciosamente. */
export async function validarMateriaisFerramenta(
  empresaId:string,agenteId:string,valor:unknown,
):Promise<MaterialVinculado[]>{
  const materiais=await validarMateriaisEmpresa(empresaId,valor);
  if(!Array.isArray(valor))return materiais;
  const ids=new Set<string>();
  for(const item of valor as Array<Record<string,unknown>>){
    const lista=item.conhecimento_ids;
    if(lista===undefined)continue;
    if(!Array.isArray(lista)||lista.length>MAX_CONHECIMENTOS_POR_MATERIAL
      ||lista.some(v=>typeof v!=="string"||!UUID_MATERIAL.test(v))
      ||new Set(lista).size!==lista.length)
      throw new Error("Os conhecimentos de cada material devem ser únicos e válidos.");
    lista.forEach(id=>ids.add(String(id)));
  }
  if(!ids.size)return materiais;
  const supabase=getSupabaseAdmin();
  const {data,error}=await supabase.from("agente_ia_conhecimentos")
    .select("id").eq("empresa_id",empresaId).eq("agente_id",agenteId)
    .eq("ativo",true).in("id",[...ids]);
  if(error)throw new Error(error.message);
  const validos=new Set((data||[]).map(item=>String(item.id)));
  if([...ids].some(id=>!validos.has(id)))
    throw new Error("Um dos conhecimentos vinculados não pertence a este agente ou foi excluído.");
  return materiais;
}
