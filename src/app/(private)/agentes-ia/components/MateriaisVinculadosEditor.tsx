"use client";

import { useCallback,useEffect,useMemo,useState,type FormEvent } from "react";
import {
  BookOpen,Check,CheckCircle2,ChevronDown,FileImage,
  FileText,Image as ImageIcon,Loader2,Plus,Search,Trash2,UploadCloud,X,
} from "lucide-react";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  MAX_MATERIAIS_POR_VINCULO,
  MAX_CONHECIMENTOS_POR_MATERIAL,
  normalizarMateriais,
  type MaterialVinculado,
} from "@/lib/agentes-ia/materiais-config";
import type { MidiaOpcao } from "../../fluxos/types";
import styles from "./MateriaisVinculadosEditor.module.css";

type ConhecimentoOpcao={id:string;titulo:string;categoria?:string|null};
type Props={
  value:MaterialVinculado[];
  onChange:(proximos:MaterialVinculado[])=>void;
  onError:(mensagem:string)=>void;
  onSuccess?:(mensagem:string)=>void;
  conhecimentos:ConhecimentoOpcao[];
  titulo?:string;
};

function buscaNormalizada(valor:string){
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("pt-BR").trim();
}

export default function MateriaisVinculadosEditor({
  value,onChange,onError,onSuccess,conhecimentos,titulo="Enviar material",
}:Props){
  const [midias,setMidias]=useState<MidiaOpcao[]>([]);
  const [carregando,setCarregando]=useState(true);
  const [enviando,setEnviando]=useState(false);
  const [aberto,setAberto]=useState(false);
  const [rascunho,setRascunho]=useState<MaterialVinculado[]>([]);
  const [erro,setErro]=useState("");
  const [buscaConhecimento,setBuscaConhecimento]=useState<Record<number,string>>({});
  const [dropdownConhecimento,setDropdownConhecimento]=useState<number|null>(null);
  const [buscaBiblioteca,setBuscaBiblioteca]=useState("");
  const itens=useMemo(()=>normalizarMateriais(value),[value]);
  const midiasPorId=useMemo(()=>new Map(midias.map(item=>[item.id,item])),[midias]);

  const carregar=useCallback(async()=>{
    setCarregando(true);
    try{
      const resposta=await fetch("/api/automacoes/midias",{cache:"no-store"});
      const dados=await resposta.json();
      if(!resposta.ok||!dados?.ok)throw new Error(dados?.error||"Não foi possível carregar a biblioteca.");
      setMidias(Array.isArray(dados.midias)?dados.midias:[]);
    }catch(error){
      onError(error instanceof Error?error.message:"Erro ao carregar mídias.");
    }finally{setCarregando(false);}
  },[onError]);

  useEffect(()=>{void carregar();},[carregar]);

  useEffect(()=>{
    if(!aberto)return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"&&!enviando){
        if(dropdownConhecimento!==null)setDropdownConhecimento(null);
        else setAberto(false);
      }
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[aberto,enviando,dropdownConhecimento]);

  function abrirModal(){
    setRascunho(itens.map(item=>({...item,conhecimento_ids:[...(item.conhecimento_ids||[])]})));
    setErro("");setBuscaBiblioteca("");setBuscaConhecimento({});
    setDropdownConhecimento(null);setAberto(true);
    void carregar();
  }
  function fechar(){if(!enviando){setAberto(false);setErro("");}}
  function mudarItem(index:number,changes:Partial<MaterialVinculado>){
    setRascunho(prev=>prev.map((item,i)=>i===index?{...item,...changes}:item));
    setErro("");
  }
  function novoItem(midiaId=""){
    setRascunho(prev=>prev.length>=MAX_MATERIAIS_POR_VINCULO?prev:
      [...prev,{midia_id:midiaId,quando_enviar:"",conhecimento_ids:[]}]);
    setErro("");
  }
  function marcarConhecimento(index:number,id:string){
    setRascunho(prev=>prev.map((item,i)=>{
      if(i!==index)return item;
      const ids=item.conhecimento_ids||[];
      return {...item,conhecimento_ids:ids.includes(id)
        ?ids.filter(v=>v!==id)
        :ids.length<MAX_CONHECIMENTOS_POR_MATERIAL?[...ids,id]:ids};
    }));
    setBuscaConhecimento(prev=>({...prev,[index]:""}));
    setErro("");
  }

  async function enviarArquivo(arquivo:File){
    setEnviando(true);setErro("");
    try{
      const mimeType=arquivo.type||"application/octet-stream";
      const metadados={nome:arquivo.name,mimeType,tamanhoBytes:arquivo.size};
      const preparar=await fetch("/api/automacoes/midias/upload",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({acao:"preparar_upload",...metadados}),
      });
      const preparacao=await preparar.json();
      if(!preparar.ok||!preparacao?.ok)throw new Error(preparacao.error||"Falha ao preparar arquivo.");
      const upload=preparacao.upload;
      if(!upload?.bucket||!upload?.path||!upload?.token)throw new Error("Dados de upload inválidos.");
      const supabase=createSupabaseBrowserClient();
      const {error:erroUpload}=await supabase.storage.from(upload.bucket)
        .uploadToSignedUrl(upload.path,upload.token,arquivo,{
          contentType:mimeType,upsert:false,
        });
      if(erroUpload)throw erroUpload;
      const finalizar=await fetch("/api/automacoes/midias/upload",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({acao:"concluir_upload",...metadados,storagePath:upload.path}),
      });
      const conclusao=await finalizar.json();
      if(!finalizar.ok||!conclusao?.ok||!conclusao.midia?.id)
        throw new Error(conclusao.error||"Não foi possível registrar o arquivo.");
      const nova=conclusao.midia as MidiaOpcao;
      setMidias(prev=>[nova,...prev.filter(item=>item.id!==nova.id)]);
      setRascunho(prev=>{
        const vazio=prev.findIndex(item=>!item.midia_id);
        if(vazio>=0)return prev.map((item,i)=>
          i===vazio?{...item,midia_id:nova.id}:item);
        if(prev.length>=MAX_MATERIAIS_POR_VINCULO)return prev;
        return [...prev,{midia_id:nova.id,quando_enviar:"",conhecimento_ids:[]}];
      });
      onSuccess?.("Arquivo enviado para a biblioteca. Configure e aplique o vínculo.");
    }catch(error){
      setErro(error instanceof Error?error.message:"Falha ao enviar arquivo.");
    }finally{setEnviando(false);}
  }

  function aplicar(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const arquivos=rascunho.map(item=>item.midia_id);
    if(rascunho.length>MAX_MATERIAIS_POR_VINCULO){
      setErro("Limite de "+MAX_MATERIAIS_POR_VINCULO+" arquivos atingido.");return;
    }
    if(rascunho.some(item=>!item.midia_id||!midiasPorId.has(item.midia_id))){
      setErro("Selecione um arquivo existente da biblioteca para cada material.");return;
    }
    if(new Set(arquivos).size!==arquivos.length){
      setErro("O mesmo arquivo não pode ser incluído duas vezes.");return;
    }
    if(rascunho.some(item=>!item.quando_enviar.trim())){
      setErro("Preencha a condição Quando enviar de todos os materiais.");return;
    }
    const idsConhecimentos=new Set(conhecimentos.map(k=>k.id));
    if(rascunho.some(item=>(item.conhecimento_ids||[]).some(id=>!idsConhecimentos.has(id)))){
      setErro("Um conhecimento vinculado foi removido. Revise os vínculos.");return;
    }
    onChange(normalizarMateriais(rascunho));
    setAberto(false);
    onSuccess?.("Materiais aplicados. Clique em Salvar agente para gravar as alterações.");
  }

  const disponiveis=useMemo(()=>{
    const termo=buscaNormalizada(buscaBiblioteca);
    return midias.filter(item=>!termo||buscaNormalizada(item.nome).includes(termo));
  },[midias,buscaBiblioteca]);

  return <>
    <div className={styles.summary}>
      <div className={styles.summaryHeading}>
        <div className={styles.summaryTitle}>
          <span className={styles.summaryIcon}><FileImage size={18}/></span>
          <span><strong>{titulo}</strong>
            <small>{itens.length===1?"1 material configurado":itens.length+" materiais configurados"}</small>
          </span>
        </div>
        <button type="button" className={styles.openButton} onClick={abrirModal}>
          <Plus size={16}/> Adicionar materiais
        </button>
      </div>
      {itens.length>0?<div className={styles.compactNames} aria-label="Materiais configurados">
        {itens.slice(0,5).map((item,index)=><span key={item.midia_id}
          className={styles.compactChip} title={midiasPorId.get(item.midia_id)?.nome||item.midia_id}>
          <FileText size={13}/>
          {midiasPorId.get(item.midia_id)?.nome||"Arquivo "+(index+1)}
        </span>)}
        {itens.length>5&&<span className={styles.extraCount}>+{itens.length-5} outros</span>}
      </div>:<p className={styles.emptySummary}>Nenhum arquivo configurado. Organize tudo em um único modal.</p>}
    </div>

    {aberto&&<div className={styles.overlay} onMouseDown={event=>{
      if(event.target===event.currentTarget)fechar();
    }}>
      <form className={styles.modal} onSubmit={aplicar} role="dialog" aria-modal="true"
        aria-labelledby="materiaisModalTitulo">
        <header className={styles.header}>
          <span className={styles.headerIcon}><ImageIcon size={23}/></span>
          <div className={styles.headerCopy}>
            <small>FERRAMENTAS DO AGENTE</small>
            <h2 id="materiaisModalTitulo">Gerenciar materiais</h2>
            <p>Organize arquivos, defina quando enviar e vincule a vários conhecimentos.</p>
          </div>
          <button type="button" className={styles.close} onClick={fechar}
            disabled={enviando} aria-label="Fechar modal"><X size={20}/></button>
        </header>
        <div className={styles.body}>
          <div className={styles.toolbar}>
            <div className={styles.toolbarText}>
              <strong>Biblioteca de materiais</strong>
              <span>{rascunho.length} de {MAX_MATERIAIS_POR_VINCULO} arquivos</span>
            </div>
            <div className={styles.toolbarActions}>
              <label className={styles.upload}>
                <input type="file" accept="image/*,video/mp4,audio/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx"
                  disabled={enviando||rascunho.length>=MAX_MATERIAIS_POR_VINCULO}
                  onChange={event=>{
                    const arquivo=event.target.files?.[0];
                    event.target.value="";
                    if(arquivo)void enviarArquivo(arquivo);
                  }}/>
                {enviando?<Loader2 size={16} className={styles.spin}/>:<UploadCloud size={16}/>}
                {enviando?"Enviando...":"Enviar arquivo"}
              </label>
              <button type="button" className={styles.add} disabled={enviando||rascunho.length>=MAX_MATERIAIS_POR_VINCULO}
                onClick={()=>novoItem()}><Plus size={16}/> Adicionar material</button>
            </div>
          </div>
          <div className={styles.mediaSearch}>
            <Search size={16}/>
            <input type="search" value={buscaBiblioteca}
              onChange={event=>setBuscaBiblioteca(event.target.value)}
              placeholder="Filtrar arquivos disponíveis da biblioteca..."
              aria-label="Filtrar biblioteca de arquivos"/>
            <span>{disponiveis.length} arquivo(s)</span>
          </div>
          {erro&&<div className={styles.error} role="alert">{erro}</div>}
          {rascunho.length===0?<div className={styles.empty}>
            <span><FileImage size={29}/></span>
            <h3>Nenhum material adicionado</h3>
            <p>Selecione um arquivo da biblioteca ou envie um novo. Depois vincule-o aos conhecimentos que fazem sentido.</p>
            <button type="button" className={styles.add} onClick={()=>novoItem()}>
              <Plus size={16}/> Adicionar primeiro material
            </button>
          </div>:<div className={styles.items}>
            {rascunho.map((item,index)=>{
              const selecao=(item.conhecimento_ids||[]);
              const termo=buscaNormalizada(buscaConhecimento[index]||"");
              const correspondentes=conhecimentos.filter(k=>
                !termo||buscaNormalizada(k.titulo+" "+(k.categoria||"")).includes(termo));
              return <section className={styles.item} key={index}>
                <div className={styles.itemHead}>
                  <span className={styles.ordinal}>{String(index+1).padStart(2,"0")}</span>
                  <div>
                    <strong>{midiasPorId.get(item.midia_id)?.nome||"Novo material"}</strong>
                    <small>{selecao.length?selecao.length+" conhecimento(s) vinculado(s)":"Material sem conhecimento vinculado"}</small>
                  </div>
                  <button type="button" className={styles.remove} onClick={()=>{
                    setRascunho(prev=>prev.filter((_,i)=>i!==index));
                    setDropdownConhecimento(null);setErro("");
                  }} aria-label={"Remover material "+(index+1)} title="Remover vínculo">
                    <Trash2 size={16}/>
                  </button>
                </div>
                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span>Arquivo da biblioteca</span>
                    <select required value={item.midia_id} disabled={carregando||enviando}
                      onChange={e=>mudarItem(index,{midia_id:e.target.value})}>
                      <option value="">{carregando?"Carregando biblioteca...":"Selecione um arquivo"}</option>
                      {disponiveis.map(media=><option key={media.id} value={media.id}>
                        {media.nome} · {media.tipo==="arquivo"?"Documento":media.tipo}
                      </option>)}
                      {item.midia_id&&!disponiveis.some(v=>v.id===item.midia_id)&&
                        <option value={item.midia_id}>{midiasPorId.get(item.midia_id)?.nome||"Arquivo indisponível"}</option>}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Quando enviar</span>
                    <textarea required rows={2} maxLength={240} value={item.quando_enviar}
                      placeholder="Ex.: Após enviar o link de cotação ao cliente"
                      onChange={e=>mudarItem(index,{quando_enviar:e.target.value})}/>
                  </label>
                </div>
                <div className={styles.knowledgeSection}>
                  <div className={styles.knowledgeHeading}>
                    <span><BookOpen size={15}/> Conhecimentos vinculados</span>
                    <small>{selecao.length?selecao.length+" selecionado(s)":"Opcional"}</small>
                  </div>
                  {selecao.length>0&&<div className={styles.knowledgeChips}>
                    {selecao.map(id=>{
                      const k=conhecimentos.find(v=>v.id===id);
                      return <span key={id} className={styles.knowledgeChip}>
                        <BookOpen size={12}/>
                        {k?.titulo||"Conhecimento removido"}
                        <button type="button" onClick={()=>marcarConhecimento(index,id)}
                          aria-label={"Desvincular "+(k?.titulo||"conhecimento")}>
                          <X size={13}/>
                        </button>
                      </span>;
                    })}
                  </div>}
                  <div className={styles.knowledgePicker}>
                    <div className={styles.searchInput}>
                      <Search size={16}/>
                      <input type="search" autoComplete="off"
                        placeholder="Digite para buscar e selecionar conhecimentos..."
                        value={buscaConhecimento[index]||""}
                        onFocus={()=>setDropdownConhecimento(index)}
                        onChange={e=>{setBuscaConhecimento(prev=>({...prev,[index]:e.target.value}));setDropdownConhecimento(index);}}
                        aria-label={"Buscar conhecimentos para o material "+(index+1)}
                        aria-expanded={dropdownConhecimento===index}
                        role="combobox" aria-autocomplete="list"
                        onKeyDown={e=>{
                          if(e.key==="Escape")setDropdownConhecimento(null);
                          if(e.key==="Enter"&&dropdownConhecimento===index&&correspondentes.length){
                            e.preventDefault();marcarConhecimento(index,correspondentes[0].id);
                          }
                        }}/>
                      <button type="button" onClick={()=>setDropdownConhecimento(
                        atual=>atual===index?null:index
                      )} aria-label="Mostrar conhecimentos"><ChevronDown size={16}/></button>
                    </div>
                    {dropdownConhecimento===index&&<div className={styles.dropdown} role="listbox">
                      {correspondentes.length?correspondentes.map(k=>
                        <button type="button" role="option" aria-selected={selecao.includes(k.id)}
                          key={k.id} onClick={()=>marcarConhecimento(index,k.id)}>
                          <span className={styles.optionCheck}>{selecao.includes(k.id)&&<Check size={13}/>}</span>
                          <span><strong>{k.titulo}</strong><small>{k.categoria||"Sem categoria"}</small></span>
                        </button>)
                        :<p>Nenhum conhecimento encontrado.</p>}
                    </div>}
                  </div>
                  <p className={styles.hint}>Você pode vincular o mesmo arquivo a vários conhecimentos.
                    Quando um deles for consultado, a IA poderá enviar este material após responder.
                    Sem vínculos, o arquivo fica disponível conforme a condição de envio.</p>
                </div>
              </section>;
            })}
          </div>}
          {rascunho.length>0&&<p className={styles.bottomHint}>
            <CheckCircle2 size={15}/> O modal organiza os vínculos; use <b>Salvar agente</b> na página
            após aplicar para registrar as alterações.
          </p>}
        </div>
        <footer className={styles.footer}>
          <span>{rascunho.length} {rascunho.length===1?"material":"materiais"} configurado(s)</span>
          <div>
            <button type="button" className={styles.cancel} onClick={fechar} disabled={enviando}>Cancelar</button>
            <button type="submit" className={styles.confirm} disabled={enviando||carregando}>
              <Check size={16}/> Aplicar materiais
            </button>
          </div>
        </footer>
      </form>
    </div>}
  </>;
}
