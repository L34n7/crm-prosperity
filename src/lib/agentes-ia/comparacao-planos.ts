export type Plano={plano:string;plano_nome:string;mensalidade_base_centavos:number};
const brl=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n/100);
export function compararValoresPlanos(nome:string,ano:number,uso:string,planos:Plano[]):string{
 const lista=planos.filter(p=>p.mensalidade_base_centavos>0);
 const linhas=lista.map(p=>"• "+p.plano_nome+": *"+brl(p.mensalidade_base_centavos)+"/mês*");
 if(!linhas.length)return "Não encontrei os valores da proposta anterior.";
 let diferenca="";
 if(lista.length===2){
   const [a,b]=lista;
   const menor=a.mensalidade_base_centavos<=b.mensalidade_base_centavos?a:b;
   diferenca="\n\n*Diferença:* "+brl(Math.abs(a.mensalidade_base_centavos-b.mensalidade_base_centavos))+"/mês. "+menor.plano_nome+" tem a menor mensalidade.";
 }
 return "💰 *COMPARATIVO DOS PLANOS*\n🚘 "+nome+" · "+ano+" · Uso "+uso+"\n\n"+linhas.join("\n")+diferenca+"\n\n_Valores base, sem opcionais._";
}
