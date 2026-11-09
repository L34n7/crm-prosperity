"use client";

import {useEffect,useState} from "react";
import styles from "../page.module.css";

type Plano={codigo:string;nome:string;ordem:number;ativo:boolean};
type Props={
  config:Record<string,unknown>;
  onChange:(chave:string,valor:unknown)=>void;
  onError:(mensagem:string)=>void;
};

export default function CotacaoPlanosFerramentaEditor({
  config,onChange,onError,
}:Props){
  const [planos,setPlanos]=useState<Plano[]>([]);
  const [carregando,setCarregando]=useState(true);
  const [erro,setErro]=useState("");

  useEffect(()=>{
    let cancelado=false;
    async function carregar(){
      try{
        const resposta=await fetch("/api/cotacoes-veiculares/planos",{
          cache:"no-store",
        });
        const dados=await resposta.json();
        if(!resposta.ok||!dados?.ok)
          throw new Error(dados?.error||"Não foi possível carregar os planos.");
        if(!cancelado){
          setPlanos(Array.isArray(dados.planos)?dados.planos:[]);
          setErro("");
        }
      }catch(error){
        if(!cancelado)setErro(error instanceof Error?
          error.message:"Não foi possível consultar os planos da empresa.");
      }finally{
        if(!cancelado)setCarregando(false);
      }
    }
    void carregar();
    return ()=>{cancelado=true;};
  },[]);

  const ativos=planos.filter(plano=>plano.ativo)
    .sort((a,b)=>a.ordem-b.ordem);
  const configurados=Array.isArray(config.planos_cotacao_codigos)
    ?config.planos_cotacao_codigos.filter(
      (codigo):codigo is string=>typeof codigo==="string",
    )
    :null;
  const selecionados=configurados||ativos.map(plano=>plano.codigo);
  const selecionadosSet=new Set(selecionados);
  const indisponiveis=(configurados||[]).filter(codigo=>
    !ativos.some(plano=>plano.codigo===codigo));
  const totalSelecionados=ativos.filter(plano=>
    selecionadosSet.has(plano.codigo)).length;

  function alternar(codigo:string,marcado:boolean){
    const novos=ativos.filter(plano=>
      plano.codigo===codigo?marcado:selecionadosSet.has(plano.codigo)
    ).map(plano=>plano.codigo);
    if(novos.length===0){
      onError("Selecione pelo menos um plano para a cotação automática.");
      return;
    }
    // null significa "todos os planos ativos", inclusive os criados
    // futuramente; seleção explícita continua restrita aos códigos salvos.
    onChange("planos_cotacao_codigos",
      novos.length===ativos.length?null:novos);
  }

  return (
    <div className={styles.cotacaoPlanosEditor}>
      <div className={styles.cotacaoPlanosCabecalho}>
        <div>
          <strong>Planos permitidos para este agente</strong>
          <small>Escolha quais planos a IA poderá calcular e apresentar nas cotações. Os demais continuam cadastrados no módulo Cotação.</small>
        </div>
        {ativos.length>0&&(
          <span className={styles.cotacaoPlanosContador}>
            {totalSelecionados} de {ativos.length}
          </span>
        )}
      </div>

      {carregando?(
        <small className={styles.fieldHint}>Carregando planos ativos...</small>
      ):erro?(
        <small className={styles.cotacaoPosEnvioErro} role="alert">{erro}</small>
      ):ativos.length===0?(
        <small className={styles.cotacaoPosEnvioErro}>
          Nenhum plano ativo encontrado. Cadastre e ative um plano no módulo Cotação.
        </small>
      ):(
        <>
          <div className={styles.cotacaoPlanosLista}>
            {ativos.map(plano=>(
              <label key={plano.codigo} className={styles.cotacaoPlanoOpcao}>
                <input type="checkbox"
                  checked={selecionadosSet.has(plano.codigo)}
                  onChange={event=>alternar(plano.codigo,event.target.checked)}
                />
                <span>{plano.nome}</span>
              </label>
            ))}
          </div>
          <div className={styles.cotacaoPlanosRodape}>
            <small className={styles.fieldHint}>
              {configurados
                ?"Somente os planos selecionados serão incluídos nas propostas deste agente."
                :"Padrão: todos os planos ativos da empresa."}
            </small>
            {configurados&&(
              <button type="button" className={styles.cotacaoPlanosTodos}
                onClick={()=>onChange("planos_cotacao_codigos",null)}>
                Selecionar todos
              </button>
            )}
          </div>
          {indisponiveis.length>0&&(
            <small className={styles.cotacaoPosEnvioErro} role="alert">
              A configuração contém um plano desativado ou excluído. Atualize a seleção e salve o agente.
            </small>
          )}
        </>
      )}
    </div>
  );
}
