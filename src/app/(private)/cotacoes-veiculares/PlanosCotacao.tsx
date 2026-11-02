"use client";
import {useEffect,useRef,useState} from "react";
import {CarFront,Download,FileSpreadsheet,Save,UploadCloud,X,CalendarDays,Layers3} from "lucide-react";
import {CATEGORIAS_COTACAO,type CategoriaCotacao,type PlanoEmpresa} from "@/lib/cotacoes-veiculares/catalogo";
import type {RegraComercialPlano,OpcionalComercial} from "@/lib/cotacoes-veiculares/comercial";
import PlanosManager from "./PlanosManager";
import ConfiguracaoComercialEditor from "./ConfiguracaoComercialEditor";
import styles from "./page.module.css";

export type ArquivoPlano={
  empresa_id:string;plano:string;referencia:string;vigencia_ate:string|null;
  arquivo_precos_nome:string|null;arquivo_precos_em:string|null;
  arquivo_especiais_nome:string|null;arquivo_especiais_em:string|null;
};
type Faixa={plano:string;categoria:string;fipe_min_centavos:number;fipe_max_centavos:number;codigo_produto:string;valor_centavos:number};
type Props={
 planos:PlanoEmpresa[];arquivos:ArquivoPlano[];categoria:CategoriaCotacao;onCategoria:(x:CategoriaCotacao)=>void;
 faixas:Faixa[];regras:RegraComercialPlano[];opcionais:(OpcionalComercial&{plano:string;categoria:string})[];
 podeConfigurar:boolean;onUpdated:()=>Promise<void>;
 onImportar:(tipo:"precos"|"especiais",plano:string,arquivo:File)=>void;
 onRemover:(tipo:"precos"|"especiais",plano:string)=>void;
};
const dinheiro=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n/100);
const dataHora=(v:string)=>new Date(v).toLocaleString("pt-BR");
export default function PlanosCotacao({
 planos,arquivos,categoria,onCategoria,faixas,regras,opcionais,podeConfigurar,onUpdated,onImportar,onRemover,
}:Props){
 const [selecionado,setSelecionado]=useState<string|null>(null);
 const [referencia,setReferencia]=useState("");
 const [vigencia,setVigencia]=useState("");
 const [ocupado,setOcupado]=useState(false),[erro,setErro]=useState(""),[mensagem,setMensagem]=useState("");
 const [editando,setEditando]=useState<Faixa|null>(null),[valor,setValor]=useState("");
 const inputPrecos=useRef<HTMLInputElement>(null),inputEspeciais=useRef<HTMLInputElement>(null);
 useEffect(()=>{
   if(!selecionado||!planos.some(p=>p.codigo===selecionado&&p.ativo))
     setSelecionado(planos.find(p=>p.ativo)?.codigo||null);
 },[planos,selecionado]);
 const plano=planos.find(p=>p.codigo===selecionado);
 const metadata=arquivos.find(a=>a.plano===selecionado);
 useEffect(()=>{
   setReferencia(metadata?.referencia||"");
   setVigencia(metadata?.vigencia_ate||"");
   setEditando(null);setErro("");setMensagem("");
 },[selecionado,metadata?.referencia,metadata?.vigencia_ate]);
 async function enviar(acao:"vigencia"|"preco"){
   if(!selecionado)return;
   setOcupado(true);setErro("");setMensagem("");
   try{
     const endpoint=acao==="vigencia"?"/api/cotacoes-veiculares/comercial":"/api/cotacoes-veiculares";
     const body=acao==="vigencia"
       ?{acao,plano:selecionado,referencia,vigencia_ate:vigencia}
       :{acao,plano:selecionado,categoria,fipe_min_centavos:editando?.fipe_min_centavos,
           valor_centavos:Math.round(Number(valor.replace(",", "."))*100)};
     const resposta=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
     const json=await resposta.json();
     if(!resposta.ok||!json.ok)throw new Error(json.error||"Não foi possível salvar.");
     setEditando(null);await onUpdated();
     setMensagem(acao==="vigencia"?"Referência e validade salvas para "+plano?.nome+".":"Preço atualizado para "+plano?.nome+".");
   }catch(e){setErro(e instanceof Error?e.message:"Erro ao salvar.");}
   finally{setOcupado(false);}
 }
 const itens=faixas.filter(f=>f.plano===selecionado);
 return <section className={styles.panel}>
   <PlanosManager planos={planos} selecionado={selecionado} onSelecionar={setSelecionado}
     podeConfigurar={podeConfigurar} onSaved={onUpdated}/>
   {!plano?<div className={styles.planPlaceholder}><Layers3 size={27}/>
      <p>Crie o primeiro plano para configurar as coberturas e importar suas planilhas.</p></div>
   :<div className={styles.planDetail}>
     <div className={styles.planDetailHeader}>
       <div><span className={styles.eyebrow}>Configuração individual</span><h3>{plano.nome}</h3>
         <p>Estes arquivos, preços e coberturas pertencem somente a este plano.</p></div>
       <span className={styles.pendingStatus}>Plano independente</span>
     </div>
     {erro&&<p className={styles.error} role="alert">{erro}</p>}
     {mensagem&&<p className={styles.success} role="status">{mensagem}</p>}
     <div className={styles.importGrid}>
       <div className={styles.importCard}>
         <div className={styles.importIcon}><FileSpreadsheet size={22}/></div>
         <h3>Tabela de preços</h3>
         <p>Planilha exclusiva do plano {plano.nome}, com categorias, faixas FIPE e mensalidades.</p>
         {metadata?.arquivo_precos_nome&&<div className={styles.importedFile}>
           <FileSpreadsheet size={18}/><div><strong>{metadata.arquivo_precos_nome}</strong>
           {metadata.arquivo_precos_em&&<small>Importado em {dataHora(metadata.arquivo_precos_em)}</small>}</div>
           <button type="button" aria-label={"Remover preços de "+plano.nome}
             disabled={!podeConfigurar||ocupado} onClick={()=>onRemover("precos",plano.codigo)}><X size={16}/></button>
         </div>}
         <input className={styles.hiddenFile} ref={inputPrecos} type="file" accept=".xlsx"
           onChange={e=>{const f=e.target.files?.[0];if(f)onImportar("precos",plano.codigo,f);e.target.value="";}}/>
         <div className={styles.importActions}>
           <button type="button" className={styles.primary} disabled={!podeConfigurar||ocupado}
             onClick={()=>inputPrecos.current?.click()}><UploadCloud size={16}/> Importar tabela de preços</button>
           <a className={styles.modelLink} href={"/api/cotacoes-veiculares/importar?tipo=precos&plano="+encodeURIComponent(plano.codigo)}>
             <Download size={15}/> Baixar modelo</a>
         </div>
         <div className={styles.planValidity}>
           <label>Identificação / referência
             <input value={referencia} maxLength={160} placeholder={"Tabela comercial de "+plano.nome}
               disabled={!podeConfigurar} onChange={e=>setReferencia(e.target.value)}/></label>
           <label>Válida até
             <input type="date" value={vigencia} disabled={!podeConfigurar}
               onChange={e=>setVigencia(e.target.value)}/></label>
           <button type="button" className={styles.secondary} disabled={!podeConfigurar||ocupado||!metadata?.arquivo_precos_nome}
             onClick={()=>void enviar("vigencia")}><CalendarDays size={15}/> Salvar validade</button>
         </div>
       </div>
       <div className={styles.importCard}>
         <div className={styles.importIcon}><CarFront size={22}/></div>
         <h3>Veículos especiais</h3>
         <p>Lista de modelos especiais atendidos exclusivamente pelo plano {plano.nome}.</p>
         {metadata?.arquivo_especiais_nome&&<div className={styles.importedFile}>
           <FileSpreadsheet size={18}/><div><strong>{metadata.arquivo_especiais_nome}</strong>
           {metadata.arquivo_especiais_em&&<small>Importado em {dataHora(metadata.arquivo_especiais_em)}</small>}</div>
           <button type="button" aria-label={"Remover veículos especiais de "+plano.nome}
             disabled={!podeConfigurar||ocupado} onClick={()=>onRemover("especiais",plano.codigo)}><X size={16}/></button>
         </div>}
         <input className={styles.hiddenFile} ref={inputEspeciais} type="file" accept=".xlsx"
           onChange={e=>{const f=e.target.files?.[0];if(f)onImportar("especiais",plano.codigo,f);e.target.value="";}}/>
         <div className={styles.importActions}>
           <button type="button" className={styles.primary} disabled={!podeConfigurar||ocupado}
             onClick={()=>inputEspeciais.current?.click()}><UploadCloud size={16}/> Importar veículos especiais</button>
           <a className={styles.modelLink} href={"/api/cotacoes-veiculares/importar?tipo=especiais&plano="+encodeURIComponent(plano.codigo)}>
             <Download size={15}/> Baixar modelo</a>
         </div>
         <small className={styles.smallNote}>Necessária quando o plano comercializa a categoria Especiais.</small>
       </div>
     </div>
     <div className={styles.categoryChooser}>
       <label>Categoria de veículos para configurar coberturas e visualizar preços
         <select value={categoria} onChange={e=>onCategoria(e.target.value as CategoriaCotacao)}>
           {Object.entries(CATEGORIAS_COTACAO).map(([codigo,nome])=>
             <option key={codigo} value={codigo}>{nome}</option>)}
         </select>
       </label>
     </div>
     <ConfiguracaoComercialEditor categoria={categoria} planos={[plano]}
       regras={regras.filter(r=>r.plano===plano.codigo)}
       opcionais={opcionais.filter(o=>o.plano===plano.codigo)}
       podeConfigurar={podeConfigurar} onSaved={onUpdated}/>
     <div className={styles.planPrices}>
       <h3>Valores de {plano.nome} — {CATEGORIAS_COTACAO[categoria]}</h3>
       <p>Os preços vieram da planilha deste plano. Você pode corrigir uma faixa individualmente.</p>
       {!itens.length?<p className={styles.smallNote}>Nenhuma faixa importada nesta categoria.</p>:<>
         <p className={styles.scrollHint}>Deslize para visualizar todas as colunas.</p>
         <div className={styles.tableScroll}><table><thead><tr>
           <th>Faixa FIPE</th><th>Mensalidade</th><th>Código</th><th></th>
         </tr></thead><tbody>{itens.map(f=><tr key={f.fipe_min_centavos}>
           <td>{dinheiro(Number(f.fipe_min_centavos))} – {dinheiro(Number(f.fipe_max_centavos))}</td>
           <td>{dinheiro(Number(f.valor_centavos))}</td><td>{f.codigo_produto}</td>
           <td><button type="button" disabled={!podeConfigurar}
             onClick={()=>{setEditando(f);setValor((f.valor_centavos/100).toFixed(2));}}
             className={styles.smallButton}>Editar</button></td>
         </tr>)}</tbody></table></div>
       </>}
       {editando&&<div className={styles.planPriceEditor}>
         <label>Mensalidade da faixa (R$)
           <input inputMode="decimal" value={valor} onChange={e=>setValor(e.target.value)}/></label>
         <button type="button" className={styles.secondary} onClick={()=>setEditando(null)}>Cancelar</button>
         <button type="button" className={styles.primary} disabled={ocupado} onClick={()=>void enviar("preco")}><Save size={16}/> Salvar preço</button>
       </div>}
     </div>
   </div>}
 </section>;
}
