function norm(s:string){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}
export type Uso="particular"|"aplicativo";
export type Plano={plano:string;plano_nome:string;mensalidade_base_centavos:number};
export function querCompararPlanos(msg:string):boolean{
 const t=norm(msg);
 if(/particular|aplicativo|uber|taxi|comercial/.test(t))return false;
 return /(?:diferenca|comparar|comparacao)/.test(t)&&/(?:planos?|premium|completo|valor|preco|mensalidade)/.test(t)||
   /(?:preco|valor|quanto (?:e|fica|custa))/.test(t)&&/(?:premium|completo)/.test(t);
}
export function querCompararUso(msg:string,anterior:string):Uso|null{
 const t=norm(msg).trim(),a=norm(anterior);
 if(/outro carro|outro veiculo|veiculo diferente|carro diferente/.test(t))return null;
 if(/(?:cotar|cotacao|simular|simulacao)/.test(t)&&!/mesmo|esse|essa|compar|diferenc|se for/.test(t))return null;
 if(/^(?:sim|isso|isso mesmo|pode|confirmo|ok|pode fazer|pode gerar)$/.test(t) &&
    /(?:simulacao|cotacao)/.test(a) && /(?:posso|deseja|quer)/.test(a)){
    if(/aplicativo/.test(a))return "aplicativo";
    if(/particular/.test(a))return "particular";
 }
 if(!/(?:preco|valor|mensalidade|custa|quanto|simular|simulacao|cotar|cotacao|comparar)/.test(t))return null;
 if(/(?:aplicativo|uber)/.test(t))return "aplicativo";
 if(/particular/.test(t))return "particular";
 return null;
}

export type MensagemComparacao={role:"user"|"assistant";content:string};
export function usoComparativoNoContexto(
 msg:string,historico:MensagemComparacao[],proximaAcao:string|null=null
):Uso|null{
 const anterior=[...historico].reverse().find(x=>x.role==="assistant")?.content||"";
 const direto=querCompararUso(msg,anterior);
 if(direto)return direto;
 const atual=norm(msg).trim();
 if(/outro carro|outro veiculo|nova cotacao|outra cotacao|desisto|deixa pra la/.test(atual))return null;
 if(/cotar|cotacao|simular|simulacao/.test(atual)&&!/mesmo|esse|essa|comparar|diferenca|se for/.test(atual))return null;
 const recentes=historico.slice(-14);
 const falouDeUsos=recentes.some(x=>x.role==="user"&&
   /particular/.test(norm(x.content))&&/aplicativo|uber/.test(norm(x.content)));
 const pediuValor=recentes.some(x=>x.role==="user"&&
   /preco|valor|quanto fica|simular|simulacao|cotacao/.test(norm(x.content))&&
   /aplicativo|uber|valores|diferenca/.test(norm(x.content)));
 const planoPendente=/gerar|simular|cotacao/.test(norm(proximaAcao||""))&&
   /aplicativo/.test(norm(proximaAcao||""));
 if(/quanto fica|quanto seria|em valores|diferenca de valor/.test(atual)&&
   falouDeUsos)return "aplicativo";
 const aceite=/^(sim|isso|isso mesmo|pode|pode gerar|pode fazer|confirmo|ok|ja falei acima|ja disse acima|ja informei)$/.test(atual);
 if(aceite&&/comparativo|cotacao (?:ja |foi )?(?:gerada|enviada)/.test(norm(anterior)))return null;
 if(aceite&&(pediuValor||planoPendente)&&
   /cotacao|simulacao|gerar|modelo|ano|valor/.test(norm(anterior)))
   return "aplicativo";
 if(/(?:uso (?:em )?aplicativo|para aplicativo|uber)/.test(atual)&&
   /\b(?:19|20)\d{2}\b/.test(atual))return "aplicativo";
 return null;
}

/** Verifica se os dados enviados se referem à família da última cotação.
 * Não confunde o nome de um carro novo com o que foi cotado anteriormente.
 */
export function dadosCorrespondemCotacao(
 mensagem:string,veiculo:string,ano:number
):boolean{
 const texto=norm(mensagem).replace(/[^a-z0-9]+/g," ").trim();
 if(!new RegExp("(^| )"+String(ano)+"( |$)").test(texto))return false;
 const marcas=new Set(("gm vw volkswagen chevrolet fiat ford toyota hyundai " +
   "honda peugeot renault nissan bmw audi jeep mercedes benz mitsubishi " +
   "citroen kia land rover byd chery volvo porsche suzuki").split(" "));
 const palavras=norm(veiculo).replace(/[^a-z0-9]+/g," ").split(" ");
 const modelo=palavras.find(p=>p.length>=2&&!marcas.has(p)&&
   !/^(?:19|20)\d{2}$/.test(p));
 return Boolean(modelo&&texto.split(" ").includes(modelo));
}

export function citouVeiculoDiferente(
 mensagem:string,veiculo:string,ano:number
):boolean{
 const texto=norm(mensagem).replace(/[^a-z0-9]+/g," ").trim();
 const anoInformado=texto.match(/\b(?:19|20)\d{2}\b/)?.[0]||"";
 if(!anoInformado)return false;
 if(Number(anoInformado)!==ano)return true;
 if(dadosCorrespondemCotacao(mensagem,veiculo,ano))return false;
 const resto=texto.replace(/\b(?:19|20)\d{2}\b/g," ")
   .replace(/\b(?:uso|em|para|aplicativo|particular|uber|carro|veiculo|modelo|ano|o|a|de|do|da|meu|minha|esse|essa|mesmo)\b/g," ")
   .replace(/\s+/g," ").trim();
 return resto.split(" ").some(t=>t.length>=3);
}
