/** Referências reais retornadas pela FIPE neste pedido, nunca pela IA. */
export type ReferenciaVersaoFipe={
  name:string;code:string;tipo:"cars"|"motorcycles"|"trucks";
};

export function normalizarReferenciasFipe(valor:unknown):ReferenciaVersaoFipe[]{
  if(!Array.isArray(valor))return [];
  const itens:ReferenciaVersaoFipe[]=[];
  const vistos=new Set<string>();
  for(const bruto of valor.slice(0,80)){
    if(!bruto||typeof bruto!=="object")continue;
    const obj=bruto as Record<string,unknown>;
    const name=typeof obj.name==="string"?obj.name.trim().slice(0,160):"";
    const code=typeof obj.code==="string"?obj.code.trim():"";
    const tipo=obj.tipo;
    if(!name||!/^\d{1,12}$/.test(code)||
      (tipo!=="cars"&&tipo!=="motorcycles"&&tipo!=="trucks"))continue;
    const chave=tipo+":"+code;
    if(vistos.has(chave))continue;
    vistos.add(chave);
    itens.push({name,code,tipo});
    if(itens.length>=40)break;
  }
  return itens;
}

export function referenciaDaVersaoFipe(
  referencias:ReferenciaVersaoFipe[],versao:string,
):ReferenciaVersaoFipe|null{
  return referencias.find(ref=>ref.name.trim()===String(versao||"").trim())||null;
}
