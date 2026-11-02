"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import type { CategoriaCotacao, PlanoCotacao } from "@/lib/cotacoes-veiculares/catalogo";
import {
  ENERGIAS_VEICULO, USOS_VEICULO, regraVazia, validarRegraComercial,
  type OpcionalComercial, type RegraComercialPlano,
  type EnergiaVeiculo, type UsoVeiculo,
} from "@/lib/cotacoes-veiculares/comercial";
import styles from "./page.module.css";

type RegraBanco = RegraComercialPlano & {empresa_id?:string;updated_at?:string};
type OpcionalBanco = OpcionalComercial & {plano:PlanoCotacao;categoria:string};

type Props = {
  categoria: CategoriaCotacao;
  regras: RegraBanco[];
  opcionais: OpcionalBanco[];
  podeConfigurar: boolean;
  onSaved: () => Promise<void>;
};

const planos:PlanoCotacao[]=["premium","completo"];
const dinheiro=(valor:number)=>Number((valor/100).toFixed(2));
const centavos=(valor:string)=>Math.round(Number(valor||0)*100);

export default function ConfiguracaoComercialEditor({categoria,regras,opcionais,podeConfigurar,onSaved}:Props) {
  const [rascunhos,setRascunhos]=useState<Record<PlanoCotacao,RegraComercialPlano>>({
    premium:regraVazia(categoria,"premium"),completo:regraVazia(categoria,"completo"),
  });
  const [extras,setExtras]=useState<Record<PlanoCotacao,OpcionalComercial[]>>({premium:[],completo:[]});
  const [salvando,setSalvando]=useState<PlanoCotacao|null>(null);
  const [erro,setErro]=useState("");
  const [sucesso,setSucesso]=useState("");

  useEffect(()=>{
    setRascunhos({
      premium: regras.find(r=>r.plano==="premium") || regraVazia(categoria,"premium"),
      completo: regras.find(r=>r.plano==="completo") || regraVazia(categoria,"completo"),
    });
    setExtras({
      premium: opcionais.filter(v=>v.plano==="premium").map(v=>({
        codigo:v.codigo,nome:v.nome,valor_centavos:v.valor_centavos,grupo_exclusivo:v.grupo_exclusivo||"",ativo:v.ativo,
      })),
      completo: opcionais.filter(v=>v.plano==="completo").map(v=>({
        codigo:v.codigo,nome:v.nome,valor_centavos:v.valor_centavos,grupo_exclusivo:v.grupo_exclusivo||"",ativo:v.ativo,
      })),
    });
    setErro("");setSucesso("");
  },[categoria,regras,opcionais]);

  function alterar(plano:PlanoCotacao,campo:keyof RegraComercialPlano,valor:unknown) {
    setRascunhos(atual=>({...atual,[plano]:{...atual[plano],[campo]:valor}}));
  }
  function marcar(plano:PlanoCotacao,campo:"usos_permitidos"|"energias_permitidas",valor:string,ativo:boolean) {
    setRascunhos(atual=>{
      const atualPlano=atual[plano];
      const atualLista=atualPlano[campo] as string[];
      const proxima=ativo?[...new Set([...atualLista,valor])]:atualLista.filter(item=>item!==valor);
      return {...atual,[plano]:{...atualPlano,[campo]:proxima}};
    });
  }
  function adicionarOpcional(plano:PlanoCotacao) {
    setExtras(atual=>{
      const usados=new Set(atual[plano].map(item=>item.codigo));
      let numero=1;while(usados.has("novo_"+numero))numero++;
      return {...atual,[plano]:[
        ...atual[plano],{codigo:"novo_"+numero,nome:"",valor_centavos:0,grupo_exclusivo:"",ativo:true},
      ]};
    });
  }
  function alterarOpcional(plano:PlanoCotacao,index:number,campo:keyof OpcionalComercial,valor:string|boolean|number) {
    setExtras(atual=>({...atual,[plano]:atual[plano].map((item,i)=>i===index?{...item,[campo]:valor}:item)}));
  }
  async function salvar(plano:PlanoCotacao) {
    setErro("");setSucesso("");
    const regra={...rascunhos[plano],
      coberturas:rascunhos[plano].coberturas.map(v=>v.trim()).filter(Boolean),
    };
    const problema=validarRegraComercial(regra,extras[plano]);
    if(problema){setErro((plano==="premium"?"Premium: ":"Completo: ")+problema);return;}
    setSalvando(plano);
    try{
      const res=await fetch("/api/cotacoes-veiculares/comercial",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({acao:"regra",regra,opcionais:extras[plano]}),
      });
      const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Não foi possível salvar as regras.");
      setSucesso("Plano "+(plano==="premium"?"Premium":"Completo")+" configurado.");
      await onSaved();
    }catch(e){setErro(e instanceof Error?e.message:"Erro ao salvar.");}
    finally{setSalvando(null);}
  }

  return <section className={styles.panel}>
    <div className={styles.sectionHeading}>
      <h2>Regras e coberturas por plano</h2>
      <p>Configure cada plano desta categoria. Use valores reais da associação. Os itens são exclusivos da sua empresa.</p>
    </div>
    {erro&&<p className={styles.error} role="alert">{erro}</p>}
    {sucesso&&<p className={styles.success} role="status">{sucesso}</p>}
    <div className={styles.commercialGrid}>
      {planos.map(plano=>{
        const regra=rascunhos[plano];
        const salvo=regras.some(item=>item.plano===plano);
        return <article className={styles.commercialCard} key={plano}>
          <div className={styles.commercialCardHeading}>
            <h3>Plano {plano==="premium"?"Premium":"Completo"}</h3>
            <span className={salvo?styles.goodStatus:styles.pendingStatus}>
              {salvo?"Cadastrado":"Não configurado"}
            </span>
          </div>
          <div className={styles.fields}>
            <label>Participação (%)
              <input type="number" min="0" max="100" step="0.001" disabled={!podeConfigurar}
                value={regra.participacao_percentual}
                onChange={e=>alterar(plano,"participacao_percentual",Number(e.target.value))}/>
            </label>
            <label>Participação mínima (R$)
              <input type="number" min="0" step="0.01" disabled={!podeConfigurar}
                value={dinheiro(regra.participacao_min_centavos)}
                onChange={e=>alterar(plano,"participacao_min_centavos",centavos(e.target.value))}/>
            </label>
            <label>Cobertura para terceiros (R$)
              <input type="number" min="0" step="0.01" disabled={!podeConfigurar}
                value={dinheiro(regra.terceiros_limite_centavos)}
                onChange={e=>alterar(plano,"terceiros_limite_centavos",centavos(e.target.value))}/>
            </label>
            <label>Assistência 24h (km totais)
              <input type="number" min="0" step="1" disabled={!podeConfigurar}
                value={regra.assistencia_km_total}
                onChange={e=>alterar(plano,"assistencia_km_total",Number(e.target.value))}/>
            </label>
            <label>Acionamentos de assistência por ano
              <input type="number" min="0" step="1" disabled={!podeConfigurar}
                value={regra.assistencias_ano}
                onChange={e=>alterar(plano,"assistencias_ano",Number(e.target.value))}/>
            </label>
            <label>Carro reserva incluído (dias)
              <input type="number" min="0" step="1" disabled={!podeConfigurar}
                value={regra.carro_reserva_incluso_dias}
                onChange={e=>alterar(plano,"carro_reserva_incluso_dias",Number(e.target.value))}/>
            </label>
          </div>
          <label className={styles.commercialField}>Coberturas do plano (uma por linha)
            <textarea rows={4} disabled={!podeConfigurar}
              placeholder={"Roubo e furto\nColisão\nAssistência 24 horas"}
              value={regra.coberturas.join("\n")}
              onChange={e=>alterar(plano,"coberturas",e.target.value.split("\n"))}/>
          </label>
          <div className={styles.commercialChoices}>
            <fieldset disabled={!podeConfigurar}>
              <legend>Finalidades de uso atendidas</legend>
              {Object.entries(USOS_VEICULO).map(([codigo,nome])=>
                <label key={codigo}><input type="checkbox"
                  checked={regra.usos_permitidos.includes(codigo as UsoVeiculo)}
                  onChange={e=>marcar(plano,"usos_permitidos",codigo,e.target.checked)}/>{nome}</label>)}
            </fieldset>
            <fieldset disabled={!podeConfigurar}>
              <legend>Motorização atendida</legend>
              {Object.entries(ENERGIAS_VEICULO).map(([codigo,nome])=>
                <label key={codigo}><input type="checkbox"
                  checked={regra.energias_permitidas.includes(codigo as EnergiaVeiculo)}
                  onChange={e=>marcar(plano,"energias_permitidas",codigo,e.target.checked)}/>{nome}</label>)}
            </fieldset>
          </div>
          <label className={styles.commercialField}>Condições e observações (opcional)
            <textarea rows={2} maxLength={1000} disabled={!podeConfigurar}
              value={regra.observacoes} onChange={e=>alterar(plano,"observacoes",e.target.value)}/>
          </label>
          <div className={styles.commercialExtrasHeading}>
            <strong>Opcionais</strong>
            <button type="button" className={styles.secondary} disabled={!podeConfigurar} onClick={()=>adicionarOpcional(plano)}>
              <Plus size={15}/> Adicionar
            </button>
          </div>
          <p className={styles.smallNote}>Opcional sem cadastro significa que o plano não oferece adicionais. Use o mesmo grupo para impedir seleção conjunta.</p>
          {extras[plano].map((item,i)=><div className={styles.commercialExtra} key={i}>
            <div className={styles.commercialExtraFields}>
              <label>Nome
                <input disabled={!podeConfigurar} value={item.nome} placeholder="Ex.: Carro reserva"
                  onChange={e=>alterarOpcional(plano,i,"nome",e.target.value)}/>
              </label>
              <label>Código interno
                <input disabled={!podeConfigurar} value={item.codigo} placeholder="carro_reserva"
                  onChange={e=>alterarOpcional(plano,i,"codigo",e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}/>
              </label>
              <label>Adicional mensal (R$)
                <input type="number" min="0" step="0.01" disabled={!podeConfigurar}
                  value={dinheiro(item.valor_centavos)}
                  onChange={e=>alterarOpcional(plano,i,"valor_centavos",centavos(e.target.value))}/>
              </label>
              <label>Grupo exclusivo (opcional)
                <input disabled={!podeConfigurar} value={item.grupo_exclusivo}
                  placeholder="carro_reserva"
                  onChange={e=>alterarOpcional(plano,i,"grupo_exclusivo",e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}/>
              </label>
            </div>
            <div className={styles.commercialExtraActions}>
              <label><input type="checkbox" disabled={!podeConfigurar} checked={item.ativo}
                onChange={e=>alterarOpcional(plano,i,"ativo",e.target.checked)}/> Disponível</label>
              <button type="button" className={styles.commercialRemove} disabled={!podeConfigurar}
                onClick={()=>setExtras(atual=>({...atual,[plano]:atual[plano].filter((_,indice)=>indice!==i)}))}>
                <Trash2 size={15}/> Remover
              </button>
            </div>
          </div>)}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={!podeConfigurar||salvando!==null}
              onClick={()=>void salvar(plano)}>
              <Save size={16}/> {salvando===plano?"Salvando...":"Salvar regras do plano"}
            </button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
