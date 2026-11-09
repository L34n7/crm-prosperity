"use client";

import {useEffect,useState} from "react";
import {CheckCircle2,Loader2,Save,RotateCcw} from "lucide-react";
import {
  CONDICOES_CONTRATACAO_PADRAO,
  type CondicoesContratacao,
} from "@/lib/cotacoes-veiculares/condicoes-contratacao";
import styles from "./CondicoesContratacaoEditor.module.css";

type Resposta={
  ok:boolean;error?:string;
  padrao:CondicoesContratacao;
  personalizada:CondicoesContratacao|null;
  efetiva:CondicoesContratacao;
};
type Props={plano:string;nomePlano:string;podeConfigurar:boolean};

function reais(v:number|null):string{
  return v===null?"":(v/100).toFixed(2);
}
const moeda=(v:number)=>new Intl.NumberFormat("pt-BR",{
  style:"currency",currency:"BRL",
}).format(v/100);

export default function CondicoesContratacaoEditor({
  plano,nomePlano,podeConfigurar,
}:Props){
  const [padrao,setPadrao]=useState<CondicoesContratacao>({
    ...CONDICOES_CONTRATACAO_PADRAO,
  });
  const [personalizada,setPersonalizada]=useState<CondicoesContratacao|null>(null);
  const [escopo,setEscopo]=useState<"padrao"|"plano">("plano");
  const [carregando,setCarregando]=useState(true);
  const [salvando,setSalvando]=useState(false);
  const [erro,setErro]=useState("");
  const [sucesso,setSucesso]=useState("");

  useEffect(()=>{
    let ativo=true;
    setCarregando(true);setErro("");setSucesso("");
    async function carregar(){
      try{
        const resp=await fetch(
          "/api/cotacoes-veiculares/condicoes?plano="+encodeURIComponent(plano),
          {cache:"no-store"},
        );
        const json=await resp.json() as Resposta;
        if(!resp.ok||!json.ok)throw new Error(
          json.error||"Falha ao carregar taxas e rastreador.");
        if(ativo){
          setPadrao(json.padrao);
          setPersonalizada(json.personalizada);
          setErro("");
        }
      }catch(e){
        if(ativo)setErro(e instanceof Error?e.message:"Falha ao carregar condições.");
      }finally{
        if(ativo)setCarregando(false);
      }
    }
    void carregar();
    return ()=>{ativo=false;};
  },[plano]);

  const editando=escopo==="padrao"?padrao:personalizada||padrao;
  const herdaPadrao=escopo==="plano"&&!personalizada;
  const bloqueado=carregando||salvando||!podeConfigurar||herdaPadrao;

  function alterar<K extends keyof CondicoesContratacao>(
    chave:K,valor:CondicoesContratacao[K],
  ){
    setErro("");setSucesso("");
    if(escopo==="padrao")setPadrao(v=>({...v,[chave]:valor}));
    else setPersonalizada(v=>({...v||padrao,[chave]:valor}));
  }
  function valorMonetario(
    chave:keyof Pick<CondicoesContratacao,
      "adesao_centavos"|"rastreador_carro_acima_centavos"|
      "rastreador_moto_acima_centavos"|"rastreador_instalacao_centavos"|
      "rastreador_mensalidade_adicional_centavos">,
    valor:string,
  ){
    const numero=valor===""?null:Math.round(Number(valor)*100);
    if(numero!==null&&(!Number.isFinite(numero)||numero<0))return;
    alterar(chave,numero as never);
  }

  async function enviar(escopoNovo:"padrao"|"plano"|"herdar"){
    if(salvando)return;
    setSalvando(true);setErro("");setSucesso("");
    try{
      const resp=await fetch("/api/cotacoes-veiculares/condicoes",{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          escopo:escopoNovo,plano,
          config:escopoNovo==="padrao"?padrao:personalizada,
        }),
      });
      const json=await resp.json() as Resposta;
      if(!resp.ok||!json.ok)
        throw new Error(json.error||"Não foi possível salvar as condições.");
      setPadrao(json.padrao);
      setPersonalizada(json.personalizada);
      setSucesso(escopoNovo==="herdar"
        ?"Plano voltou a utilizar o padrão da empresa."
        :"Taxas e rastreador salvos para as próximas cotações.");
    }catch(e){
      setErro(e instanceof Error?e.message:"Erro ao salvar condições.");
    }finally{setSalvando(false);}
  }

  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Condições de contratação</span>
          <h4>Taxa de adesão e rastreador</h4>
          <p>Regras automáticas baseadas no valor FIPE. Não alteram a mensalidade importada nem as propostas antigas.</p>
        </div>
        {salvando&&<Loader2 size={19} className={styles.spin}/>}
      </div>
      <div className={styles.tabs} role="group" aria-label="Escopo das taxas">
        <button type="button" onClick={()=>{setEscopo("plano");setErro("");setSucesso("");}}
          aria-pressed={escopo==="plano"} className={escopo==="plano"?styles.active:""}>
          Plano {nomePlano}
        </button>
        <button type="button" onClick={()=>{setEscopo("padrao");setErro("");setSucesso("");}}
          aria-pressed={escopo==="padrao"} className={escopo==="padrao"?styles.active:""}>
          Padrão da empresa
        </button>
      </div>
      {carregando?(
        <p className={styles.note}><Loader2 size={16} className={styles.spin}/> Carregando condições...</p>
      ):(
        <>
          {herdaPadrao&&(
            <div className={styles.inherited}>
              <CheckCircle2 size={18}/>
              <div>
                <strong>Este plano usa as regras padrão da empresa.</strong>
                <p>Para definir taxas diferentes apenas para {nomePlano}, personalize este plano.</p>
              </div>
              {podeConfigurar&&(
                <button type="button" onClick={()=>setPersonalizada({...padrao})}>
                  Personalizar
                </button>
              )}
            </div>
          )}
          <fieldset className={styles.fields} disabled={bloqueado}>
            <div className={styles.group}>
              <label className={styles.check}>
                <input type="checkbox" checked={editando.adesao_ativa}
                  onChange={e=>alterar("adesao_ativa",e.target.checked)}/>
                <span>
                  <strong>Cobrar taxa de adesão</strong>
                  <small>Valor único, independente da mensalidade do plano.</small>
                </span>
              </label>
              {editando.adesao_ativa&&(
                <label className={styles.moneyField}>
                  <span>Taxa de adesão (R$)</span>
                  <input type="number" min="0" max="1000000" step="0.01"
                    placeholder="A confirmar"
                    value={reais(editando.adesao_centavos)}
                    onChange={e=>valorMonetario("adesao_centavos",e.target.value)}/>
                  <small>Deixe vazio se a equipe ainda não informou o valor. A proposta exibirá “a confirmar”.</small>
                </label>
              )}
            </div>
            <div className={styles.group}>
              <label className={styles.check}>
                <input type="checkbox" checked={editando.rastreador_ativo}
                  onChange={e=>alterar("rastreador_ativo",e.target.checked)}/>
                <span>
                  <strong>Exigir rastreador por valor FIPE</strong>
                  <small>A regra só é aplicada acima do limite, nunca no valor igual.</small>
                </span>
              </label>
              {editando.rastreador_ativo&&(
                <>
                  <div className={styles.grid}>
                    <label className={styles.moneyField}>
                      <span>Automóveis acima de (R$)</span>
                      <input type="number" min="0" max="20000000" step="0.01"
                        placeholder="Sem exigência"
                        value={reais(editando.rastreador_carro_acima_centavos)}
                        onChange={e=>valorMonetario("rastreador_carro_acima_centavos",e.target.value)}/>
                    </label>
                    <label className={styles.moneyField}>
                      <span>Motocicletas acima de (R$)</span>
                      <input type="number" min="0" max="20000000" step="0.01"
                        placeholder="Sem exigência"
                        value={reais(editando.rastreador_moto_acima_centavos)}
                        onChange={e=>valorMonetario("rastreador_moto_acima_centavos",e.target.value)}/>
                    </label>
                    <label className={styles.moneyField}>
                      <span>Instalação única (R$)</span>
                      <input type="number" min="0" max="1000000" step="0.01"
                        value={reais(editando.rastreador_instalacao_centavos)}
                        onChange={e=>valorMonetario("rastreador_instalacao_centavos",e.target.value)}/>
                    </label>
                  </div>
                  <label className={styles.check}>
                    <input type="checkbox" checked={editando.rastreador_mensalidade_inclusa}
                      onChange={e=>alterar("rastreador_mensalidade_inclusa",e.target.checked)}/>
                    <span>
                      <strong>Mensalidade do rastreador já incluída na tabela</strong>
                      <small>Quando marcado, não há acréscimo na mensalidade cadastrada.</small>
                    </span>
                  </label>
                  {!editando.rastreador_mensalidade_inclusa&&(
                    <label className={styles.moneyField}>
                      <span>Adicional mensal do rastreador (R$)</span>
                      <input type="number" min="0.01" max="1000000" step="0.01"
                        value={reais(editando.rastreador_mensalidade_adicional_centavos)}
                        onChange={e=>valorMonetario("rastreador_mensalidade_adicional_centavos",e.target.value)}/>
                    </label>
                  )}
                </>
              )}
            </div>
          </fieldset>
          {erro&&<p className={styles.error} role="alert">{erro}</p>}
          {sucesso&&<p className={styles.success} role="status">{sucesso}</p>}
          <div className={styles.footer}>
            <small>{escopo==="padrao"
              ?"Alterar o padrão afeta todos os planos que não possuem personalização própria."
              :herdaPadrao
                ?"Configuração herdada: altere o padrão da empresa ou personalize este plano."
                :"Esta configuração vale apenas para "+nomePlano+"."}</small>
            {podeConfigurar&&!herdaPadrao&&(
              <button type="button" className={styles.save} disabled={salvando||carregando}
                onClick={()=>void enviar(escopo)}>
                <Save size={15}/>{salvando?"Salvando...":"Salvar taxas"}
              </button>
            )}
            {podeConfigurar&&escopo==="plano"&&personalizada&&(
              <button type="button" className={styles.reset} disabled={salvando}
                onClick={()=>void enviar("herdar")}>
                <RotateCcw size={15}/> Voltar ao padrão
              </button>
            )}
          </div>
          {escopo==="plano"&&!personalizada&&padrao.adesao_ativa&&
           padrao.adesao_centavos===null&&(
            <p className={styles.note}>Adesão do padrão da empresa: valor a confirmar.</p>
          )}
        </>
      )}
    </section>
  );
}
