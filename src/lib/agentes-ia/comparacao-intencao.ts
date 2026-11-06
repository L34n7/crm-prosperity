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
