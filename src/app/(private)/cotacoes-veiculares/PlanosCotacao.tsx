"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {
  ArrowLeft,ArrowRight,CarFront,Check,CheckCircle2,
  Download,FileSpreadsheet,Layers3,Loader2,Pencil,Plus,Power,
  Save,ShieldCheck,Trash2,UploadCloud,X,
} from "lucide-react";
import {CATEGORIAS_COTACAO,type CategoriaCotacao,type PlanoEmpresa} from "@/lib/cotacoes-veiculares/catalogo";
import type {RegraComercialPlano,OpcionalComercial} from "@/lib/cotacoes-veiculares/comercial";
import ConfiguracaoComercialEditor, {type EditorHandle,type GrupoRegrasPayload} from "./ConfiguracaoComercialEditor";
import styles from "./page.module.css";

export type ArquivoPlano={
  empresa_id:string;plano:string;referencia:string;vigencia_ate:string|null;
  arquivo_precos_nome:string|null;arquivo_precos_em:string|null;
  arquivo_especiais_nome:string|null;arquivo_especiais_em:string|null;
};
type Faixa={
  plano:string;categoria:string;fipe_min_centavos:number;fipe_max_centavos:number;
  codigo_produto:string;valor_centavos:number;
};
type Props={
  planos:PlanoEmpresa[];arquivos:ArquivoPlano[];
  categoria:CategoriaCotacao;onCategoria:(v:CategoriaCotacao)=>void;
  faixas:Faixa[];regras:RegraComercialPlano[];
  opcionais:(OpcionalComercial&{plano:string;categoria:string})[];
  podeConfigurar:boolean;onUpdated:()=>Promise<void>;
};
type Modal={codigo:string|null;passo:1|2};
type ArquivoPendente={tipo:"precos"|"especiais";arquivo:File};
const dinheiro=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v/100);
const dataHora=(v:string)=>new Date(v).toLocaleString("pt-BR");
const TODAS_CATEGORIAS=Object.keys(CATEGORIAS_COTACAO) as CategoriaCotacao[];
const PLANO_RASCUNHO:PlanoEmpresa={
 empresa_id:"",codigo:"rascunho",nome:"Novo plano",ordem:0,ativo:true,
};

export default function PlanosCotacao({
  planos,arquivos,categoria,onCategoria,faixas,regras,opcionais,podeConfigurar,onUpdated,
}:Props){
  const [modal,setModal]=useState<Modal|null>(null);
  const [nome,setNome]=useState("");
  const [precoEditando,setPrecoEditando]=useState<Faixa|null>(null);
  const [novoPreco,setNovoPreco]=useState("");
  const [arquivo,setArquivo]=useState<ArquivoPendente|null>(null);
  const [removerArquivo,setRemoverArquivo]=useState<"precos"|"especiais"|null>(null);
  const [excluirPlano,setExcluirPlano]=useState<string|null>(null);
  const [ocupado,setOcupado]=useState(false);
  const [erro,setErro]=useState("");
  const [errosEtapa,setErrosEtapa]=useState<Record<string,string>>({});
  const [tentativa,setTentativa]=useState(0);
  const editorRef=useRef<EditorHandle|null>(null);
  const segundoEditorRef=useRef<EditorHandle|null>(null);
  const [categoriasPrimeira,setCategoriasPrimeira]=useState<CategoriaCotacao[]>(TODAS_CATEGORIAS);
  const [segundaAberta,setSegundaAberta]=useState(false);
  const [regrasSegunda,setRegrasSegunda]=useState<RegraComercialPlano[]>([]);
  const [opcionaisSegunda,setOpcionaisSegunda]=useState<
    (OpcionalComercial&{plano:string;categoria:string})[]>([]);
  const [carregandoSegunda,setCarregandoSegunda]=useState(false);
  const [erroSegunda,setErroSegunda]=useState("");
  const pendenteRef=useRef<string|null>(null);
  const nomePendenteRef=useRef<string>("");
  const nomeRef=useRef<HTMLInputElement|null>(null);
  const [sucesso,setSucesso]=useState("");
  const filePrecos=useRef<HTMLInputElement>(null);
  const fileEspeciais=useRef<HTMLInputElement>(null);
  const plano=planos.find(p=>p.codigo===modal?.codigo);
  // Props estáveis evitam perder regras preenchidas quando o nome é editado.
  const planosDoModal=useMemo(()=>plano?[plano]:[PLANO_RASCUNHO],[plano]);
  const regrasDoPlano=useMemo(()=>regras.filter(r=>r.plano===modal?.codigo),[regras,modal?.codigo]);
  const opcionaisDoPlano=useMemo(()=>opcionais.filter(o=>o.plano===modal?.codigo),[opcionais,modal?.codigo]);
  const meta=arquivos.find(a=>a.plano===modal?.codigo);
  const itens=faixas.filter(f=>f.plano===modal?.codigo);
  const categoriasSegunda=TODAS_CATEGORIAS.filter(c=>!categoriasPrimeira.includes(c));
  const categoriaSegunda=categoriasSegunda[0];
  function alterarCategoriaPrimeira(cat:CategoriaCotacao,marcada:boolean){
    setCategoriasPrimeira(atuais=>{
      const novas=marcada?[...atuais,cat]:atuais.filter(c=>c!==cat);
      return novas.length?TODAS_CATEGORIAS.filter(c=>novas.includes(c)):atuais;
    });
    setErro("");
  }

  useEffect(()=>{
    if(!modal||!segundaAberta||!categoriaSegunda){
      setRegrasSegunda([]);setOpcionaisSegunda([]);setErroSegunda("");
      setCarregandoSegunda(false);return;
    }
    if(!modal.codigo){
      setRegrasSegunda([]);setOpcionaisSegunda([]);setErroSegunda("");
      setCarregandoSegunda(false);return;
    }
    const abort=new AbortController();
    setCarregandoSegunda(true);setErroSegunda("");setRegrasSegunda([]);setOpcionaisSegunda([]);
    void (async()=>{
      try{
        const qs=new URLSearchParams({categoria:categoriaSegunda});
        const response=await fetch("/api/cotacoes-veiculares/comercial?"+qs,{
          cache:"no-store",signal:abort.signal,
        });
        const data=await response.json();
        if(!response.ok||!data.ok)throw new Error(data.error||"Falha ao carregar 2ª Regras.");
        if(abort.signal.aborted)return;
        setRegrasSegunda((data.regras||[]).filter(
          (regra:RegraComercialPlano)=>regra.plano===modal.codigo));
        setOpcionaisSegunda((data.opcionais||[]).filter(
          (extra:OpcionalComercial&{plano:string})=>extra.plano===modal.codigo));
      }catch(e){
        if(!abort.signal.aborted)
          setErroSegunda(e instanceof Error?e.message:"Falha ao carregar a segunda regra.");
      }finally{if(!abort.signal.aborted)setCarregandoSegunda(false);}
    })();
    return ()=>abort.abort();
  },[modal?.codigo,Boolean(modal),segundaAberta,categoriaSegunda]);


  useEffect(()=>{
    if(!modal)return;
    const original=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!ocupado&&
      !arquivo&&!removerArquivo&&!excluirPlano)fechar();};
    window.addEventListener("keydown",onKey);
    return ()=>{document.body.style.overflow=original;window.removeEventListener("keydown",onKey);};
  },[modal!==null,ocupado,arquivo,removerArquivo,excluirPlano]);

  function abrir(planoAtual?:PlanoEmpresa){
    pendenteRef.current=null;nomePendenteRef.current="";
    setNome(planoAtual?.nome||"");
    setModal({codigo:planoAtual?.codigo||null,passo:1});
    setArquivo(null);setRemoverArquivo(null);setPrecoEditando(null);
    setErro("");setSucesso("");setErrosEtapa({});
    setCategoriasPrimeira(TODAS_CATEGORIAS);setSegundaAberta(false);
    setRegrasSegunda([]);setOpcionaisSegunda([]);setErroSegunda("");
  }
  function fechar(){
    if(ocupado)return;
    setModal(null);setArquivo(null);setRemoverArquivo(null);
    setPrecoEditando(null);setErro("");setSucesso("");setErrosEtapa({});
    if(pendenteRef.current){
      pendenteRef.current=null;nomePendenteRef.current="";
      void onUpdated();
    }
  }
  async function planoApi(acao:"criar"|"renomear"|"ativar"|"desativar"|"excluir",codigo?:string,nomeNovo?:string,refresh=true){
    const res=await fetch("/api/cotacoes-veiculares/planos",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({acao,codigo,nome:nomeNovo}),
    });
    const json=await res.json();
    if(!res.ok||!json.ok)throw new Error(json.error||"Não foi possível alterar o plano.");
    if(refresh)await onUpdated();
    return json as {codigo?:string};
  }
  function erroCampo(campo:string){return errosEtapa[campo]?
    <span className={styles.requiredError} role="alert">{errosEtapa[campo]}</span>:null;
  }
  function destacarCampos(erros:Record<string,string>,alvo?:"nome"){
    setErrosEtapa(erros);setTentativa(v=>v+1);
    setErro("Confira os campos obrigatórios destacados.");
    requestAnimationFrame(()=>{
      const elemento=alvo==="nome"?nomeRef.current:
        document.querySelector('[data-required-error="true"]');
      elemento?.scrollIntoView({behavior:"smooth",block:"center"});
      if(elemento instanceof HTMLInputElement)elemento.focus({preventScroll:true});
    });
  }
  function nomeValido(){
    const valor=nome.trim().replace(/\s+/g," ");
    if(valor.length<2||valor.length>90){
      destacarCampos({nome:valor.length<2?
        "Informe o nome do plano (mínimo de 2 caracteres).":
        "O nome deve ter no máximo 90 caracteres."},"nome");
      return false;
    }
    return true;
  }
  async function avancarParaArquivos(){
    if(!modal||ocupado||!podeConfigurar)return;
    if(!nomeValido())return;
    // Valida todos os campos ANTES de criar o plano: nenhum cadastro vazio é gerado.
    const editor=editorRef.current;
    if(!editor?.validate())return;
    if(categoriasSegunda.length&&!segundaAberta){
      setErro("As categorias desmarcadas precisam de uma 2ª Regras. Clique em Novas regras por categoria.");
      return;
    }
    if(segundaAberta){
      if(carregandoSegunda||erroSegunda){
        setErro(erroSegunda||"Aguarde o carregamento da segunda regra.");
        return;
      }
      if(!segundoEditorRef.current?.validate())return;
    }
    setOcupado(true);setErro("");setErrosEtapa({});
    try{
      const nomeNormalizado=nome.trim().replace(/\s+/g," ");
      let codigo=modal.codigo;
      if(!codigo){
        codigo=pendenteRef.current;
        if(!codigo){
          const criado=await planoApi("criar",undefined,nomeNormalizado,false);
          codigo=criado.codigo||null;
          if(!codigo)throw new Error("O servidor não retornou o código do novo plano.");
          pendenteRef.current=codigo;
          nomePendenteRef.current=nomeNormalizado;
        }else if(nomePendenteRef.current!==nomeNormalizado){
          await planoApi("renomear",codigo,nomeNormalizado,false);
          nomePendenteRef.current=nomeNormalizado;
        }
      }
      const primeira=editor.getDraft(codigo||undefined);
      const segunda=segundaAberta?segundoEditorRef.current?.getDraft(codigo||undefined):null;
      if(!primeira||(segundaAberta&&!segunda)){
        setErro("Revise os campos das regras antes de avançar.");
        return;
      }
      const grupos:GrupoRegrasPayload[]=[primeira];
      if(segunda)grupos.push(segunda);
      const response=await fetch("/api/cotacoes-veiculares/comercial",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          acao:"regras_grupos",plano:codigo,
          grupos,condicoes:editor.getCondicoes(),
        }),
      });
      const data=await response.json();
      if(!response.ok||!data.ok)
        throw new Error(data.error||"Não foi possível salvar os grupos de regras.");
      if(modal.codigo && plano?.nome!==nomeNormalizado){
        await planoApi("renomear",modal.codigo,nomeNormalizado,false);
      }
      await onUpdated();
      pendenteRef.current=null;nomePendenteRef.current="";
      setModal({codigo,passo:2});
      setErrosEtapa({});setErro("");setSucesso("");
    }catch(e){
      setErro(e instanceof Error?e.message:"Não foi possível cadastrar o plano.");
    }finally{setOcupado(false);}
  }
  async function alterarStatus(p:PlanoEmpresa){
    setOcupado(true);setErro("");setSucesso("");
    try{
      await planoApi(p.ativo?"desativar":"ativar",p.codigo);
      setSucesso("Plano "+p.nome+(p.ativo?" desativado.":" ativado."));
    }catch(e){setErro(e instanceof Error?e.message:"Não foi possível alterar o plano.");}
    finally{setOcupado(false);}
  }
  async function confirmarExclusao(){
    if(!excluirPlano)return;
    setOcupado(true);setErro("");
    try{
      await planoApi("excluir",excluirPlano);
      setSucesso("Plano excluído. As cotações antigas foram preservadas.");
      if(modal?.codigo===excluirPlano)fechar();
      setExcluirPlano(null);
    }catch(e){setErro(e instanceof Error?e.message:"Não foi possível excluir o plano.");}
    finally{setOcupado(false);}
  }
  async function confirmarImportacao(){
    if(!arquivo||!modal?.codigo)return;
    setOcupado(true);setErro("");setSucesso("");
    try{
      const form=new FormData();
      form.set("tipo",arquivo.tipo);form.set("plano",modal.codigo);form.set("arquivo",arquivo.arquivo);
      const res=await fetch("/api/cotacoes-veiculares/importar",{method:"POST",body:form});
      const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Falha ao importar arquivo.");
      setArquivo(null);
      if(arquivo.tipo==="precos")setErrosEtapa(prev=>({...prev,tabela:""}));
      await onUpdated();
      setSucesso("Arquivo importado: "+json.nome+" ("+json.total+" registros).");
    }catch(e){setErro(e instanceof Error?e.message:"Falha ao importar.");}
    finally{setOcupado(false);}
  }
  async function confirmarRemocaoArquivo(){
    if(!removerArquivo||!modal?.codigo)return;
    setOcupado(true);setErro("");
    try{
      const q=new URLSearchParams({tipo:removerArquivo,plano:modal.codigo});
      const res=await fetch("/api/cotacoes-veiculares/importar?"+q,{method:"DELETE"});
      const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Falha ao remover arquivo.");
      setRemoverArquivo(null);
      await onUpdated();
      setSucesso("Arquivo e dados do plano removidos.");
    }catch(e){setErro(e instanceof Error?e.message:"Falha ao remover arquivo.");}
    finally{setOcupado(false);}
  }
  async function salvarPreco():Promise<boolean>{
    if(!modal?.codigo)return false;
    const preco=Number(novoPreco.replace(",","."));
    if(!Number.isFinite(preco)||preco<=0){
      destacarCampos({preco:"Informe uma mensalidade maior que zero."});return false;
    }
    setOcupado(true);setErro("");setErrosEtapa({});
    try{
      const res=await fetch("/api/cotacoes-veiculares",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          acao:"preco",plano:modal.codigo,categoria,
          fipe_min_centavos:precoEditando?.fipe_min_centavos,
          valor_centavos:Math.round(preco*100),
        }),
      });
      const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Falha ao salvar a mensalidade.");
      setPrecoEditando(null);await onUpdated();
      setSucesso("Mensalidade alterada.");return true;
    }catch(e){setErro(e instanceof Error?e.message:"Erro ao salvar.");return false;}
    finally{setOcupado(false);}
  }
  function concluirCadastro(){
    if(ocupado)return;
    if(!meta?.arquivo_precos_nome){
      destacarCampos({tabela:"Importe a tabela de preços deste plano para concluir."});return;
    }
    fechar();
  }

  return <section className={styles.plansOverview}>
    <div className={styles.plansOverviewHeading}>
      <div><span className={styles.eyebrow}>Gestão de produtos</span>
        <h2>Planos de proteção</h2>
        <p>Organize os planos da sua empresa. Cada um possui coberturas, preços e arquivos próprios.</p>
      </div>
      {podeConfigurar&&<button type="button" className={styles.primary} disabled={ocupado}
        onClick={()=>abrir()}><Plus size={18}/> Criar plano</button>}
    </div>
    {erro&&!modal&&<div role="alert" className={styles.error}>{erro}</div>}
    {sucesso&&!modal&&<div role="status" className={styles.success}>{sucesso}</div>}
    <div className={styles.planCardsGrid}>
      {planos.map((p,index)=>{
        const info=arquivos.find(a=>a.plano===p.codigo);
        const temPreco=Boolean(info?.arquivo_precos_nome);
        return <article key={p.codigo} className={styles.planOverviewCard} data-inactive={!p.ativo}>
          <div className={styles.planCardHeader}>
            <span className={styles.planSymbol}><Layers3 size={22}/></span>
            <span className={p.ativo?styles.planActiveBadge:styles.planInactiveBadge}>
              {p.ativo?"Ativo":"Inativo"}
            </span>
          </div>
          <div className={styles.planCardBody}>
            <span className={styles.planIndex}>PLANO {String(index+1).padStart(2,"0")}</span>
            <h3>{p.nome}</h3>
            <p>{temPreco?"Tabela de preços importada":"Aguardando tabela de preços"}</p>
          </div>
          <div className={styles.planCardMetrics}>
            <span><FileSpreadsheet size={15}/> {temPreco?"Tabela cadastrada":"Sem tabela"}</span>
            {info?.arquivo_precos_em&&<span><CheckCircle2 size={15}/> Importada em {new Date(info.arquivo_precos_em).toLocaleDateString("pt-BR")}</span>}
          </div>
          <div className={styles.planCardActions}>
            <button type="button" className={styles.planEditButton} onClick={()=>abrir(p)}>
              <Pencil size={15}/> Editar
            </button>
            {podeConfigurar&&<>
              <button type="button" disabled={ocupado} className={styles.planStatusButton}
                title={p.ativo?"Desativar plano":"Ativar plano"}
                onClick={()=>void alterarStatus(p)}><Power size={15}/>{p.ativo?"Desativar":"Ativar"}</button>
              <button type="button" disabled={ocupado} className={styles.planDeleteButton}
                aria-label={"Excluir plano "+p.nome} onClick={()=>{setExcluirPlano(p.codigo);setErro("");}}>
                <Trash2 size={17}/>
              </button>
            </>}
          </div>
        </article>;
      })}
      {!planos.length&&<div className={styles.planEmptyState}>
        <Layers3 size={33}/><h3>Nenhum plano cadastrado</h3>
        <p>Crie um plano para começar a cadastrar suas coberturas e tabelas de valores.</p>
        {podeConfigurar&&<button className={styles.primary} type="button" onClick={()=>abrir()}>
          <Plus size={16}/> Criar primeiro plano</button>}
      </div>}
    </div>

    {excluirPlano&&<div className={styles.planModalOverlay} onMouseDown={e=>{
      if(e.target===e.currentTarget&&!ocupado)setExcluirPlano(null);
    }}>
      <section role="alertdialog" aria-modal="true" aria-label="Confirmar exclusão" className={styles.planDeleteDialog}>
        <div className={styles.planDeleteVisual}><Trash2 size={23}/></div>
        <h3>Excluir este plano?</h3>
        <p>O plano <strong>{planos.find(x=>x.codigo===excluirPlano)?.nome}</strong>, seus preços e regras serão excluídos. As cotações já realizadas continuam no histórico.</p>
        {erro&&<p role="alert" className={styles.error}>{erro}</p>}
        <div className={styles.planModalFooter}>
          <button type="button" disabled={ocupado} className={styles.secondary}
            onClick={()=>setExcluirPlano(null)}>Cancelar</button>
          <button type="button" disabled={ocupado} className={styles.planDeleteConfirm}
            onClick={()=>void confirmarExclusao()}>{ocupado?<Loader2 size={16}/>:<Trash2 size={16}/>} Excluir plano</button>
        </div>
      </section>
    </div>}

    {modal&&<div className={styles.planModalOverlay} onMouseDown={e=>{
      if(e.target===e.currentTarget&&!ocupado&&!arquivo&&!removerArquivo)fechar();
    }}>
      <section role="dialog" aria-modal="true" aria-label={plano?"Editar plano":"Criar plano"}
        className={styles.planWizard}>
        <header className={styles.planWizardHeader}>
          <div className={styles.planWizardTitle}>
            <span className={styles.planSymbol}><ShieldCheck size={23}/></span>
            <div><span className={styles.eyebrow}>Cadastro comercial</span>
              <h2>{plano?"Editar "+plano.nome:"Criar novo plano"}</h2></div>
          </div>
          <button type="button" className={styles.planCloseButton} aria-label="Fechar cadastro"
            disabled={ocupado} onClick={fechar}><X size={21}/></button>
        </header>
        <nav className={styles.planSteps} aria-label="Etapas do cadastro">
          {([["1","Nome e regras"],["2","Arquivos e valores"]] as const).map(([n,rotulo],i)=>{
            const etapa=(i+1) as 1|2;
            return <button key={n} type="button" disabled={!modal.codigo&&etapa!==1||ocupado}
              aria-current={modal.passo===etapa?"step":undefined}
              className={modal.passo===etapa?styles.planStepActive:styles.planStep}
              onClick={()=>{if(etapa===1){setModal(v=>v?{...v,passo:1}:null);setErrosEtapa({});}else void avancarParaArquivos();}}>
              <span>{modal.passo>etapa?<Check size={15}/>:n}</span>{rotulo}
            </button>;
          })}
        </nav>
        <div className={styles.planWizardContent}>
          {erro&&<div className={styles.error} role="alert">{erro}</div>}
          {sucesso&&<div className={styles.success} role="status">{sucesso}</div>}
          {plano&&!plano.ativo&&<div className={styles.warning}>
            <Power size={18}/><span>Este plano está desativado. Ative-o no card para editar as regras, importar arquivos ou incluí-lo nas novas cotações.</span>
          </div>}
          {modal.passo===1&&<div className={styles.planStepContent}>
            <span className={styles.planStepEyebrow}>01 / NOME E REGRAS</span>
            <h3>Identificação e condições do plano</h3>
            <p>Configure a 1ª Regras para as categorias atendidas. Caso alguma tenha condições diferentes, crie a 2ª Regras.</p>
            <label key={"nome-"+(errosEtapa.nome?tentativa:0)}
              className={styles.planWizardField+" "+(errosEtapa.nome?styles.requiredFieldInvalid:"")}>
              <span className={styles.planNameLabel}>Nome do plano <span className={styles.requiredAsterisk}>*</span></span>
              <input ref={nomeRef} value={nome} maxLength={90} aria-invalid={Boolean(errosEtapa.nome)}
                placeholder="Ex.: Essencial, Plus ou Proteção Total"
                disabled={!podeConfigurar||ocupado}
                onChange={e=>{setNome(e.target.value);setErrosEtapa(prev=>({...prev,nome:""}));}}
                onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void avancarParaArquivos();}}}/>
              {erroCampo("nome")}
            </label>
            {plano&&<small className={styles.smallNote}>Alterar o nome não modifica as cotações anteriores.</small>}
            {(!plano||plano.ativo)
              ?<div className={styles.planWizardEmbedded}>
                <ConfiguracaoComercialEditor ref={editorRef} categoria={categoria}
                  planos={planosDoModal} regras={regrasDoPlano} opcionais={opcionaisDoPlano}
                  rascunho={!plano} nomeRascunho={nome} grupoTitulo="1ª Regras"
                  categoriasSelecionadas={categoriasPrimeira}
                  categoriasDisponiveis={TODAS_CATEGORIAS}
                  onCategoriaToggle={alterarCategoriaPrimeira}
                  podeConfigurar={podeConfigurar} onSaved={onUpdated}>
                  {categoriasSegunda.length>0&&(!segundaAberta
                    ?<button type="button" className={styles.ruleSecondButton}
                        onClick={()=>{setSegundaAberta(true);setErro("");}} disabled={!podeConfigurar||ocupado}>
                        <Plus size={19}/> Novas regras por categoria
                        <span>{categoriasSegunda.length} categoria(s) disponível(is)</span>
                      </button>
                    :<div className={styles.ruleSecondContainer}>
                      <div className={styles.ruleSecondControls}>
                        <span>Regras específicas para as categorias restantes</span>
                        <button type="button" className={styles.secondary}
                          disabled={ocupado} onClick={()=>{setSegundaAberta(false);setErroSegunda("");}}>
                          <X size={15}/> Remover 2ª Regras
                        </button>
                      </div>
                      {carregandoSegunda?<div className={styles.ruleSecondLoading}>
                        <Loader2 size={19}/> Carregando as regras cadastradas...
                      </div>:erroSegunda?<div className={styles.error} role="alert">{erroSegunda}</div>:
                      <ConfiguracaoComercialEditor
                        key={"segunda-"+categoriaSegunda+"-"+(modal?.codigo||"rascunho")}
                        ref={segundoEditorRef} categoria={categoriaSegunda}
                        planos={planosDoModal} regras={regrasSegunda} opcionais={opcionaisSegunda}
                        rascunho={!plano} nomeRascunho={nome} grupoTitulo="2ª Regras"
                        categoriasSelecionadas={categoriasSegunda}
                        categoriasDisponiveis={categoriasSegunda}
                        esconderCondicoes podeConfigurar={podeConfigurar} onSaved={onUpdated}/>}
                    </div>)}
                </ConfiguracaoComercialEditor>
              </div>
              :<p className={styles.smallNote}>Ative o plano para continuar a configuração.</p>}
          </div>}
          {modal.passo===2&&plano&&<div className={styles.planStepContent}>
            <span className={styles.planStepEyebrow}>02 / ARQUIVOS E VALORES</span>
            <h3>Arquivos e mensalidades</h3>
            <p>Importe os preços deste plano e, se necessário, sua lista de veículos especiais. Os demais planos não são alterados.</p>
            <div className={styles.planUploadGrid}>
              {(["precos","especiais"] as const).map(tipo=>{
                const atual=tipo==="precos"?meta?.arquivo_precos_nome:meta?.arquivo_especiais_nome;
                const data=tipo==="precos"?meta?.arquivo_precos_em:meta?.arquivo_especiais_em;
                return <div data-required-error={tipo==="precos"&&Boolean(errosEtapa.tabela)?"true":undefined}
                  key={tipo+"-"+(tipo==="precos"&&errosEtapa.tabela?tentativa:0)}
                  className={styles.planUploadCard+" "+(tipo==="precos"&&errosEtapa.tabela?styles.requiredFieldInvalid:"")}>
                  <div className={styles.planUploadIcon}>{tipo==="precos"?<FileSpreadsheet size={22}/>:<CarFront size={22}/>}</div>
                  <h4>{tipo==="precos"?"Tabela de preços *":"Veículos especiais"}</h4>
                  {tipo==="precos"&&erroCampo("tabela")}
                  <p>{tipo==="precos"?"Faixas FIPE, códigos e valores de mensalidade.":"Modelos e versões especiais aceitos pelo plano."}</p>
                  {atual&&<div className={styles.importedFile}>
                    <FileSpreadsheet size={17}/><div><strong>{atual}</strong>
                      {data&&<small>Importado em {dataHora(data)}</small>}</div>
                    {podeConfigurar&&plano.ativo&&<button type="button" title="Remover arquivo"
                      aria-label={"Remover "+atual} disabled={ocupado}
                      onClick={()=>{setRemoverArquivo(tipo);setArquivo(null);}}>
                      <X size={16}/></button>}
                  </div>}
                  {tipo==="precos"
                    ?<input ref={filePrecos} className={styles.hiddenFile} type="file" accept=".xlsx"
                      onChange={e=>{const file=e.target.files?.[0];if(file)setArquivo({tipo,arquivo:file});e.target.value="";}}/>
                    :<input ref={fileEspeciais} className={styles.hiddenFile} type="file" accept=".xlsx"
                      onChange={e=>{const file=e.target.files?.[0];if(file)setArquivo({tipo,arquivo:file});e.target.value="";}}/>}
                  <div className={styles.planUploadActions}>
                    <button type="button" className={styles.secondary}
                      disabled={!podeConfigurar||!plano.ativo||ocupado}
                      onClick={()=>tipo==="precos"?filePrecos.current?.click():fileEspeciais.current?.click()}>
                      <UploadCloud size={15}/>{atual?"Substituir arquivo":"Importar arquivo"}</button>
                    <a className={styles.modelLink}
                      href={"/api/cotacoes-veiculares/importar?tipo="+tipo+"&plano="+encodeURIComponent(plano.codigo)}>
                      <Download size={15}/> Baixar modelo</a>
                  </div>
                </div>;
              })}
            </div>
            {arquivo&&<div className={styles.planInlineConfirm}>
              <FileSpreadsheet size={19}/>
              <div><strong>{arquivo.arquivo.name}</strong><p>Confirmar importação? Os dados anteriores deste tipo e plano serão substituídos.</p></div>
              <button className={styles.secondary} type="button" disabled={ocupado}
                onClick={()=>setArquivo(null)}>Cancelar</button>
              <button className={styles.primary} type="button" disabled={ocupado}
                onClick={()=>void confirmarImportacao()}><Check size={16}/> Confirmar</button>
            </div>}
            {removerArquivo&&<div className={styles.planInlineConfirm}>
              <Trash2 size={19}/><div><strong>Remover {removerArquivo==="precos"?"os preços":"a lista de especiais"}?</strong>
                <p>Somente os registros deste plano serão removidos. O histórico de cotações permanece.</p></div>
              <button className={styles.secondary} type="button" disabled={ocupado}
                onClick={()=>setRemoverArquivo(null)}>Cancelar</button>
              <button className={styles.planDeleteConfirm} type="button" disabled={ocupado}
                onClick={()=>void confirmarRemocaoArquivo()}>Remover</button>
            </div>}
            <div className={styles.planPrices}>
              <h4>Valores por faixa FIPE</h4>
              <label className={styles.planWizardField}>Categoria
                <select value={categoria} onChange={e=>onCategoria(e.target.value as CategoriaCotacao)}>
                  {Object.entries(CATEGORIAS_COTACAO).map(([key,label])=>
                    <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              {!itens.length?<p className={styles.smallNote}>Nenhum preço importado nesta categoria.</p>
                :<div className={styles.tableScroll}><table>
                  <thead><tr><th>Faixa FIPE</th><th>Mensalidade</th><th>Código</th><th></th></tr></thead>
                  <tbody>{itens.map(f=><tr key={f.fipe_min_centavos}>
                    <td>{dinheiro(Number(f.fipe_min_centavos))} – {dinheiro(Number(f.fipe_max_centavos))}</td>
                    <td>{dinheiro(Number(f.valor_centavos))}</td><td>{f.codigo_produto}</td>
                    <td><button type="button" className={styles.smallButton} disabled={!podeConfigurar||!plano.ativo}
                      onClick={()=>{setPrecoEditando(f);setNovoPreco((Number(f.valor_centavos)/100).toFixed(2));}}>Editar</button></td>
                  </tr>)}</tbody>
                </table></div>}
              {precoEditando&&<div className={styles.planPriceEditor+" "+(errosEtapa.preco?styles.requiredFieldInvalid:"")} key={"preco-"+(errosEtapa.preco?tentativa:0)}>
                <label>Nova mensalidade (R$)
                  <input inputMode="decimal" aria-invalid={Boolean(errosEtapa.preco)} value={novoPreco} onChange={e=>{setNovoPreco(e.target.value);setErrosEtapa(prev=>({...prev,preco:""}));}}/>{erroCampo("preco")}</label>
                <button type="button" className={styles.secondary} onClick={()=>setPrecoEditando(null)}>Cancelar</button>
                <button type="button" className={styles.primary} disabled={ocupado}
                  onClick={()=>void salvarPreco()}><Save size={15}/> Salvar preço</button>
              </div>}
            </div>
          </div>}
        </div>
        <footer className={styles.planWizardFooter}>
          <span>{modal.passo===1?"Preencha o nome e as regras obrigatórias antes de avançar.":"Importe a tabela de preços do plano para concluir."}</span>
          <div className={styles.planWizardFooterActions}>
            {modal.passo===2&&<button type="button" className={styles.secondary}
              disabled={ocupado} onClick={()=>setModal(v=>v?{...v,passo:1}:null)}>
              <ArrowLeft size={16}/> Voltar</button>}
            {modal.passo===1
              ?<button type="button" className={styles.primary} disabled={ocupado||!podeConfigurar}
                onClick={()=>void avancarParaArquivos()}>
                {ocupado?<Loader2 size={16}/>:<ArrowRight size={16}/>}
                Salvar regras e avançar
              </button>
              :<button type="button" className={styles.primary} disabled={ocupado||!podeConfigurar}
                onClick={()=>void concluirCadastro()}><CheckCircle2 size={17}/> Concluir</button>}
          </div>
        </footer>
      </section>
    </div>}
  </section>;
}
