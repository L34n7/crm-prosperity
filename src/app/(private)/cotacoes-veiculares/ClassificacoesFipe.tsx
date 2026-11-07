"use client";
import {useCallback,useEffect,useState} from "react";
import {CheckCircle2,ClipboardList,Loader2,Save} from "lucide-react";
import {CATEGORIAS_COTACAO,type CategoriaCotacao} from "@/lib/cotacoes-veiculares/catalogo";
import {tracaoIndicadaNaFipe} from "@/lib/cotacoes-veiculares/classificacao-caminhoes";
import styles from "./page.module.css";
type Registro={
 tipo_fipe:"cars"|"motorcycles"|"trucks";codigo_fipe:string;modelo:string;
 categoria:CategoriaCotacao|null;origem:"manual"|"automatica";updated_at:string;
};
const nomesTipo={cars:"Automóvel",motorcycles:"Motocicleta",trucks:"Caminhão"};
const permitidas={
 cars:["auto_leves","app_taxi","especiais","van_utilitario"],
 motorcycles:["motocicleta"],
 trucks:["caminhao_leve","caminhao_pesado","agregado"],
} as const;
export default function ClassificacoesFipe({podeConfigurar}:{
 podeConfigurar:boolean;
}){
 const [registros,setRegistros]=useState<Registro[]>([]);
 const [valores,setValores]=useState<Record<string,string>>({});
 const [carregando,setCarregando]=useState(true);
 const [salvando,setSalvando]=useState<string|null>(null);
 const [erro,setErro]=useState(""),[sucesso,setSucesso]=useState("");
 const [somentePendentes,setSomentePendentes]=useState(false);
 const carregar=useCallback(async()=>{
  setCarregando(true);
  try{
   const r=await fetch("/api/cotacoes-veiculares/classificacao",{cache:"no-store"});
   const data=await r.json();
   if(!r.ok||!data.ok)throw new Error(data.error||"Falha na lista de classificações.");
   setRegistros(data.registros||[]);
   setValores({});
  }catch(e){setErro(e instanceof Error?e.message:"Não foi possível carregar.");}
  finally{setCarregando(false);}
 },[]);
 useEffect(()=>{void carregar();},[carregar]);
 async function salvar(item:Registro){
  const chave=item.tipo_fipe+"|"+item.codigo_fipe;
  const categoria=valores[chave]||item.categoria;
  if(!categoria){setErro("Selecione a categoria comercial.");return;}
  setSalvando(chave);setErro("");setSucesso("");
  try{
   const r=await fetch("/api/cotacoes-veiculares/classificacao",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({tipo_fipe:item.tipo_fipe,codigo_fipe:item.codigo_fipe,categoria}),
   });
   const data=await r.json();
   if(!r.ok||!data.ok)throw new Error(data.error||"Falha ao salvar.");
   setRegistros(v=>v.map(x=>x.codigo_fipe===item.codigo_fipe&&x.tipo_fipe===item.tipo_fipe?
    {...x,categoria:categoria as CategoriaCotacao,origem:"manual"}:x));
   setSucesso("Classificação salva para "+item.modelo+".");
  }catch(e){setErro(e instanceof Error?e.message:"Falha ao salvar.");}
  finally{setSalvando(null);}
 }
 const itens=registros.filter(r=>!somentePendentes||!r.categoria);
 const pendentes=registros.filter(r=>!r.categoria).length;
 return <section className={styles.panel}>
  <div className={styles.sectionHeading}>
   <h2>Classificações FIPE</h2>
   <p>A categoria é atribuída automaticamente na consulta FIPE. Caminhões usam a tabela de pesados por padrão; escolha Caminhão leve ou Agregado aqui quando a regra comercial da empresa exigir. Alterações manuais têm prioridade nas próximas cotações.</p>
  </div>
  <div className={styles.classificationToolbar}>
   <span><strong>{pendentes}</strong> pendente(s) de classificação</span>
   <label><input type="checkbox" checked={!somentePendentes}
     onChange={e=>setSomentePendentes(!e.target.checked)}/> Exibir também veículos já classificados ({registros.length-pendentes})</label>
  </div>
  {erro&&<p className={styles.error} role="alert">{erro}</p>}
  {sucesso&&<p className={styles.success} role="status">{sucesso}</p>}
  {carregando?<p className={styles.smallNote}><Loader2 size={16}/> Carregando veículos...</p>
   :!itens.length?<div className={styles.classificationEmpty}><CheckCircle2 size={20}/>
      {somentePendentes?"Nenhum veículo precisa de classificação manual.":"Ainda não há veículos consultados na FIPE."}
     </div>
   :<div className={styles.classificationList}>
     {itens.map(item=>{
      const chave=item.tipo_fipe+"|"+item.codigo_fipe;
      const atual=valores[chave]??item.categoria??"";
      return <div key={chave} className={styles.classificationItem}>
       <span className={styles.classificationIcon}><ClipboardList size={18}/></span>
       <div className={styles.classificationText}><strong>{item.modelo}</strong>
         <small>{nomesTipo[item.tipo_fipe]} · FIPE {item.codigo_fipe}
          {item.tipo_fipe==="trucks"&&tracaoIndicadaNaFipe(item.modelo)
             ? " · Tração "+tracaoIndicadaNaFipe(item.modelo):""}
          {item.origem==="manual"?" · Personalizada":" · Automática"}</small>
       </div>
       <label className={styles.classificationSelector}>
         <span>Categoria interna</span>
         <select disabled={!podeConfigurar||salvando!==null} value={atual}
           onChange={e=>setValores(prev=>({...prev,[chave]:e.target.value}))}>
           <option value="">Classificação pendente</option>
           {permitidas[item.tipo_fipe].map(cat=>
            <option key={cat} value={cat}>{CATEGORIAS_COTACAO[cat]}</option>)}
         </select>
       </label>
       {podeConfigurar&&atual!==item.categoria&&<button type="button" className={styles.secondary}
         disabled={!atual||salvando!==null||atual===item.categoria}
         onClick={()=>void salvar(item)}>
         <Save size={15}/>{salvando===chave?"Salvando...":"Salvar"}</button>}
      </div>;
     })}
    </div>}
  <p className={styles.smallNote}>As classificações são salvas por empresa e código FIPE. Tração e eixos ajudam a distinguir versões, mas não substituem o peso bruto total para definir porte. Escolhas manuais permanecem válidas nas próximas consultas.</p>
 </section>;
}
