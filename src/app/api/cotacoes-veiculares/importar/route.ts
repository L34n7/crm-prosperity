import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarPlanosEmpresa } from "@/lib/cotacoes-veiculares/configuracao";
import { categoriaValida } from "@/lib/cotacoes-veiculares/servico";

export const runtime = "nodejs";
type Tipo = "precos" | "especiais";
type Faixa = {
  plano:string;categoria:string;fipe_min_centavos:number;fipe_max_centavos:number;
  codigo_produto:string;valor_centavos:number;
};
type Modelo = {modelo:string;codigo_fipe:string|null};
const headers = {
  precos:["categoria","fipe_min","fipe_max","codigo_produto","mensalidade"],
  especiais:["modelo","codigo_fipe"],
} as const;
const erro=(e:unknown,status=400)=>NextResponse.json({
  ok:false,error:e instanceof Error?e.message:"Falha ao processar o arquivo.",
},{status});
async function acesso(){
  const ctx=await getUsuarioContexto();
  if(!ctx.ok)return {erro:NextResponse.json({ok:false,error:ctx.error},{status:ctx.status})};
  const id=ctx.usuario.empresa_id;
  if(!id)return {erro:erro(new Error("Empresa não encontrada."),403)};
  const nicho=await buscarNichoEmpresa(id);
  if(nicho.codigo!=="seguro_veicular")
    return {erro:erro(new Error("Nicho não autorizado."),403)};
  if(!ctx.usuario.is_admin&&!(ctx.usuario.permissoes||[]).includes("cotacoes.configurar"))
    return {erro:erro(new Error("Sem permissão para configurar planos."),403)};
  return {empresaId:id};
}
async function planoValido(empresaId:string,codigo:string){
  const plano=(await listarPlanosEmpresa(empresaId,true)).find(p=>p.codigo===codigo);
  if(!plano)throw new Error("Selecione um plano ativo antes de importar.");
  return plano;
}
function texto(celula:ExcelJS.Cell){
  const v=celula.value;
  if(v==null)return "";
  if(typeof v==="string"||typeof v==="number")return String(v).trim();
  throw new Error("Não utilize fórmulas ou conteúdos especiais na linha "+celula.row+".");
}
function centavos(celula:ExcelJS.Cell,campo:string){
  const valor=celula.value;
  const bruto=texto(celula).replace(/R\$/gi,"").replace(/\s/g,"");
  const textoNumero=bruto.includes(",")
    ?bruto.replace(/\./g,"").replace(",",".")
    :/^\d{1,3}(\.\d{3})+$/.test(bruto)?bruto.replace(/\./g,""):bruto;
  const numero=typeof valor==="number"?valor:Number(textoNumero);
  if(!Number.isFinite(numero)||numero<0||numero>20000000)
    throw new Error("Linha "+celula.row+": "+campo+" inválido.");
  return Math.round(numero*100);
}
function linhasPlanilha(workbook:ExcelJS.Workbook,tipo:Tipo,plano:string){
  const ws=workbook.worksheets[0];
  if(!ws)throw new Error("A planilha não contém uma aba.");
  if(ws.rowCount>10001)throw new Error("A planilha ultrapassa 10 mil linhas.");
  headers[tipo].forEach((header,i)=>{
    if(texto(ws.getCell(1,i+1)).toLowerCase()!==header)
      throw new Error("Cabeçalho da coluna "+(i+1)+" incorreto. Baixe o modelo deste plano.");
  });
  const faixas:Faixa[]=[],modelos:Modelo[]=[];
  const chaves=new Set<string>();
  for(let row=2;row<=ws.rowCount;row++){
    const dados=headers[tipo].map((_,i)=>texto(ws.getCell(row,i+1)));
    if(dados.every(s=>!s))continue;
    if(tipo==="precos"){
      const [categoria,,,codigo]=dados;
      if(!categoriaValida(categoria))throw new Error("Linha "+row+": categoria inválida.");
      const min=centavos(ws.getCell(row,2),"FIPE mínima");
      const max=centavos(ws.getCell(row,3),"FIPE máxima");
      const valor=centavos(ws.getCell(row,5),"mensalidade");
      if(max<=min||max>2000000000||valor<=0||!codigo||codigo.length>70)
        throw new Error("Linha "+row+": faixa FIPE ou preço inválido.");
      const key=categoria+":"+min;
      if(chaves.has(key))throw new Error("Linha "+row+": faixa duplicada.");
      chaves.add(key);
      faixas.push({plano,categoria,fipe_min_centavos:min,fipe_max_centavos:max,
        codigo_produto:codigo,valor_centavos:valor});
    }else{
      const [modelo,codigo]=dados;
      if(modelo.length<2||modelo.length>220||codigo.length>80)
        throw new Error("Linha "+row+": modelo inválido.");
      const chave=modelo.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().trim();
      if(chaves.has(chave))throw new Error("Linha "+row+": modelo duplicado.");
      chaves.add(chave);
      modelos.push({modelo,codigo_fipe:codigo||null});
    }
  }
  if(tipo==="precos"){
    if(!faixas.length)throw new Error("A planilha não possui faixas FIPE.");
    const categorias=[...new Set(faixas.map(f=>f.categoria))];
    for(const categoria of categorias){
      const lista=faixas.filter(f=>f.categoria===categoria)
        .sort((a,b)=>a.fipe_min_centavos-b.fipe_min_centavos);
      for(let i=1;i<lista.length;i++)
        if(lista[i].fipe_min_centavos<=lista[i-1].fipe_max_centavos)
          throw new Error("Faixas FIPE sobrepostas na categoria "+categoria+".");
    }
  }else if(!modelos.length||modelos.length>5000){
    throw new Error("Informe entre 1 e 5.000 modelos especiais.");
  }
  return {faixas,modelos};
}
export async function GET(req:Request){
  try{
    const auth=await acesso();if(auth.erro)return auth.erro;
    const query=new URL(req.url).searchParams;
    const tipo=query.get("tipo") as Tipo;
    if(tipo!=="precos"&&tipo!=="especiais")throw new Error("Tipo inválido.");
    const plano=await planoValido(auth.empresaId!,query.get("plano")||"");
    const workbook=new ExcelJS.Workbook(),ws=workbook.addWorksheet(
      tipo==="precos"?"Preços do plano":"Veículos especiais");
    ws.addRow(headers[tipo]);
    ws.addRow(tipo==="precos"
      ?["auto_leves",0,40000,plano.codigo.toUpperCase()+"-001",150]
      :["Modelo e versão exata (exemplo fictício)",""]);
    ws.columns=headers[tipo].map((name,i)=>({header:name,key:name,width:i===0?36:24}));
    ws.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
    ws.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF176F79"}};
    ws.views=[{state:"frozen",ySplit:1}];
    const info=workbook.addWorksheet("Como preencher");
    info.addRow(["Plano: "+plano.nome]);
    info.addRow(["Arquivo exclusivo deste plano. Remova os exemplos antes de importar."]);
    if(tipo==="precos"){
      info.addRow(["Uma linha por categoria e faixa FIPE, com valor da mensalidade em reais."]);
      info.addRow(["O arquivo substitui apenas os preços do plano "+plano.nome+"."]);
    }else info.addRow(["Inclua os modelos especiais e códigos FIPE permitidos neste plano."]);
    info.getColumn(1).width=100;
    const buffer=await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer),{headers:{
      "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":'attachment; filename="modelo-'+tipo+'-'+plano.codigo+'.xlsx"',
      "Cache-Control":"no-store",
    }});
  }catch(e){return erro(e);}
}
export async function POST(req:Request){
  try{
    const auth=await acesso();if(auth.erro)return auth.erro;
    const form=await req.formData();
    const tipo=String(form.get("tipo")||"") as Tipo;
    if(tipo!=="precos"&&tipo!=="especiais")throw new Error("Tipo de importação inválido.");
    const plano=await planoValido(auth.empresaId!,String(form.get("plano")||""));
    const arquivo=form.get("arquivo");
    if(!(arquivo instanceof File)||!arquivo.name.toLowerCase().endsWith(".xlsx")||
      arquivo.size<50||arquivo.size>5*1024*1024)
      throw new Error("Selecione um arquivo Excel .xlsx de até 5 MB.");
    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await arquivo.arrayBuffer()) as never);
    const {faixas,modelos}=linhasPlanilha(wb,tipo,plano.codigo);
    const admin=getSupabaseAdmin();
    const nome=arquivo.name.slice(0,180);
    if(tipo==="precos"){
      // Nome da tabela definido automaticamente pelo arquivo. Não há campo manual.
      const referencia=("Tabela: "+arquivo.name).slice(0,160);
      const {data,error}=await admin.rpc("cotacao_veicular_importar_precos_plano",{
        p_empresa_id:auth.empresaId,p_plano:plano.codigo,p_linhas:faixas,
        p_referencia:referencia,p_arquivo_nome:nome,
      });
      if(error)throw error;
      return NextResponse.json({ok:true,total:data||faixas.length,nome,plano:plano.codigo});
    }
    const {data,error}=await admin.rpc("cotacao_veicular_importar_especiais_plano",{
      p_empresa_id:auth.empresaId,p_plano:plano.codigo,
      p_modelos:modelos,p_arquivo_nome:nome,
    });
    if(error)throw error;
    return NextResponse.json({ok:true,total:data||modelos.length,nome,plano:plano.codigo});
  }catch(e){console.error("[COTACAO_IMPORTAR_PLANO]",e);return erro(e);}
}
export async function DELETE(req:Request){
  try{
    const auth=await acesso();if(auth.erro)return auth.erro;
    const query=new URL(req.url).searchParams;
    const tipo=query.get("tipo"),plano=await planoValido(auth.empresaId!,query.get("plano")||"");
    if(tipo!=="precos"&&tipo!=="especiais")throw new Error("Tipo inválido.");
    const {error}=await getSupabaseAdmin().rpc("cotacao_veicular_excluir_arquivo_plano",{
      p_empresa_id:auth.empresaId,p_plano:plano.codigo,p_tipo:tipo,
    });
    if(error)throw error;
    return NextResponse.json({ok:true,plano:plano.codigo});
  }catch(e){console.error("[COTACAO_REMOVER_PLANO]",e);return erro(e);}
}
