import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { verificarEspecialEmpresa } from "@/lib/cotacoes-veiculares/servico";
import { classificarVeiculoFipe } from "@/lib/cotacoes-veiculares/classificacao";
import { USOS_VEICULO,type UsoVeiculo } from "@/lib/cotacoes-veiculares/comercial";
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
  const tipo = params.get("tipo") as TipoFipe|"all";
  const uso = params.get("uso")||"particular";
  const etapa = params.get("etapa");
  const marca = params.get("marca") || "";
  const modelo = params.get("modelo") || "";
  const ano = params.get("ano") || "";
  if (!["cars","motorcycles","trucks","all"].includes(tipo) ||
      (tipo==="all"&&etapa!=="marcas") ||
      !Object.hasOwn(USOS_VEICULO,uso) ||
      !["marcas","modelos","anos","preco"].includes(etapa || "") ||
      [marca,modelo,ano].some((v)=>v.length>60 || (v && !/^[\w-]+$/.test(v)))) {
    return NextResponse.json({ok:false,error:"Parâmetros inválidos."},{status:400});
  }
  try {
    if (etapa==="marcas"){
      if(tipo==="all"){
        const tipos=["cars","motorcycles","trucks"] as const;
        const resultados=await Promise.allSettled(tipos.map(async t=>({
          tipo:t,itens:await listarMarcasFipe(t),
        })));
        const completos=resultados.filter(r=>r.status==="fulfilled");
        if(!completos.length)throw new Error("Nenhuma lista de marcas FIPE disponível.");
        const legenda={cars:"Automóveis",motorcycles:"Motocicletas",trucks:"Caminhões"};
        const itens=completos.flatMap(r=>r.status==="fulfilled"?
          r.value.itens.map(i=>({code:r.value.tipo+"|"+i.code,
            name:i.name+" · "+legenda[r.value.tipo]})) : []);
        itens.sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
        return NextResponse.json({ok:true,itens,
          aviso:completos.length<3?"Alguns grupos FIPE estão temporariamente indisponíveis.":null});
      }
      return NextResponse.json({ok:true,itens:await listarMarcasFipe(tipo)});
    }
    if(tipo==="all")return NextResponse.json({ok:false,error:"Grupo FIPE inválido para esta consulta."},{status:400});
    if (!marca) return NextResponse.json({ok:false,error:"Selecione a marca."},{status:400});
    if (etapa==="modelos") return NextResponse.json({ok:true,itens:await listarModelosFipe(tipo,marca)});
    if (!modelo) return NextResponse.json({ok:false,error:"Selecione o modelo."},{status:400});
    if (etapa==="anos") return NextResponse.json({ok:true,itens:await listarAnosFipe(tipo,marca,modelo)});
    if (!ano) return NextResponse.json({ok:false,error:"Selecione o ano."},{status:400});
    const veiculo = await detalharVeiculoFipe(tipo,marca,modelo,ano);
    const [especial,classificacao]=await Promise.all([
      verificarEspecialEmpresa(usuario.usuario.empresa_id,veiculo.model,veiculo.codeFipe),
      classificarVeiculoFipe({
        empresaId:usuario.usuario.empresa_id,tipo:tipo as TipoFipe,
        codigoFipe:veiculo.codeFipe,modelo:veiculo.model,uso:uso as UsoVeiculo,
      }),
    ]);
    return NextResponse.json({ok:true,veiculo,especial,
      categoria_interna:classificacao.categoria,
      classificacao_pendente:classificacao.pendente,
      valor_fipe_centavos:precoFipeCentavos(veiculo.price)});
  } catch(e) {
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Consulta FIPE indisponível."},{status:502});
  }
}
