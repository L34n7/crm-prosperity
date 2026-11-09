"use client";

import {
  formatarCentavosMoedaBR,
  centavosDaDigitacaoMoedaBR,
  centavosDoTextoColadoMoedaBR,
} from "@/lib/cotacoes-veiculares/mascara-moeda";

type Props={
  centavos:number|null;
  maximoCentavos:number;
  onChange:(centavos:number|null)=>void;
  placeholder?:string;
  permitirVazio?:boolean;
  disabled?:boolean;
  "aria-invalid"?:boolean;
};

/** Máscara única para todos os campos monetários do cadastro comercial.
 * Nunca converte números de ponto flutuante antes de salvar: todo valor
 * permanece em centavos inteiros no estado e nas APIs.
 */
export default function CampoMoeda({
  centavos,maximoCentavos,onChange,placeholder,permitirVazio=false,
  disabled=false,"aria-invalid":invalido,
}:Props){
  function atualizar(valor:number|null|undefined){
    if(valor===undefined)return;
    onChange(valor===null&&!permitirVazio?0:valor);
  }
  return (
    <input type="text" inputMode="numeric" autoComplete="off"
      disabled={disabled} aria-invalid={invalido}
      placeholder={placeholder||"0,00"}
      value={formatarCentavosMoedaBR(centavos)}
      onFocus={e=>e.currentTarget.select()}
      onChange={e=>atualizar(
        centavosDaDigitacaoMoedaBR(e.target.value,maximoCentavos)
      )}
      onPaste={e=>{
        const valor=centavosDoTextoColadoMoedaBR(
          e.clipboardData.getData("text"),maximoCentavos
        );
        // Colagem de texto malformado ou acima do limite não altera estado.
        e.preventDefault();
        atualizar(valor);
      }}
    />
  );
}
