"use client";

import {useEffect,useId,useMemo,useRef,useState} from "react";
import {Check,ChevronDown,Search} from "lucide-react";
import styles from "./page.module.css";

type Opcao={code:string;name:string};
type Props={
 label:string;valor:string;opcoes:Opcao[];placeholder:string;
 onChange:(codigo:string)=>void;disabled?:boolean;carregando?:boolean;
};

function normalizar(texto:string){
 return texto.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
   .toLocaleLowerCase("pt-BR").trim();
}

/** Combobox pesquisável para o catálogo FIPE, com teclado e uso mobile. */
export default function SeletorFipe({label,valor,opcoes,placeholder,onChange,disabled=false,carregando=false}:Props){
 const [aberto,setAberto]=useState(false);
 const [busca,setBusca]=useState("");
 const [selecionado,setSelecionado]=useState(0);
 const raiz=useRef<HTMLDivElement>(null);
 const campo=useRef<HTMLInputElement>(null);
 const listId=useId();
 const atual=opcoes.find(v=>v.code===valor);
 const filtradas=useMemo(()=>{
  const termo=normalizar(busca);
  const filtradas=termo?opcoes.filter(v=>normalizar(v.name).includes(termo)):opcoes;
  return filtradas.slice(0,100);
 },[opcoes,busca]);

 useEffect(()=>{
  if(!aberto)return;
  const onOutside=(event:PointerEvent)=>{
   if(!raiz.current?.contains(event.target as Node))setAberto(false);
  };
  document.addEventListener("pointerdown",onOutside);
  return ()=>document.removeEventListener("pointerdown",onOutside);
 },[aberto]);
 useEffect(()=>{
  if(aberto)campo.current?.focus();
 },[aberto]);
 function abrir(termo=""){
  if(disabled||carregando)return;
  setBusca(termo);setSelecionado(0);setAberto(true);
 }
 function escolher(codigo:string){
  onChange(codigo);setAberto(false);setBusca("");
 }
 return <div className={styles.fipeSearchField}>
   <span className={styles.fipeSearchLabel}>{label}</span>
   <div ref={raiz} className={styles.fipeComboRoot}>
    <button type="button" className={styles.fipeComboTrigger}
      role="combobox" aria-haspopup="listbox" aria-expanded={aberto}
      aria-controls={aberto?listId:undefined}
      aria-label={label+": "+(atual?.name||placeholder)}
      disabled={disabled||carregando}
      onClick={()=>aberto?setAberto(false):abrir()}
      onKeyDown={e=>{
       if(e.key==="ArrowDown"||e.key===" "){e.preventDefault();abrir();}
       else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey)abrir(e.key);
      }}>
      <span className={atual?styles.fipeComboValue:styles.fipeComboPlaceholder}>
        {carregando?"Carregando...":atual?.name||placeholder}
      </span>
      <ChevronDown size={17} aria-hidden="true"/>
    </button>
    {aberto&&<div className={styles.fipeComboPopup}>
      <div className={styles.fipeComboSearch}>
        <Search size={16} aria-hidden="true"/>
        <input ref={campo} type="search" autoComplete="off"
          aria-label={"Pesquisar "+label.toLocaleLowerCase("pt-BR")}
          placeholder={"Digite para buscar "+label.toLocaleLowerCase("pt-BR")}
          value={busca} onChange={e=>{setBusca(e.target.value);setSelecionado(0);}}
          onKeyDown={e=>{
           if(e.key==="Escape"){e.preventDefault();setAberto(false);}
           else if(e.key==="ArrowDown"){e.preventDefault();setSelecionado(i=>Math.min(filtradas.length-1,i+1));}
           else if(e.key==="ArrowUp"){e.preventDefault();setSelecionado(i=>Math.max(0,i-1));}
           else if(e.key==="Enter"){
             e.preventDefault();
             if(filtradas[selecionado])escolher(filtradas[selecionado].code);
           }
          }}/>
      </div>
      <div id={listId} role="listbox" aria-label={"Resultados para "+label}
        className={styles.fipeComboList}>
        {filtradas.map((item,i)=><button key={item.code} type="button"
          role="option" aria-selected={item.code===valor}
          className={styles.fipeComboOption+" "+(i===selecionado?styles.fipeComboOptionFocused:"")}
          onMouseEnter={()=>setSelecionado(i)}
          onClick={()=>escolher(item.code)}>
          <span>{item.name}</span>
          {item.code===valor&&<Check size={15} aria-hidden="true"/>}
        </button>)}
        {!filtradas.length&&<div className={styles.fipeComboEmpty}>Nenhum resultado encontrado.</div>}
      </div>
      {opcoes.length>100&&!busca&&<small className={styles.fipeComboHint}>Digite para pesquisar entre {opcoes.length} opções.</small>}
      {busca&&filtradas.length===100&&<small className={styles.fipeComboHint}>Refine o termo para encontrar outras opções.</small>}
    </div>}
   </div>
 </div>;
}
