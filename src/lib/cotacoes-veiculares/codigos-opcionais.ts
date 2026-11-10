import type {OpcionalComercial} from "./comercial";

type OpcionalExistente={codigo:string;nome:string};
const valido=/^[a-z0-9_]{2,50}$/;

function chaveNome(nome:string):string{
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}

/** O código identifica um adicional nos resultados e nas seleções já feitas.
 * Códigos antigos são preservados em edições; novos códigos são derivados
 * do nome SOMENTE no backend e possuem desambiguação determinística.
 */
export function gerarCodigosOpcionais(
  itens:OpcionalComercial[],
  anteriores:OpcionalExistente[],
):OpcionalComercial[]{
  const codigoExistente=new Set(anteriores.map(x=>x.codigo).filter(c=>valido.test(c)));
  const usados=new Set<string>();
  return itens.map(item=>{
    const nome=item.nome.trim().replace(/\s+/g," ");
    let codigo=valido.test(item.codigo)&&codigoExistente.has(item.codigo)
      &&!usados.has(item.codigo)?item.codigo:"";
    if(!codigo){
      const nomeComparacao=chaveNome(nome);
      const correspondente=anteriores.find(x=>
        chaveNome(x.nome)===nomeComparacao&&valido.test(x.codigo)&&!usados.has(x.codigo));
      if(correspondente)codigo=correspondente.codigo;
    }
    if(!codigo){
      const base=chaveNome(nome).replace(/ /g,"_").slice(0,46).replace(/_+$/,"")||"opcional";
      codigo=base.length<2?"opcional":base;
      for(let i=2;usados.has(codigo)||codigoExistente.has(codigo);i++){
        const sufixo="_"+i;
        codigo=base.slice(0,50-sufixo.length).replace(/_+$/,"")+sufixo;
      }
    }
    usados.add(codigo);
    return {...item,nome,codigo};
  });
}
