/** Converte o nome amigável de um grupo em um identificador técnico,
 * compatível com o campo grupo_exclusivo já usado nas cotações.
 * Não altera códigos antigos e não depende de uma lista fixa de grupos.
 */
export function codigoGrupoOpcional(nome:string):string{
  const texto=String(nome||"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().trim().replace(/\s+/g," ");
  const semPrefixo=texto.replace(/^grupo(?:\s+|[_-]+)/,"");
  return semPrefixo.replace(/[^a-z0-9]+/g,"_")
    .replace(/^_+|_+$/g,"").slice(0,50).replace(/_+$/,"");
}

export function rotuloGrupoOpcional(codigo:string):string{
  const nome=String(codigo||"").replace(/_/g," ")
    .trim().replace(/^grupo\s+/i,"").replace(/\s+/g," ");
  if(!nome)return "Sem grupo";
  return "Grupo "+nome.charAt(0).toLocaleUpperCase("pt-BR")+nome.slice(1);
}

export function listarGruposOpcionais(itens:{grupo_exclusivo:string}[]):string[]{
  return [...new Set(itens.map(i=>i.grupo_exclusivo||"").filter(Boolean))]
    .sort((a,b)=>rotuloGrupoOpcional(a).localeCompare(rotuloGrupoOpcional(b),"pt-BR"));
}
