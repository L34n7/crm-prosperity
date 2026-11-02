"use client";
import {useState} from "react";
import {Plus,Save,Trash2,Pencil,X,Layers3} from "lucide-react";
import type {PlanoEmpresa} from "@/lib/cotacoes-veiculares/catalogo";
import styles from "./page.module.css";
export default function PlanosManager({planos,podeConfigurar,onSaved}:{
 planos:PlanoEmpresa[];podeConfigurar:boolean;onSaved:()=>Promise<void>;
}){
 const [nome,setNome]=useState("");
 const [editando,setEditando]=useState<string|null>(null);
 const [edicao,setEdicao]=useState("");
 const [removendo,setRemovendo]=useState<string|null>(null);
 const [loading,setLoading]=useState(false),[erro,setErro]=useState("");
 async function enviar(acao:"criar"|"renomear"|"excluir",codigo?:string){
  const valor=acao==="criar"?nome:edicao;
  if(acao!=="excluir"&&valor.trim().length<2){setErro("Informe um nome com pelo menos 2 caracteres.");return;}
  setLoading(true);setErro("");
  try{
   const res=await fetch("/api/cotacoes-veiculares/planos",{method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({acao,codigo,nome:valor}),
   });
   const json=await res.json();
   if(!res.ok||!json.ok)throw new Error(json.error||"Falha ao salvar plano.");
   setNome("");setEditando(null);setRemovendo(null);
   await onSaved();
  }catch(e){setErro(e instanceof Error?e.message:"Não foi possível salvar.");}
  finally{setLoading(false);}
 }
 return <section className={styles.panel}>
  <div className={styles.sectionHeading}><h2>Planos da empresa</h2>
   <p>Crie quantos planos precisar, com os nomes utilizados pela sua empresa. Configure as regras de cada plano e depois importe os preços.</p>
  </div>
  {erro&&<p className={styles.error} role="alert">{erro}</p>}
  <div className={styles.plansManagerList}>
   {planos.map(p=><div className={styles.plansManagerItem} key={p.codigo}>
    <span className={styles.planSymbol}><Layers3 size={19}/></span>
    {editando===p.codigo?<input autoFocus className={styles.planEditInput}
      maxLength={90} value={edicao} onChange={e=>setEdicao(e.target.value)}
      onKeyDown={e=>{if(e.key==="Enter")void enviar("renomear",p.codigo);if(e.key==="Escape")setEditando(null);}}/>
    :<div className={styles.planInfo}><strong>{p.nome}</strong>
      <small>Plano personalizado</small></div>}
    {podeConfigurar&&(editando===p.codigo?
     <div className={styles.planIconActions}>
      <button type="button" aria-label="Salvar nome" disabled={loading} onClick={()=>void enviar("renomear",p.codigo)}><Save size={17}/></button>
      <button type="button" aria-label="Cancelar" onClick={()=>setEditando(null)}><X size={17}/></button>
     </div>:
     <div className={styles.planIconActions}>
      <button type="button" aria-label={"Renomear "+p.nome} disabled={loading}
       onClick={()=>{setEditando(p.codigo);setEdicao(p.nome);}}><Pencil size={16}/></button>
      <button type="button" aria-label={"Remover "+p.nome} disabled={loading}
       onClick={()=>setRemovendo(p.codigo)}><Trash2 size={16}/></button>
     </div>)}
   </div>)}
   {!planos.length&&<p className={styles.smallNote}>Nenhum plano cadastrado. Comece criando o primeiro.</p>}
  </div>
  {podeConfigurar&&<div className={styles.createPlanRow}>
    <input aria-label="Nome do novo plano" placeholder="Nome do novo plano" maxLength={90}
     value={nome} onChange={e=>setNome(e.target.value)}
     onKeyDown={e=>{if(e.key==="Enter")void enviar("criar");}}/>
    <button type="button" className={styles.primary} disabled={loading||nome.trim().length<2}
     onClick={()=>void enviar("criar")}><Plus size={17}/> Criar plano</button>
  </div>}
  {removendo&&<div className={styles.planConfirm}>
   <strong>Excluir o plano {planos.find(p=>p.codigo===removendo)?.nome}?</strong>
   <p>As regras e os preços deste plano serão excluídos. O histórico das cotações anteriores será preservado. Será necessário importar a tabela atualizada.</p>
   <div className={styles.actions}>
    <button type="button" className={styles.secondary} onClick={()=>setRemovendo(null)}>Cancelar</button>
    <button type="button" className={styles.commercialRemove} disabled={loading}
     onClick={()=>void enviar("excluir",removendo)}><Trash2 size={15}/> Excluir plano</button>
   </div>
  </div>}
 </section>;
}
