"use client";

import {useId,useState,type FormEvent} from "react";
import {Check,Plus,X} from "lucide-react";
import {
  codigoGrupoOpcional,rotuloGrupoOpcional,
} from "@/lib/cotacoes-veiculares/grupos-opcionais";
import styles from "./page.module.css";

export default function GrupoOpcionalField({
  value,grupos,disabled,onChange,
}:{
  value:string;grupos:string[];disabled:boolean;onChange:(grupo:string)=>void;
}){
  const selectId=useId();
  const [criando,setCriando]=useState(false);
  const [nome,setNome]=useState("");
  const [erro,setErro]=useState("");

  const opcoes=value&&!grupos.includes(value)?[...grupos,value]:grupos;
  function criar(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const codigo=codigoGrupoOpcional(nome);
    if(codigo.length<2){
      setErro("Informe o nome do grupo, com pelo menos duas letras ou números.");
      return;
    }
    onChange(codigo);
    setCriando(false);setNome("");setErro("");
  }
  return <div className={styles.extraGroupField}>
    <label htmlFor={selectId}>Grupo opcional</label>
    <div className={styles.extraGroupRow}>
      <select id={selectId} value={value||""} disabled={disabled}
        onChange={event=>{onChange(event.target.value);setErro("");}}
        aria-describedby={selectId+"-ajuda"}>
        <option value="">Sem grupo</option>
        {opcoes.map(grupo=><option key={grupo} value={grupo}>
          {rotuloGrupoOpcional(grupo)}
        </option>)}
      </select>
      <button type="button" className={styles.extraGroupNewButton}
        disabled={disabled} aria-expanded={criando}
        aria-label="Adicionar grupo opcional" title="Adicionar grupo opcional"
        onClick={()=>{setCriando(antes=>!antes);setNome("");setErro("");}}>
        <Plus size={19} aria-hidden="true"/>
      </button>
    </div>
    {criando&&<form className={styles.extraGroupCreate} onSubmit={criar}>
      <span className={styles.extraGroupCreateTitle}>Novo grupo de opcionais</span>
      <div className={styles.extraGroupCreateRow}>
        <span className={styles.extraGroupNamePrefix}>Grupo</span>
        <input autoFocus aria-label="Nome do novo grupo" value={nome}
          onChange={event=>{setNome(event.target.value);setErro("");}}
          placeholder="Ex.: Rastreador" maxLength={70} disabled={disabled}/>
        <button type="submit" disabled={disabled||!nome.trim()}
          className={styles.extraGroupCreateSave}><Check size={15}/> Criar</button>
        <button type="button" aria-label="Cancelar novo grupo" disabled={disabled}
          className={styles.extraGroupCreateCancel}
          onClick={()=>{setCriando(false);setNome("");setErro("");}}>
          <X size={16}/>
        </button>
      </div>
      {erro&&<span className={styles.extraGroupCreateError} role="alert">{erro}</span>}
      <small>O grupo será selecionado neste opcional e salvo ao avançar.</small>
    </form>}
    <p id={selectId+"-ajuda"} className={styles.extraGroupHelp}>
      O grupo serve para impedir que dois opcionais sejam habilitados ao mesmo tempo.
      Agrupe os opcionais quando eles competirem pelo mesmo serviço.
    </p>
  </div>;
}
