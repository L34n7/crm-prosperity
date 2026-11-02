"use client";
import { useEffect, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import type { CategoriaCotacao, PlanoEmpresa } from "@/lib/cotacoes-veiculares/catalogo";
import { ENERGIAS_VEICULO,USOS_VEICULO,regraVazia,validarRegraComercial,
 type OpcionalComercial,type RegraComercialPlano,type EnergiaVeiculo,type UsoVeiculo,
} from "@/lib/cotacoes-veiculares/comercial";
import styles from "./page.module.css";
type RegraBanco=RegraComercialPlano;
type OpcionalBanco=OpcionalComercial&{plano:string;categoria:string};
type Props={
 categoria:CategoriaCotacao;planos:PlanoEmpresa[];
 regras:RegraBanco[];opcionais:OpcionalBanco[];
 podeConfigurar:boolean;onSaved:()=>Promise<void>;
};
const reais=(centavos:number)=>Number((Number(centavos||0)/100).toFixed(2));
const centavos=(v:string)=>Math.round(Number(v||0)*100);
export default function ConfiguracaoComercialEditor({
 categoria,planos,regras,opcionais,podeConfigurar,onSaved,
}:Props){
 const [rascunhos,setRascunhos]=useState<Record<string,RegraComercialPlano>>({});
 const [extras,setExtras]=useState<Record<string,OpcionalComercial[]>>({});
 const [novasCoberturas,setNovasCoberturas]=useState<Record<string,string>>({});
 const [salvando,setSalvando]=useState<string|null>(null);
 const [erro,setErro]=useState(""),[sucesso,setSucesso]=useState("");
 useEffect(()=>{
  const r:Record<string,RegraComercialPlano>={},o:Record<string,OpcionalComercial[]>={};
  for(const plano of planos.filter(p=>p.ativo)){
   r[plano.codigo]=regras.find(v=>v.plano===plano.codigo)||regraVazia(categoria,plano.codigo);
   o[plano.codigo]=opcionais.filter(v=>v.plano===plano.codigo).map(v=>({
    codigo:v.codigo,nome:v.nome,valor_centavos:Number(v.valor_centavos),
    grupo_exclusivo:v.grupo_exclusivo||"",ativo:v.ativo,
   }));
  }
  setRascunhos(r);setExtras(o);setNovasCoberturas({});setErro("");setSucesso("");
 },[categoria,planos,regras,opcionais]);
 function alterar(codigo:string,campo:keyof RegraComercialPlano,valor:unknown){
  setRascunhos(prev=>({...prev,[codigo]:{...prev[codigo],[campo]:valor}}));
 }
 function marcar(codigo:string,campo:"usos_permitidos"|"energias_permitidas",valor:string,ativado:boolean){
  const lista=rascunhos[codigo][campo] as string[];
  alterar(codigo,campo,ativado?[...new Set([...lista,valor])]:lista.filter(v=>v!==valor));
 }
 async function atualizarCobertura(codigo:string, nome:string, remover=false){
  const cobertura=nome.trim();
  if(cobertura.length<2||cobertura.length>160){setErro("Informe uma cobertura de 2 a 160 caracteres.");return;}
  if(!remover&&rascunhos[codigo].coberturas.some(v=>v.toLowerCase()===cobertura.toLowerCase())){
    setErro("Essa cobertura já está cadastrada.");return;
  }
  setSalvando(codigo);setErro("");setSucesso("");
  try{
   const res=await fetch("/api/cotacoes-veiculares/comercial",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({acao:remover?"remover_cobertura":"adicionar_cobertura",
      categoria,plano:codigo,cobertura}),
   });
   const json=await res.json();
   if(!res.ok||!json.ok)throw new Error(json.error||"Falha ao salvar cobertura.");
   setNovasCoberturas(v=>({...v,[codigo]:""}));
   await onSaved();
   setSucesso(remover?"Cobertura removida.":"Cobertura salva.");
  }catch(e){setErro(e instanceof Error?e.message:"Falha ao salvar cobertura.");}
  finally{setSalvando(null);}
 }
 function adicionalNovo(codigo:string){
  const atuais=extras[codigo]||[],used=new Set(atuais.map(v=>v.codigo));
  let n=1;while(used.has("extra_"+n))n++;
  setExtras(v=>({...v,[codigo]:[...atuais,{
   codigo:"extra_"+n,nome:"",valor_centavos:0,grupo_exclusivo:"",ativo:true,
  }]}));
 }
 function mudarExtra(codigo:string,i:number,k:keyof OpcionalComercial,v:string|number|boolean){
  setExtras(prev=>({...prev,[codigo]:prev[codigo].map((x,j)=>i===j?{...x,[k]:v}:x)}));
 }
 async function salvar(codigo:string){
  const regra=rascunhos[codigo],items=extras[codigo]||[];
  const problema=validarRegraComercial(regra,items);
  if(problema){setErro(problema);return;}
  setSalvando(codigo);setErro("");setSucesso("");
  try{
   const res=await fetch("/api/cotacoes-veiculares/comercial",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({acao:"regra",regra,opcionais:items}),
   });
   const json=await res.json();
   if(!res.ok||!json.ok)throw new Error(json.error||"Falha ao salvar plano.");
   await onSaved();
   setSucesso("Regras comerciais salvas.");
  }catch(e){setErro(e instanceof Error?e.message:"Não foi possível salvar.");}
  finally{setSalvando(null);}
 }
 const ativos=planos.filter(p=>p.ativo);
 return <section className={styles.panel}>
  <div className={styles.sectionHeading}><h2>Regras e coberturas</h2>
   <p>Escolha a categoria e configure cada plano criado. Adicione as coberturas individualmente.</p></div>
  {erro&&<p role="alert" className={styles.error}>{erro}</p>}
  {sucesso&&<p role="status" className={styles.success}>{sucesso}</p>}
  {!ativos.length&&<p className={styles.smallNote}>Crie um plano para começar a configurar suas regras.</p>}
  <div className={styles.commercialGrid}>
   {ativos.map(p=>{
    const regra=rascunhos[p.codigo];if(!regra)return null;
    const cod=p.codigo,salvo=regras.some(r=>r.plano===cod);
    return <article key={cod} className={styles.commercialCard}>
     <div className={styles.commercialCardHeading}>
      <h3>{p.nome}</h3><span className={salvo?styles.goodStatus:styles.pendingStatus}>
       {salvo?"Regras cadastradas":"Configuração pendente"}</span>
     </div>
     <div className={styles.fields}>
      <label>Participação (%)<input type="number" min="0" max="100" step=".001" disabled={!podeConfigurar}
       value={regra.participacao_percentual} onChange={e=>alterar(cod,"participacao_percentual",Number(e.target.value))}/></label>
      <label>Participação mínima (R$)<input type="number" min="0" step=".01" disabled={!podeConfigurar}
       value={reais(regra.participacao_min_centavos)}
       onChange={e=>alterar(cod,"participacao_min_centavos",centavos(e.target.value))}/></label>
      <label>Terceiros (R$)<input type="number" min="0" step=".01" disabled={!podeConfigurar}
       value={reais(regra.terceiros_limite_centavos)}
       onChange={e=>alterar(cod,"terceiros_limite_centavos",centavos(e.target.value))}/></label>
      <label>Assistência (km totais)<input type="number" min="0" step="1" disabled={!podeConfigurar}
       value={regra.assistencia_km_total}
       onChange={e=>alterar(cod,"assistencia_km_total",Number(e.target.value))}/></label>
      <label>Assistências por ano<input type="number" min="0" step="1" disabled={!podeConfigurar}
       value={regra.assistencias_ano}
       onChange={e=>alterar(cod,"assistencias_ano",Number(e.target.value))}/></label>
      <label>Carro reserva incluso (dias)<input type="number" min="0" step="1" disabled={!podeConfigurar}
       value={regra.carro_reserva_incluso_dias}
       onChange={e=>alterar(cod,"carro_reserva_incluso_dias",Number(e.target.value))}/></label>
     </div>
     <div className={styles.coverageBox}>
      <strong>Coberturas do plano</strong><p>Digite e adicione uma de cada vez.</p>
      <div className={styles.coverageForm}>
       <input disabled={!podeConfigurar} value={novasCoberturas[cod]||""} maxLength={160}
        aria-label={"Nova cobertura de "+p.nome} placeholder="Ex.: Roubo e furto"
        onChange={e=>setNovasCoberturas(v=>({...v,[cod]:e.target.value}))}
        onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void atualizarCobertura(cod,novasCoberturas[cod]||"");}}}/>
       <button type="button" className={styles.secondary} disabled={!podeConfigurar||salvando!==null}
        onClick={()=>void atualizarCobertura(cod,novasCoberturas[cod]||"")}><Save size={16}/> Salvar cobertura</button>
      </div>
      <div className={styles.coverageChips}>{regra.coberturas.map((cobertura,i)=>
       <span key={i} className={styles.coverageChip}>{cobertura}
        {podeConfigurar&&<button type="button" aria-label={"Remover "+cobertura}
         onClick={()=>void atualizarCobertura(cod,cobertura,true)} disabled={salvando!==null}><X size={14}/></button>}
       </span>)}</div>
      {!regra.coberturas.length&&<small>Adicione ao menos uma cobertura para salvar.</small>}
     </div>
     <div className={styles.commercialChoices}>
      <fieldset disabled={!podeConfigurar}><legend>Usos permitidos</legend>
       {Object.entries(USOS_VEICULO).map(([key,nome])=><label key={key}>
        <input type="checkbox" checked={regra.usos_permitidos.includes(key as UsoVeiculo)}
         onChange={e=>marcar(cod,"usos_permitidos",key,e.target.checked)}/>{nome}</label>)}
      </fieldset>
      <fieldset disabled={!podeConfigurar}><legend>Motorização permitida</legend>
       {Object.entries(ENERGIAS_VEICULO).map(([key,nome])=><label key={key}>
        <input type="checkbox" checked={regra.energias_permitidas.includes(key as EnergiaVeiculo)}
         onChange={e=>marcar(cod,"energias_permitidas",key,e.target.checked)}/>{nome}</label>)}
      </fieldset>
     </div>
     <label className={styles.commercialField}>Condições adicionais
      <textarea rows={2} maxLength={1000} disabled={!podeConfigurar}
       value={regra.observacoes} onChange={e=>alterar(cod,"observacoes",e.target.value)}/></label>
     <div className={styles.commercialExtrasHeading}><strong>Opcionais</strong>
      <button type="button" className={styles.secondary} disabled={!podeConfigurar} onClick={()=>adicionalNovo(cod)}>
       <Plus size={15}/> Adicionar opcional</button></div>
     <p className={styles.smallNote}>Se dois opcionais não podem ser combinados, use o mesmo grupo exclusivo.</p>
     {(extras[cod]||[]).map((item,i)=><div key={i} className={styles.commercialExtra}>
      <div className={styles.commercialExtraFields}>
       <label>Nome<input disabled={!podeConfigurar} value={item.nome}
        onChange={e=>mudarExtra(cod,i,"nome",e.target.value)}/></label>
       <label>Código<input disabled={!podeConfigurar} value={item.codigo}
        onChange={e=>mudarExtra(cod,i,"codigo",e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}/></label>
       <label>Valor mensal (R$)<input type="number" step=".01" min="0" disabled={!podeConfigurar}
        value={reais(item.valor_centavos)}
        onChange={e=>mudarExtra(cod,i,"valor_centavos",centavos(e.target.value))}/></label>
       <label>Grupo exclusivo<input disabled={!podeConfigurar} value={item.grupo_exclusivo}
        onChange={e=>mudarExtra(cod,i,"grupo_exclusivo",e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}/></label>
      </div>
      <div className={styles.commercialExtraActions}>
       <label><input type="checkbox" disabled={!podeConfigurar} checked={item.ativo}
        onChange={e=>mudarExtra(cod,i,"ativo",e.target.checked)}/> Disponível</label>
       <button type="button" disabled={!podeConfigurar} className={styles.commercialRemove}
        onClick={()=>setExtras(v=>({...v,[cod]:v[cod].filter((_,j)=>j!==i)}))}>
        <Trash2 size={15}/> Remover</button>
      </div>
     </div>)}
     <div className={styles.actions}><button type="button" className={styles.primary}
      disabled={!podeConfigurar||salvando!==null} onClick={()=>void salvar(cod)}>
      <Save size={16}/> {salvando===cod?"Salvando...":"Salvar regras de "+p.nome}</button></div>
    </article>;
   })}
  </div>
 </section>;
}
