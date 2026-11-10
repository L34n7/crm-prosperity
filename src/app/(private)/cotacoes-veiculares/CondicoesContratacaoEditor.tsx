"use client";

import type {CondicoesContratacao} from "@/lib/cotacoes-veiculares/condicoes-contratacao";
import CampoMoeda from "./CampoMoeda";
import styles from "./CondicoesContratacaoEditor.module.css";

type Props={
  value:CondicoesContratacao;
  onChange:(value:CondicoesContratacao)=>void;
  podeConfigurar:boolean;
  carregando:boolean;
  erro?:string;
};

const MAX_TAXA_CENTAVOS=100_000_000;
const MAX_FIPE_CENTAVOS=2_000_000_000;

export default function CondicoesContratacaoEditor({
  value,onChange,podeConfigurar,carregando,erro,
}:Props){
  function alterar<K extends keyof CondicoesContratacao>(
    chave:K,valor:CondicoesContratacao[K],
  ){
    onChange({...value,[chave]:valor});
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
            <>
              <strong>Como a adesão é calculada?</strong>
              <label className={styles.choice}>
                <input type="radio" name="adesao_tipo"
                  checked={value.adesao_tipo==="mensalidade_mais_taxa"}
                  onChange={()=>alterar("adesao_tipo","mensalidade_mais_taxa")}/>
                <span>Primeira mensalidade + taxa adicional (próxima mensalidade em 30 dias).</span>
              </label>
              <label className={styles.choice}>
                <input type="radio" name="adesao_tipo"
                  checked={value.adesao_tipo==="fixa"}
                  onChange={()=>alterar("adesao_tipo","fixa")}/>
                <span>Taxa de adesão fixa, cobrada separadamente da mensalidade.</span>
              </label>
              <label className={styles.moneyField}>
                <span>{value.adesao_tipo==="mensalidade_mais_taxa"
                  ?"Taxa adicional sobre a primeira mensalidade (R$)"
                  :"Valor fixo da taxa de adesão (R$)"}</span>
                <CampoMoeda centavos={value.adesao_centavos}
                  maximoCentavos={MAX_TAXA_CENTAVOS}
                  permitirVazio placeholder="A confirmar"
                  onChange={v=>alterar("adesao_centavos",v)}/>
                <small>{value.adesao_tipo==="mensalidade_mais_taxa"
                  ?"Exemplo: mensalidade de R$ 463,17 + R$ 150,00 = adesão de R$ 613,17. A instalação, se obrigatória, é somada apenas no primeiro pagamento."
                  :"Deixe em branco se o valor ainda não foi informado. A proposta exibirá “a confirmar”."}</small>
              </label>
            </>
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
                  <CampoMoeda centavos={value.rastreador_carro_acima_centavos}
                    maximoCentavos={MAX_FIPE_CENTAVOS}
                    permitirVazio placeholder="Não obrigatório"
                    onChange={v=>alterar("rastreador_carro_acima_centavos",v)}/>
                </label>
                <label className={styles.moneyField}>
                  <span>Motocicletas com FIPE acima de (R$)</span>
                  <CampoMoeda centavos={value.rastreador_moto_acima_centavos}
                    maximoCentavos={MAX_FIPE_CENTAVOS}
                    permitirVazio placeholder="Não obrigatório"
                    onChange={v=>alterar("rastreador_moto_acima_centavos",v)}/>
                </label>
                <label className={styles.moneyField}>
                  <span>Taxa de instalação do rastreador (R$)</span>
                  <CampoMoeda centavos={value.rastreador_instalacao_centavos}
                    maximoCentavos={MAX_TAXA_CENTAVOS}
                    onChange={v=>alterar("rastreador_instalacao_centavos",v??0)}/>
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
                    <CampoMoeda centavos={value.rastreador_mensalidade_adicional_centavos}
                      maximoCentavos={MAX_TAXA_CENTAVOS}
                      onChange={v=>alterar("rastreador_mensalidade_adicional_centavos",v??0)}/>
                  </label>
                )}
              </div>
            </>
          )}
        </div>
      </fieldset>
      <p className={styles.note}>
        Digite somente os números: pontos e vírgulas são adicionados automaticamente. Exemplo: 1.000,00.
      </p>
      <p className={styles.note}>
        Na adesão com primeira mensalidade incluída, a cotação mostra o total para contratar e o valor recorrente após 30 dias, sem cobrar a primeira mensalidade novamente. A instalação é avulsa quando obrigatória.
      </p>
    </section>
  );
}
