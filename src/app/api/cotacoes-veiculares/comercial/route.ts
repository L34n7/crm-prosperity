import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  categoriaValida, configuracaoCotacao,
} from "@/lib/cotacoes-veiculares/servico";
import { listarRegrasComerciais, listarPlanosEmpresa, statusConfiguracaoCotacao } from "@/lib/cotacoes-veiculares/configuracao";
import {validarCondicoesContratacao} from "@/lib/cotacoes-veiculares/condicoes-contratacao";
import {
  regraVazia, type OpcionalComercial, type RegraComercialPlano, validarRegraComercial,
  USOS_VEICULO, ENERGIAS_VEICULO,
} from "@/lib/cotacoes-veiculares/comercial";

async function acesso() {
  const ctx=await getUsuarioContexto();
  if(!ctx.ok)return {erro:NextResponse.json({ok:false,error:ctx.error},{status:ctx.status})};
  const empresaId=ctx.usuario.empresa_id;
  if(!empresaId)return {erro:NextResponse.json({ok:false,error:"Empresa não encontrada."},{status:403})};
  const nicho=await buscarNichoEmpresa(empresaId);
  if(nicho.codigo!=="seguro_veicular")return {erro:NextResponse.json({ok:false,error:"Nicho não autorizado."},{status:403})};
  const permissoes=ctx.usuario.permissoes||[];
  const podeConfigurar=ctx.usuario.is_admin||permissoes.includes("cotacoes.configurar");
  const podeVisualizar=podeConfigurar||permissoes.includes("cotacoes.visualizar")||permissoes.includes("cotacoes.gerenciar");
  if(!podeVisualizar)return {erro:NextResponse.json({ok:false,error:"Sem permissão para consultar regras."},{status:403})};
  return {empresaId,podeConfigurar};
}
function erro(e:unknown,status=400) {
  const obj=e&&typeof e==="object"?e as {code?:unknown;message?:unknown}:null;
  const codigo=typeof obj?.code==="string"?obj.code:"";
  const mensagem=typeof obj?.message==="string"?obj.message:
    e instanceof Error?e.message:"";
  const seguro=mensagem.startsWith("Configuração comercial")||
    mensagem.startsWith("Selecione uma ou mais categorias")||
    mensagem.startsWith("Seleção de categorias")||
    codigo==="P0001" || codigo==="23514";
  const texto=seguro&&mensagem?mensagem:
    e instanceof Error?e.message:
    "Não foi possível salvar as regras. Confira os campos e tente novamente.";
  return NextResponse.json({ok:false,error:texto},{status});
}

export async function GET(req:Request) {
  try {
    const auth=await acesso();if(auth.erro)return auth.erro;
    const categoria=new URL(req.url).searchParams.get("categoria")||"auto_leves";
    if(!categoriaValida(categoria))return erro(new Error("Categoria inválida."));
    const [regras,status,config]=await Promise.all([
      listarRegrasComerciais(auth.empresaId!,categoria),
      statusConfiguracaoCotacao(auth.empresaId!),
      configuracaoCotacao(auth.empresaId!),
    ]);
    return NextResponse.json({ok:true,...regras,status,config,pode_configurar:auth.podeConfigurar});
  }catch(e){console.error("[COTACAO_COMERCIAL] GET",e);return erro(e,500);}
}
export async function POST(req:Request) {
  try {
    const auth=await acesso();if(auth.erro)return auth.erro;
    if(!auth.podeConfigurar)return erro(new Error("Sem permissão para configurar."),403);
    const body=await req.json() as Record<string,unknown>;
    const acao=String(body.acao||"");
    if(acao==="vigencia"){
      const plano=String(body.plano||"");
      if(!(await listarPlanosEmpresa(auth.empresaId!,true)).some(p=>p.codigo===plano))
        throw new Error("Plano não encontrado.");
      const vigencia=String(body.vigencia_ate||"").trim();
      const valida=/^\d{4}-\d{2}-\d{2}$/.test(vigencia)&&
        !Number.isNaN(Date.parse(vigencia))&&new Date(vigencia).toISOString().slice(0,10)===vigencia;
      if(!valida||vigencia<new Date().toISOString().slice(0,10))
        throw new Error("Informe uma data de validade atual ou futura.");
      const {data:arquivo,error:erroArquivo}=await getSupabaseAdmin()
        .from("cotacao_veicular_planos_arquivos")
        .select("arquivo_precos_nome,referencia")
        .eq("empresa_id",auth.empresaId).eq("plano",plano).maybeSingle();
      if(erroArquivo)throw erroArquivo;
      if(!arquivo?.arquivo_precos_nome)
        throw new Error("Importe a tabela de preços deste plano antes de informar a validade.");
      const referencia=String(arquivo.referencia||arquivo.arquivo_precos_nome).trim().slice(0,160);
      const {error}=await getSupabaseAdmin().from("cotacao_veicular_planos_arquivos")
        .update({referencia,vigencia_ate:vigencia,updated_at:new Date().toISOString()})
        .eq("empresa_id",auth.empresaId).eq("plano",plano);
      if(error)throw error;
    }else if(acao==="adicionar_cobertura"||acao==="remover_cobertura"){
      const categoria=String(body.categoria||"");
      const plano=String(body.plano||"");
      const cobertura=String(body.cobertura||"").trim().replace(/\s+/g," ");
      if(!categoriaValida(categoria) ||
        !(await listarPlanosEmpresa(auth.empresaId!,true)).some(p=>p.codigo===plano) ||
        cobertura.length<2||cobertura.length>160)
        throw new Error("Plano ou cobertura inválidos.");
      const banco=getSupabaseAdmin();
      const {data:atual,error:erroAtual}=await banco.from("cotacao_veicular_regras_empresa")
        .select("*").eq("empresa_id",auth.empresaId).eq("categoria",categoria)
        .eq("plano",plano).maybeSingle();
      if(erroAtual)throw erroAtual;
      const lista=Array.isArray(atual?.coberturas)?atual.coberturas as string[]:[];
      const existe=lista.some(v=>v.toLowerCase()===cobertura.toLowerCase());
      if(acao==="adicionar_cobertura"&&existe)throw new Error("Essa cobertura já está cadastrada.");
      const proxima=acao==="adicionar_cobertura"?[...lista,cobertura]
        :lista.filter(v=>v.toLowerCase()!==cobertura.toLowerCase());
      if(proxima.length>30)throw new Error("Limite de 30 coberturas por plano.");
      if(atual){
        const {error}=await banco.from("cotacao_veicular_regras_empresa")
          .update({coberturas:proxima,updated_at:new Date().toISOString()})
          .eq("empresa_id",auth.empresaId).eq("categoria",categoria).eq("plano",plano);
        if(error)throw error;
      }else if(acao==="adicionar_cobertura"){
        const base=regraVazia(categoria,plano);
        const {error}=await banco.from("cotacao_veicular_regras_empresa").insert({
          empresa_id:auth.empresaId,...base,coberturas:proxima,
        });
        if(error)throw error;
      }
    }else if(acao==="regra"){
      const regra=body.regra as RegraComercialPlano;
      if(!regra||typeof regra!=="object"||!categoriaValida(regra.categoria)||
         !(await listarPlanosEmpresa(auth.empresaId!,true)).some(plano=>plano.codigo===regra.plano))throw new Error("Categoria ou plano inválido.");
      if(!Array.isArray(body.opcionais))throw new Error("Lista de opcionais inválida.");
      const opcionais=body.opcionais as OpcionalComercial[];
      const erroValidacao=validarRegraComercial(regra,opcionais);
      if(erroValidacao)throw new Error(erroValidacao);
      if(!regra.usos_permitidos.every(v=>v in USOS_VEICULO)||
        !regra.energias_permitidas.every(v=>v in ENERGIAS_VEICULO))
        throw new Error("Finalidade de uso ou motorização inválida.");
      const categoriasAdicionais=body.categorias;
      if(categoriasAdicionais!==undefined&&!Array.isArray(categoriasAdicionais))
        throw new Error("Lista de categorias inválida.");
      const selecionadas=Array.isArray(categoriasAdicionais)?categoriasAdicionais:[regra.categoria];
      if(selecionadas.length<1||selecionadas.length>8||
        selecionadas.some(c=>!categoriaValida(c)) ||
        new Set(selecionadas).size!==selecionadas.length ||
        !selecionadas.includes(regra.categoria))
        throw new Error("Selecione categorias válidas, incluindo a categoria atual.");
      const condicoes=validarCondicoesContratacao(body.condicoes);
      // Uma única transação no banco: se condições ou regras falharem,
      // nenhuma alteração parcial é confirmada.
      const {error}=await getSupabaseAdmin().rpc("cotacao_veicular_salvar_regras_com_taxas",{
        p_empresa_id:auth.empresaId,p_plano:regra.plano,
        p_categorias:selecionadas,p_regra:regra,p_opcionais:opcionais,
        p_condicoes:condicoes,
      });
      if(error)throw error;
    }else throw new Error("Ação inválida.");
    return NextResponse.json({ok:true,status:await statusConfiguracaoCotacao(auth.empresaId!)});
  }catch(e){console.error("[COTACAO_COMERCIAL] POST",e);return erro(e);}
}
