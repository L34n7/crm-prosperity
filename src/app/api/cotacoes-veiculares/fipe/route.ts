import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import {
  listarMarcasFipe, listarModelosFipe, listarAnosFipe, detalharVeiculoFipe,
  precoFipeCentavos, type TipoFipe,
} from "@/lib/cotacoes-veiculares/fipe";

export async function GET(request: Request) {
  const usuario = await getUsuarioContexto();
  if (!usuario.ok) return NextResponse.json({ ok:false,error:usuario.error },{status:usuario.status});
  if (!usuario.usuario.empresa_id) return NextResponse.json({ok:false,error:"Empresa inválida."},{status:403});
  const nicho = await buscarNichoEmpresa(usuario.usuario.empresa_id);
  if (nicho.codigo !== "seguro_veicular") return NextResponse.json({ok:false,error:"Nicho não autorizado."},{status:403});
  const params = new URL(request.url).searchParams;
  const tipo = params.get("tipo") as TipoFipe;
  const etapa = params.get("etapa");
  const marca = params.get("marca") || "";
  const modelo = params.get("modelo") || "";
  const ano = params.get("ano") || "";
  if (!["cars","motorcycles","trucks"].includes(tipo) ||
      !["marcas","modelos","anos","preco"].includes(etapa || "") ||
      [marca,modelo,ano].some((v)=>v.length>60 || (v && !/^[\w-]+$/.test(v)))) {
    return NextResponse.json({ok:false,error:"Parâmetros inválidos."},{status:400});
  }
  try {
    if (etapa==="marcas") return NextResponse.json({ok:true,itens:await listarMarcasFipe(tipo)});
    if (!marca) return NextResponse.json({ok:false,error:"Selecione a marca."},{status:400});
    if (etapa==="modelos") return NextResponse.json({ok:true,itens:await listarModelosFipe(tipo,marca)});
    if (!modelo) return NextResponse.json({ok:false,error:"Selecione o modelo."},{status:400});
    if (etapa==="anos") return NextResponse.json({ok:true,itens:await listarAnosFipe(tipo,marca,modelo)});
    if (!ano) return NextResponse.json({ok:false,error:"Selecione o ano."},{status:400});
    const veiculo = await detalharVeiculoFipe(tipo,marca,modelo,ano);
    return NextResponse.json({ok:true,veiculo,valor_fipe_centavos:precoFipeCentavos(veiculo.price)});
  } catch(e) {
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Consulta FIPE indisponível."},{status:502});
  }
}
