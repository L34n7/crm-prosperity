import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { categoriaValida } from "@/lib/cotacoes-veiculares/servico";

export const runtime = "nodejs";

type Tipo = "precos" | "especiais";
type Faixa = {
  categoria:string;fipe_min_centavos:number;fipe_max_centavos:number;
  codigo_premium:string;premium_centavos:number;
  codigo_completo:string;completo_centavos:number;
};
type Modelo = {modelo:string;codigo_fipe:string|null};
const headers = {
  precos:["categoria","fipe_min","fipe_max","codigo_premium","premium","codigo_completo","completo"],
  especiais:["modelo","codigo_fipe"],
} as const;

function respostaErro(e:unknown,status=400) {
  return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Não foi possível importar a planilha."},{status});
}

async function acesso() {
  const contexto=await getUsuarioContexto();
  if(!contexto.ok) return {erro:NextResponse.json({ok:false,error:contexto.error},{status:contexto.status})};
  const empresaId=contexto.usuario.empresa_id;
  if(!empresaId) return {erro:respostaErro(new Error("Empresa não encontrada."),403)};
  const nicho=await buscarNichoEmpresa(empresaId);
  if(nicho.codigo!=="seguro_veicular") return {erro:respostaErro(new Error("Nicho não autorizado."),403)};
  if(!contexto.usuario.is_admin && !(contexto.usuario.permissoes||[]).includes("cotacoes.configurar"))
    return {erro:respostaErro(new Error("Sem permissão para configurar cotações."),403)};
  return {empresaId};
}
function getTexto(valor:unknown) {
  if(typeof valor==="string" || typeof valor==="number") return String(valor).trim();
  return "";
}
function moedaCentavos(valor:unknown,campo:string,linha:number) {
  if(typeof valor==="number" && Number.isFinite(valor) && valor>=0)
    return Math.round(valor*100);
  const entrada=getTexto(valor).replace(/R\$/gi,"").replace(/\s/g,"");
  if(!entrada || !/^[\d.,]+$/.test(entrada)) throw new Error("Linha "+linha+": "+campo+" inválido.");
  const convertido=entrada.includes(",")?entrada.replace(/\./g,"").replace(",","."):entrada;
  const n=Number(convertido);
  if(!Number.isFinite(n)||n<0||n>20000000) throw new Error("Linha "+linha+": "+campo+" inválido.");
  return Math.round(n*100);
}
function nomeCelula(celula:ExcelJS.Cell) {
  const valor=celula.value;
  if(valor==null) return "";
  if(typeof valor==="string" || typeof valor==="number") return String(valor).trim();
  // Não executar nem importar fórmulas, hyperlinks ou rich-text como conteúdo de regra.
  throw new Error("Não utilize fórmulas nas células da planilha (linha "+celula.row+").");
}
function lerLinhas(workbook:ExcelJS.Workbook,tipo:Tipo) {
  const sheet=workbook.worksheets[0];
  if(!sheet) throw new Error("A planilha precisa conter uma aba.");
  const cabecalhos=headers[tipo];
  cabecalhos.forEach((nome,i)=>{
    if(nomeCelula(sheet.getCell(1,i+1)).toLowerCase()!==nome)
      throw new Error("Cabeçalho inválido na coluna "+(i+1)+". Baixe e utilize o modelo disponibilizado.");
  });
  if(sheet.rowCount>5100) throw new Error("A planilha excede o limite de 5.000 linhas.");
  const faixas:Faixa[]=[];
  const modelos:Modelo[]=[];
  const identificadores=new Set<string>();
  for(let i=2;i<=sheet.rowCount;i++){
    const valores=cabecalhos.map((_,j)=>nomeCelula(sheet.getCell(i,j+1)));
    if(valores.every(v=>!v)) continue;
    if(tipo==="precos"){
      const [categoria,min,max,codigoPremium,premium,codigoCompleto,completo]=valores;
      if(!categoriaValida(categoria)) throw new Error("Linha "+i+": categoria inválida. Use um dos códigos do modelo.");
      const minimo=moedaCentavos(sheet.getCell(i,2).value,"FIPE mínima",i);
      const maximo=moedaCentavos(sheet.getCell(i,3).value,"FIPE máxima",i);
      const valPremium=moedaCentavos(sheet.getCell(i,5).value,"Premium",i);
      const valCompleto=moedaCentavos(sheet.getCell(i,7).value,"Completo",i);
      if(maximo<=minimo || maximo>2000000000 || !codigoPremium || !codigoCompleto ||
         codigoPremium.length>70 || codigoCompleto.length>70 || valPremium===0 || valCompleto===0)
        throw new Error("Linha "+i+": revise a faixa FIPE, os códigos e os valores positivos dos dois planos.");
      const chave=categoria+":"+minimo;
      if(identificadores.has(chave)) throw new Error("Linha "+i+": faixa FIPE duplicada na categoria.");
      identificadores.add(chave);
      faixas.push({
        categoria,fipe_min_centavos:minimo,fipe_max_centavos:maximo,
        codigo_premium:codigoPremium,premium_centavos:valPremium,
        codigo_completo:codigoCompleto,completo_centavos:valCompleto,
      });
    }else{
      const [modelo,codigo]=valores;
      if(modelo.length<2 || modelo.length>220 || codigo.length>80)
        throw new Error("Linha "+i+": informe um modelo válido (até 220 caracteres).");
      const chave=modelo.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
      if(identificadores.has(chave)) throw new Error("Linha "+i+": modelo duplicado.");
      identificadores.add(chave);
      modelos.push({modelo,codigo_fipe:codigo||null});
    }
    if(faixas.length+modelos.length>5000) throw new Error("Limite de 5.000 registros por planilha.");
  }
  if(!faixas.length&&!modelos.length) throw new Error("A planilha não contém registros.");
  if(tipo==="precos"){
    const porCategoria=new Map<string,Faixa[]>();
    for(const item of faixas) porCategoria.set(item.categoria,[...(porCategoria.get(item.categoria)||[]),item]);
    for(const [categoria,lista] of porCategoria){
      lista.sort((a,b)=>a.fipe_min_centavos-b.fipe_min_centavos);
      for(let j=1;j<lista.length;j++) if(lista[j].fipe_min_centavos<=lista[j-1].fipe_max_centavos)
        throw new Error("Faixas FIPE sobrepostas na categoria "+categoria+". Corrija antes de importar.");
    }
  }
  return {faixas,modelos};
}

export async function GET(req:Request) {
  try{
    const auth=await acesso();if(auth.erro)return auth.erro;
    const query=new URL(req.url).searchParams;
    const tipo=query.get("tipo") as Tipo;
    if(!["precos","especiais"].includes(tipo))return respostaErro(new Error("Tipo de modelo inválido."));
    const workbook=new ExcelJS.Workbook();
    const sheet=workbook.addWorksheet(tipo==="precos"?"Tabela de preços":"Veículos especiais");
    const colunas=[...headers[tipo]];
    sheet.addRow(colunas);
    sheet.addRow(tipo==="precos"
      ? ["auto_leves",0,40000,"P-001",180,"C-001",155]
      : ["Modelo e versão exata cadastrados na FIPE",""]);
    sheet.columns=colunas.map((nome,i)=>({header:nome,key:nome,width:tipo==="precos"?(i===0?21:19):(i===0?50:22)}));
    sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
    sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF136C70"}};
    sheet.getRow(1).height=28;
    sheet.getRow(2).font={color:{argb:"FF334155"}};
    sheet.views=[{state:"frozen",ySplit:1}];
    if(tipo==="precos"){
      for(const coluna of [2,3,5,7]) sheet.getColumn(coluna).numFmt='"R$" #,##0.00';
      sheet.addRow(["motocicleta",40000.01,60000,"P-002",220,"C-002",198]);
      const informacoes=workbook.addWorksheet("Instruções");
      informacoes.addRow(["CATEGORIAS PERMITIDAS"]);
      for(const c of ["motocicleta","auto_leves","app_taxi","especiais","van_utilitario","caminhao_leve","caminhao_pesado","agregado"])informacoes.addRow([c]);
      informacoes.addRow([]);
      informacoes.addRow(["Preencha uma linha por faixa de valor FIPE (em R$), com os preços dos dois planos."]);
      informacoes.addRow(["A importação substitui toda a tabela da sua empresa. Salve uma cópia antes de importar."]);
      informacoes.addRow(["Os exemplos são fictícios: substitua por seus próprios valores."]);
      informacoes.getColumn(1).width=105;
    }else{
      const instrucoes=workbook.addWorksheet("Instruções");
      instrucoes.addRow(["Use o nome exato da versão FIPE, ou informe o código FIPE quando disponível."]);
      instrucoes.addRow(["A importação substitui a lista de especiais SOMENTE da sua empresa."]);
      instrucoes.addRow(["O exemplo é fictício: substitua pelos modelos reais."]);
      instrucoes.getColumn(1).width=100;
    }
    const buffer=await workbook.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer),{
      headers:{
        "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":'attachment; filename="modelo-cotacao-'+tipo+'.xlsx"',
        "Cache-Control":"no-store",
      },
    });
  }catch(e){console.error("[COTACAO_MODELO]",e);return respostaErro(e,500);}
}

export async function POST(req:Request) {
  try{
    const auth=await acesso();if(auth.erro)return auth.erro;
    const form=await req.formData();
    const tipo=String(form.get("tipo")||"") as Tipo;
    if(tipo!=="precos" && tipo!=="especiais")throw new Error("Selecione preços ou veículos especiais.");
    const arquivo=form.get("arquivo");
    if(!(arquivo instanceof File))throw new Error("Selecione um arquivo Excel .xlsx.");
    if(!arquivo.name.toLowerCase().endsWith(".xlsx")||arquivo.size>4*1024*1024||arquivo.size<50)
      throw new Error("Envie uma planilha .xlsx de até 4 MB.");
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await arquivo.arrayBuffer()) as never);
    const {faixas,modelos}=lerLinhas(workbook,tipo);
    const supabase=getSupabaseAdmin();
    if(tipo==="precos"){
      const referencia=String(form.get("referencia")||"Tabela importada").trim().slice(0,160);
      if(!referencia)throw new Error("Informe a referência da tabela.");
      const {data,error}=await supabase.rpc("cotacao_veicular_substituir_faixas",{
        p_empresa_id:auth.empresaId,p_faixas:faixas,p_referencia:referencia,
      });
      if(error)throw error;
      return NextResponse.json({ok:true,tipo,total:Number(data)||faixas.length,
        aviso:"Tabela substituída. Confirme os valores antes de reativar a IA."});
    }
    const {data,error}=await supabase.rpc("cotacao_veicular_substituir_especiais",{
      p_empresa_id:auth.empresaId,p_modelos:modelos,
    });
    if(error)throw error;
    return NextResponse.json({ok:true,tipo,total:Number(data)||modelos.length,
      aviso:"Lista de veículos especiais atualizada. Revise antes de habilitar a IA."});
  }catch(e){console.error("[COTACAO_IMPORTACAO]",e);return respostaErro(e);}
}
