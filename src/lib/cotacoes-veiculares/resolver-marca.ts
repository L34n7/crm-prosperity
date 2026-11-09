/** Valida e reconcilia nomes contra marcas OFICIAIS devolvidas pela FIPE.
 * Uma correção tipográfica só é aceita quando há UM resultado inequívoco.
 * Nunca cria fabricantes, dados de preço ou modelos por semelhança.
 */
export type MarcaFipeCatalogo={name:string;code:string};

export class ErroMarcaNaoEncontradaFipe extends Error{
  constructor(public readonly marcaInformada:string){
    super("A marca "+String(marcaInformada||"").slice(0,100)+
      " não corresponde de forma inequívoca aos fabricantes cadastrados na FIPE.");
    this.name="ErroMarcaNaoEncontradaFipe";
  }
}
const normalizar=(valor:string)=>String(valor||"").normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();

function distanciaDeUmaEdicao(a:string,b:string):boolean{
 if(a===b||Math.min(a.length,b.length)<5||Math.abs(a.length-b.length)>1)
   return false;
 let i=0,j=0,erros=0;
 while(i<a.length&&j<b.length){
   if(a[i]===b[j]){i++;j++;continue;}
   if(++erros>1)return false;
   if(a.length>b.length)i++;
   else if(b.length>a.length)j++;
   else{i++;j++;}
 }
 return erros+(a.length-i)+(b.length-j)===1;
}

export function resolverMarcaCatalogoFipe<T extends MarcaFipeCatalogo>(
  marcas:T[],informada:string,
):{marca:T;origem:"exata"|"parcial"|"correcao_unica"}|null{
 const nome=normalizar(informada);
 if(!nome)return null;
 const exatas=marcas.filter(item=>normalizar(item.name)===nome||
   item.code===informada);
 if(exatas.length===1)return {marca:exatas[0],origem:"exata"};
 if(exatas.length>1)return null;
 const parciais=marcas.filter(item=>{
   const oficial=normalizar(item.name);
   return oficial.startsWith(nome+" ")||oficial.endsWith(" "+nome)||
     oficial.includes(" "+nome+" ");
 });
 if(parciais.length===1)return {marca:parciais[0],origem:"parcial"};
 if(parciais.length>1)return null;
 const corrigidas=marcas.filter(item=>
   distanciaDeUmaEdicao(nome,normalizar(item.name)));
 return corrigidas.length===1
   ?{marca:corrigidas[0],origem:"correcao_unica"}:null;
}

/** A marca só pode ser tratada como declarada quando foi informada no
 * pedido ATUAL, não porque o modelo a recuperou de outra cotação.
 */
export function marcaDeclaradaNoPedido(
  marca:string,mensagens:string[],
):boolean{
 const alvo=normalizar(marca);
 if(!alvo)return false;
 return mensagens.some(frase=>{
   const texto=" "+normalizar(frase)+" ";
   return texto.includes(" "+alvo+" ");
 });
}
