import type {Plano} from "./comparacao-planos";
type Uso="particular"|"aplicativo";
const brl=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n/100);
export function compararValoresUso(nome:string,ano:number,origem:Uso,base:Plano[],destino:Uso,novos:Plano[]):string{
 const linhas=base.flatMap(a=>{
   const b=novos.find(p=>p.plano===a.plano);
   if(!b||a.mensalidade_base_centavos<=0||b.mensalidade_base_centavos<=0)return [];
   const variacao=b.mensalidade_base_centavos-a.mensalidade_base_centavos;
   const delta=variacao===0?"sem diferença":(variacao>0?"+":"−")+brl(Math.abs(variacao))+"/mês";
   return ["*"+a.plano_nome+"*\n• "+origem+": "+brl(a.mensalidade_base_centavos)+"/mês\n• "+destino+": "+brl(b.mensalidade_base_centavos)+"/mês\n• Variação: "+delta];
 });
 if(!linhas.length)return "A nova simulação foi realizada, mas não há planos equivalentes para uma comparação direta.";
 return "🚘 *COMPARATIVO POR TIPO DE USO*\n"+nome+" · "+ano+"\n\n"+linhas.join("\n\n")+"\n\n_Valores base, sem opcionais. Condições e coberturas podem variar._";
}
