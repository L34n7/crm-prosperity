"use client";

import type {CondicoesContratacao} from "@/lib/cotacoes-veiculares/condicoes-contratacao";
import styles from "./CondicoesContratacaoEditor.module.css";

type Props={
  value:CondicoesContratacao;
  onChange:(value:CondicoesContratacao)=>void;
  podeConfigurar:boolean;
  carregando:boolean;
  erro?:string;
};

function reais(v:number|null):string{
  return v===null?"":String(v/100);
}

export default function CondicoesContratacaoEditor({
  value,onChange,podeConfigurar,carregando,erro,
}:Props){
  function alterar<K extends keyof CondicoesContratacao>(
    chave:K,valor:CondicoesContratacao[K],
  ){
    onChange({...value,[chave]:valor});
  }
  function valorMonetario(
    chave:keyof Pick<CondicoesContratacao,
      "adesao_centavos"|"rastreador_carro_acima_centavos"|
      "rastreador_moto_acima_centavos"|"rastreador_instalacao_centavos"|
      "rastreador_mensalidade_adicional_centavos">,
    entrada:string,
  ){
    const centavos=entrada.trim()===""?null:Math.round(Number(entrada)*100);
    if(centavos!==null&&(!Number.isSafeInteger(centavos)||centavos<0))return;
    alterar(chave,centavos as never);
  }
  const bloqueado=carregando||!podeConfigurar;

  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Condições de contratação deste plano</span>
          <h4>Taxa de adesão e rastreador</h4>
          <p>Configure as condições exclusivas deste plano. Para outro plano, preencha novamente no próprio cadastro. Tudo será salvo em “Salvar regras e avançar”.</p>
        </div>
      </div>
      {carregando?<p className={styles.note}>Carregando as condições do plano...</p>:null}
      {erro?<p className={styles.error} role="alert">{erro}</p>:null}
      <fieldset className={styles.fields} disabled={bloqueado}>
        <div className={styles.group}>
          <label className={styles.check}>
            <input type="checkbox" checked={value.adesao_ativa}
              onChange={e=>alterar("adesao_ativa",e.target.checked)}/>
            <span>
              <strong>Existe taxa de adesão para contratar este plano?</strong>
              <small>É paga uma única vez para entrar na proteção veicular. Não é taxa do rastreador e não entra na mensalidade.</small>
            </span>
          </label>
          {value.adesao_ativa&&(
            <label className={styles.moneyField}>
              <span>Valor da taxa de adesão (R$)</span>
              <input type="number" min="0" max="1000000" step="0.01"
                placeholder="A confirmar"
                value={reais(value.adesao_centavos)}
                onChange={e=>valorMonetario("adesao_centavos",e.target.value)}/>
              <small>Deixe em branco se a equipe ainda não informou o valor. A cotação mostrará “a confirmar”, sem inventar uma taxa.</small>
            </label>
          )}
        </div>
        <div className={styles.group}>
          <label className={styles.check}>
            <input type="checkbox" checked={value.rastreador_ativo}
              onChange={e=>alterar("rastreador_ativo",e.target.checked)}/>
            <span>
              <strong>Rastreador obrigatório acima de um valor FIPE?</strong>
              <small>Informe os limites e o custo da instalação. São condições diferentes da taxa de adesão.</small>
            </span>
          </label>
          {value.rastreador_ativo&&(
            <>
              <div className={styles.grid}>
                <label className={styles.moneyField}>
                  <span>Automóveis com FIPE acima de (R$)</span>
                  <input type="number" min="0" max="20000000" step="0.01"
                    placeholder="Não obrigatório"
                    value={reais(value.rastreador_carro_acima_centavos)}
                    onChange={e=>valorMonetario("rastreador_carro_acima_centavos",e.target.value)}/>
                </label>
                <label className={styles.moneyField}>
                  <span>Motocicletas com FIPE acima de (R$)</span>
                  <input type="number" min="0" max="20000000" step="0.01"
                    placeholder="Não obrigatório"
                    value={reais(value.rastreador_moto_acima_centavos)}
                    onChange={e=>valorMonetario("rastreador_moto_acima_centavos",e.target.value)}/>
                </label>
                <label className={styles.moneyField}>
                  <span>Taxa de instalação do rastreador (R$)</span>
                  <input type="number" min="0" max="1000000" step="0.01"
                    value={reais(value.rastreador_instalacao_centavos)}
                    onChange={e=>valorMonetario("rastreador_instalacao_centavos",e.target.value)}/>
                  <small>Pagamento único, somente para veículos que exigem rastreador.</small>
                </label>
              </div>
              <div className={styles.trackerMonthly}>
                <strong>Como é cobrada a mensalidade do rastreador?</strong>
                <p>Este custo é diferente da instalação e da taxa de adesão.</p>
                <label className={styles.choice}>
                  <input type="radio" name="rastreador_mensalidade_inclusa"
                    checked={value.rastreador_mensalidade_inclusa}
                    onChange={()=>alterar("rastreador_mensalidade_inclusa",true)}/>
                  <span>Já está incluída na mensalidade do plano — não acrescentar nada.</span>
                </label>
                <label className={styles.choice}>
                  <input type="radio" name="rastreador_mensalidade_inclusa"
                    checked={!value.rastreador_mensalidade_inclusa}
                    onChange={()=>alterar("rastreador_mensalidade_inclusa",false)}/>
                  <span>É cobrada à parte — adicionar um valor mensal.</span>
                </label>
                {!value.rastreador_mensalidade_inclusa&&(
                  <label className={styles.moneyField}>
                    <span>Valor mensal adicional do rastreador (R$)</span>
                    <input type="number" min="0.01" max="1000000" step="0.01"
                      value={reais(value.rastreador_mensalidade_adicional_centavos)}
                      onChange={e=>valorMonetario("rastreador_mensalidade_adicional_centavos",e.target.value)}/>
                  </label>
                )}
              </div>
            </>
          )}
        </div>
      </fieldset>
      <p className={styles.note}>
        As taxas únicas serão informadas separadamente na proposta. A mensalidade do plano só terá acréscimo se você escolher cobrar o rastreador à parte.
      </p>
    </section>
  );
}
