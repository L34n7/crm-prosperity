/** Valida e reconcilia nomes contra marcas OFICIAIS devolvidas pela FIPE.
 * Uma correção tipográfica só é aceita quando há UM resultado inequívoco.
 * Nunca cria fabricantes, dados de preço ou modelos por semelhança.
 */
export type MarcaFipeCatalogo={name:string;code:string};

export class ErroMarcaNaoEncontradaFipe extends Error{
  readonly marcaInformada:string;
  constructor(marcaInformada:string){
    super("A marca "+String(marcaInformada||"").slice(0,100)+
      " não corresponde de forma inequívoca aos fabricantes cadastrados na FIPE.");
    this.name="ErroMarcaNaoEncontradaFipe";
    this.marcaInformada=marcaInformada;
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

/** Captura apenas uma grafia plausível de marca em resposta curta do pedido
 * atual. Este resultado NÃO autoriza cotar: a unicidade precisa ser validada
 * contra o catálogo oficial FIPE antes de encaminhar a fabricante.
 */
export function grafiaProximaMarcaNoPedido(
  marca:string,mensagens:string[],
):string|null{
 const alvo=normalizar(marca);
 if(alvo.length<5)return null;
 for(let i=mensagens.length-1;i>=0;i--){
   const texto=normalizar(mensagens[i]);
   // "Não é Jaguar" é uma NEGATIVA: jamais transformá-la em marca declarada.
   if(/^(?:nao|nem|nunca)\b/.test(texto))continue;
   const candidata=texto.replace(
     /^(?:(?:a|o)\s+)?(?:marca\s+)?(?:e|eh|era)\s+/,""
   ).replace(/^marca\s+/,"");
   if(!candidata||candidata.includes(" ")||
      !/^[a-z]{5,}$/.test(candidata))continue;
   if(distanciaDeUmaEdicao(candidata,alvo))return candidata;
 }
 return null;
}

/** Deduplica marcas iguais presentes em carros/motos/caminhões antes de
 * autorizar a correção de UMA letra. Se houver mais de uma marca oficial
 * compatível, permanece pendente a confirmação com o cliente.
 */
export function marcaCorrigidaConfereComCatalogoFipe(
  marca:string,grafia:string,marcas:MarcaFipeCatalogo[],
):boolean{
 const unicas=new Map<string,MarcaFipeCatalogo>();
 for(const item of marcas)unicas.set(normalizar(item.name),item);
 const resolvida=resolverMarcaCatalogoFipe([...unicas.values()],grafia);
 return resolvida?.origem==="correcao_unica"&&
   normalizar(resolvida.marca.name)===normalizar(marca);
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
   const textoNormalizado=normalizar(frase);
   // A negativa "não é Jaguar" não declara Jaguar como fabricante.
   if(/^(?:nao|nem|nunca)\b/.test(textoNormalizado))return false;
   const texto=" "+textoNormalizado+" ";
   return texto.includes(" "+alvo+" ");
 });
}
