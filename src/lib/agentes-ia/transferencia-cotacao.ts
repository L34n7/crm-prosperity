import "server-only";

import {getSupabaseAdmin} from "@/lib/supabase/admin";
import {resolverAtribuicaoTransferencia} from "@/lib/conversas/resolver-atribuicao-transferencia";
import {listarPlanosEmpresa} from "@/lib/cotacoes-veiculares/configuracao";

const admin=getSupabaseAdmin();

export type PlanoInteresseCotacao={codigo:string;nome:string};

/** Apenas os planos que fizeram parte da proposta mais recente desta conversa.
 * O ordenamento acompanha o comparativo efetivamente exibido ao cliente.
 */
export async function planosDaUltimaCotacaoVeicular(params:{
  empresaId:string;conversaId:string;
}):Promise<PlanoInteresseCotacao[]>{
  const {data:ultima,error:erroUltima}=await admin.from("cotacao_veicular_cotacoes")
    .select("id,grupo_id").eq("empresa_id",params.empresaId)
    .eq("conversa_id",params.conversaId).eq("origem","agente_ia")
    .order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(erroUltima)throw new Error(erroUltima.message);
  if(!ultima)return [];
  const consulta=admin.from("cotacao_veicular_cotacoes").select("plano,plano_nome")
    .eq("empresa_id",params.empresaId).eq("conversa_id",params.conversaId);
  const {data:linhas,error:erroPlanos}=await (ultima.grupo_id
    ?consulta.eq("grupo_id",ultima.grupo_id)
    :consulta.eq("id",ultima.id));
  if(erroPlanos)throw new Error(erroPlanos.message);
  const atual=new Map((linhas||[]).map(l=>[String(l.plano||""),{
    codigo:String(l.plano||""),nome:String(l.plano_nome||l.plano||""),
  }]));
  const ordenacao=await listarPlanosEmpresa(params.empresaId);
  const resultado=ordenacao.filter(plano=>atual.has(plano.codigo))
    .map(plano=>atual.get(plano.codigo)!);
  for(const plano of atual.values())
    if(!resultado.some(x=>x.codigo===plano.codigo))resultado.push(plano);
  return resultado;
}

/** Impede transferir um interesse genérico em contratar quando não houve
 * cotação veicular nesta conversa. Não modifica nem duplica cotações.
 */
export async function conversaPossuiCotacaoVeicular(params:{
  empresaId:string;conversaId:string;
}):Promise<boolean>{
  const {data,error}=await admin.from("cotacao_veicular_cotacoes")
    .select("id")
    .eq("empresa_id",params.empresaId)
    .eq("conversa_id",params.conversaId)
    .eq("origem","agente_ia")
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error)throw new Error(error.message);
  return Boolean(data?.id);
}

export type ResultadoTransferenciaContratacao={
  transferido:boolean;
  jaEstavaComHumano?:boolean;
  setorNome?:string|null;
  setorId?:string|null;
  responsavelId?:string|null;
};

/** Encaminha para fila humana conforme o modelo da transferência do CRM.
 * Prioriza setor configurado no fallback quando indicado; caso contrário,
 * o setor Comercial/Vendas ativo e, se não houver, a fila geral.
 */
export async function transferirContratacaoCotacao(params:{
  empresaId:string;
  conversaId:string;
  agenteId:string;
  configuracao?:Record<string,unknown>|null;
}):Promise<ResultadoTransferenciaContratacao>{
  const cfg=params.configuracao||{};
  const idBruto=String(cfg.setor_id||"").trim();
  const idConfigurado=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idBruto)?idBruto:"";
  let setorId:string|null=null;
  let setorNome:string|null=null;

  if(idConfigurado){
    const {data,error}=await admin.from("setores")
      .select("id,nome").eq("empresa_id",params.empresaId)
      .eq("id",idConfigurado).eq("ativo",true).eq("status","ativo")
      .maybeSingle();
    if(error)throw new Error(error.message);
    if(data){setorId=data.id;setorNome=data.nome;}
  }

  if(!setorId){
    const {data,error}=await admin.from("setores")
      .select("id,nome").eq("empresa_id",params.empresaId)
      .eq("ativo",true).eq("status","ativo")
      .or("nome.ilike.%comercial%,nome.ilike.%vendas%")
      .order("nome",{ascending:true})
      .limit(10);
    if(error)throw new Error(error.message);
    const comercial=(data||[]).find(s=>/comercial/i.test(s.nome))||data?.[0];
    if(comercial){setorId=comercial.id;setorNome=comercial.nome;}
  }

  const atribuicao=await resolverAtribuicaoTransferencia({
    empresaId:params.empresaId,
    setorId,
    escopoFila:setorId?"setor":"geral",
    estrategia:setorId&&idConfigurado
      ?cfg.estrategia_transferencia:"fila_setor",
    atendenteId:setorId&&idConfigurado?cfg.atendente_id:null,
    incluirAdministradores:cfg.incluir_administradores_distribuicao,
  });

  const agora=new Date().toISOString();
  const {data,error}=await admin.from("conversas")
    .update({
      setor_id:atribuicao.setorId,
      escopo_fila:atribuicao.escopoFila,
      status:atribuicao.responsavelId?"em_atendimento":"fila",
      responsavel_id:atribuicao.responsavelId,
      bot_ativo:false,
      aguardando_atendente:!atribuicao.responsavelId,
      agente_ia_id:null,
      agente_ia_fallback_ativo:false,
      updated_at:agora,
    })
    .eq("empresa_id",params.empresaId)
    .eq("id",params.conversaId)
    .eq("bot_ativo",true)
    .select("id")
    .maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)return {transferido:false,jaEstavaComHumano:true};
  return {
    transferido:true,
    setorId:atribuicao.setorId,
    setorNome,
    responsavelId:atribuicao.responsavelId,
  };
}
