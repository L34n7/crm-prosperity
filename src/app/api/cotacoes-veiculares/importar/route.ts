import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarPlanosEmpresa } from "@/lib/cotacoes-veiculares/configuracao";
import { categoriaValida } from "@/lib/cotacoes-veiculares/servico";
export const runtime="nodejs";
type Tipo="precos"|"especiais";
type Linha={categoria:string;plano:string;fipe_min_centavos:number;fipe_max_centavos:number;codigo_produto:string;valor_centavos:number};
const headers={precos:["categoria","plano","fipe_min","fipe_max","codigo_produto","mensalidade"],especiais:["modelo","codigo_fipe"]};
const erro=(e:unknown,status=400)=>NextResponse.json({ok:false,error:e instanceof Error?e.message:"Falha na importação."},{status});
async function acesso(){
 const ctx=await getUsuarioContexto();
 if(!ctx.ok)return {erro:NextResponse.json({ok:false,error:ctx.error},{status:ctx.status})};
 const id=ctx.usuario.empresa_id;
 if(!id)return {erro:erro(new Error("Empresa não encontrada."),403)};
 const nicho=await buscarNichoEmpresa(id);
 if(nicho.codigo!=="seguro_veicular")return {erro:erro(new Error("Nicho não autorizado."),403)};
 if(!ctx.usuario.is_admin&&!(ctx.usuario.permissoes||[]).includes("cotacoes.configurar"))
   return {erro:erro(new Error("Sem permissão para importar ou remover arquivos."),403)};
 return {empresaId:id};
}
function texto(c:ExcelJS.Cell){
 const v=c.value;
 if(v===null)return "";
 if(typeof v==="string"||typeof v==="number")return String(v).trim();
 throw new Error("A linha "+c.row+" contém fórmula ou formato não permitido.");
}
function dinheiro(c:ExcelJS.Cell,campo:string){
 const v=c.value;
 const bruto=texto(c).replace(/R\$/g,"").replace(/\s/g,"");
 const normalizado=bruto.includes(",")?bruto.replace(/\./g,"").replace(",",".")
   :/^\d{1,3}(\.\d{3})+$/.test(bruto)?bruto.replace(/\./g,""):bruto;
 const n=typeof v==="number"?v:Number(normalizado);
 if(!Number.isFinite(n)||n<0||n>20000000)throw new Error("Linha "+c.row+": "+campo+" inválido.");
 return Math.round(n*100);
}
function validarFaixas(linhas:Linha[],planos:string[]){
 if(!linhas.length)throw new Error("O arquivo não contém preços.");
 const categorias=[...new Set(linhas.map(l=>l.categoria))];
 for(const cat of categorias){
  const referencias=linhas.filter(v=>v.categoria===cat&&v.plano===planos[0])
    .sort((a,b)=>a.fipe_min_centavos-b.fipe_min_centavos);
  if(!referencias.length)throw new Error("Faltam preços para o plano "+planos[0]+" em "+cat+".");
  for(const plano of planos){
   const lista=linhas.filter(v=>v.categoria===cat&&v.plano===plano)
     .sort((a,b)=>a.fipe_min_centavos-b.fipe_min_centavos);
   if(lista.length!==referencias.length||lista.some((v,i)=>
     v.fipe_min_centavos!==referencias[i].fipe_min_centavos||
     v.fipe_max_centavos!==referencias[i].fipe_max_centavos))
     throw new Error("A categoria "+cat+" precisa ter as mesmas faixas FIPE em todos os planos.");
   for(let i=1;i<lista.length;i++)
     if(lista[i].fipe_min_centavos<=lista[i-1].fipe_max_centavos)
       throw new Error("Existem faixas sobrepostas em "+cat+" / "+plano+".");
  }
 }
}
export async function GET(req:Request){
 try{
  const auth=await acesso();if(auth.erro)return auth.erro;
  const tipo=new URL(req.url).searchParams.get("tipo") as Tipo;
  if(!["precos","especiais"].includes(tipo))throw new Error("Modelo inválido.");
  const planos=await listarPlanosEmpresa(auth.empresaId!,true);
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet(tipo==="precos"?"Preços":"Veículos especiais");
  ws.addRow(headers[tipo]);
  if(tipo==="precos"){
   for(const p of planos)ws.addRow(["auto_leves",p.codigo,0,40000,p.codigo.toUpperCase()+"-001",150]);
  }else ws.addRow(["Exemplo de versão exata conforme FIPE",""]);
  ws.columns=headers[tipo].map((h,i)=>({header:h,key:h,width:i===0?28:22}));
  ws.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
  ws.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF136C70"}};
  ws.getRow(1).height=28;
  const instr=wb.addWorksheet("Instruções");
  instr.addRow(["Substitua os valores demonstrativos. As faixas FIPE não podem se sobrepor."]);
  instr.addRow(["A importação substitui toda a lista anterior da empresa."]);
  if(tipo==="precos"){
   instr.addRow(["Crie os planos no CRM ANTES de preencher ou baixar este modelo."]);
   instr.addRow(["Repita a mesma faixa FIPE para todos os planos ativos, uma linha por plano."]);
   instr.addRow(["Códigos de planos válidos:"]);
   for(const p of planos)instr.addRow([p.codigo,p.nome]);
   if(!planos.length)instr.addRow(["Nenhum plano criado. Volte e crie seu primeiro plano."]);
  }else instr.addRow(["Preencha os modelos especiais usando nomes e códigos FIPE reais."]);
  instr.getColumn(1).width=100;instr.getColumn(2).width=40;
  const buffer=await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer),{headers:{
   "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
   "Content-Disposition":'attachment; filename="modelo-cotacao-'+tipo+'.xlsx"',
   "Cache-Control":"no-store",
  }});
 }catch(e){return erro(e,400);}
}
export async function POST(req:Request){
 try{
  const auth=await acesso();if(auth.erro)return auth.erro;
  const form=await req.formData(),tipo=String(form.get("tipo")||"") as Tipo;
  if(!["precos","especiais"].includes(tipo))throw new Error("Tipo de arquivo inválido.");
  const file=form.get("arquivo");
  if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".xlsx")||
    file.size<50||file.size>5*1024*1024)throw new Error("Selecione Excel .xlsx com até 5 MB.");
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
  const ws=wb.worksheets[0];
  if(!ws)throw new Error("A planilha não tem abas.");
  if(ws.rowCount>10001)throw new Error("Máximo de 10 mil linhas.");
  headers[tipo].forEach((h,i)=>{if(texto(ws.getCell(1,i+1)).toLowerCase()!==h)
    throw new Error("Cabeçalho incorreto na coluna "+(i+1)+". Baixe o modelo.");});
  const linhas:Linha[]=[],modelos:{modelo:string;codigo_fipe:string|null}[]=[];
  const unicos=new Set<string>();
  const planos=await listarPlanosEmpresa(auth.empresaId!,true);
  const codigos=new Set(planos.map(p=>p.codigo));
  if(tipo==="precos"&&!planos.length)throw new Error("Crie pelo menos um plano antes de importar os preços.");
  for(let i=2;i<=ws.rowCount;i++){
   const valores=headers[tipo].map((_,j)=>texto(ws.getCell(i,j+1)));
   if(valores.every(v=>!v))continue;
   if(tipo==="precos"){
    const [categoria,plano,, ,codigo]=valores;
    if(!categoriaValida(categoria)||!codigos.has(plano))throw new Error("Linha "+i+": categoria ou plano inexistente.");
    const min=dinheiro(ws.getCell(i,3),"FIPE mínima");
    const max=dinheiro(ws.getCell(i,4),"FIPE máxima");
    const valor=dinheiro(ws.getCell(i,6),"mensalidade");
    if(max<=min||max>2000000000||valor<=0||!codigo||codigo.length>70)
      throw new Error("Linha "+i+": confira a faixa, código e mensalidade.");
    const key=categoria+":"+plano+":"+min;
    if(unicos.has(key))throw new Error("Linha "+i+": faixa duplicada.");
    unicos.add(key);linhas.push({categoria,plano,fipe_min_centavos:min,
      fipe_max_centavos:max,codigo_produto:codigo,valor_centavos:valor});
   }else{
    const [modelo,codigo]=valores;
    if(modelo.length<2||modelo.length>220||codigo.length>80)throw new Error("Linha "+i+": modelo inválido.");
    const key=modelo.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
    if(unicos.has(key))throw new Error("Linha "+i+": modelo duplicado.");
    unicos.add(key);modelos.push({modelo,codigo_fipe:codigo||null});
   }
  }
  const admin=getSupabaseAdmin();
  const filename=file.name.slice(0,180);
  if(tipo==="precos"){
   validarFaixas(linhas,planos.map(p=>p.codigo));
   const referencia=String(form.get("referencia")||"Tabela importada").trim().slice(0,160);
   if(!referencia)throw new Error("Informe a referência da tabela.");
   const {data,error}=await admin.rpc("cotacao_veicular_importar_precos_dinamicos",{
    p_empresa_id:auth.empresaId,p_linhas:linhas,p_referencia:referencia,p_arquivo_nome:filename,
   });if(error)throw error;
   return NextResponse.json({ok:true,tipo,total:data||linhas.length,arquivo:filename});
  }
  if(!modelos.length||modelos.length>5000)throw new Error("A lista deve ter entre 1 e 5.000 modelos.");
  const {data,error}=await admin.rpc("cotacao_veicular_importar_especiais",{
    p_empresa_id:auth.empresaId,p_modelos:modelos,p_arquivo_nome:filename,
  });if(error)throw error;
  return NextResponse.json({ok:true,tipo,total:data||modelos.length,arquivo:filename});
 }catch(e){console.error("[COTACAO_IMPORTACAO]",e);return erro(e);}
}
export async function DELETE(req:Request){
 try{
  const auth=await acesso();if(auth.erro)return auth.erro;
  const tipo=new URL(req.url).searchParams.get("tipo");
  if(tipo!=="precos"&&tipo!=="especiais")throw new Error("Tipo de arquivo inválido.");
  const {error}=await getSupabaseAdmin().rpc("cotacao_veicular_excluir_importacao",{
   p_empresa_id:auth.empresaId,p_tipo:tipo,
  });
  if(error)throw error;
  return NextResponse.json({ok:true});
 }catch(e){console.error("[COTACAO_EXCLUIR_IMPORTACAO]",e);return erro(e);}
}
