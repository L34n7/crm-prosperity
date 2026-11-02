"use client";

import {useEffect,useRef,useState} from "react";
import {
  ArrowLeft,ArrowRight,CalendarDays,CarFront,Check,CheckCircle2,
  Download,FileSpreadsheet,Layers3,Loader2,Pencil,Plus,Power,
  Save,ShieldCheck,Trash2,UploadCloud,X,
} from "lucide-react";
import {CATEGORIAS_COTACAO,type CategoriaCotacao,type PlanoEmpresa} from "@/lib/cotacoes-veiculares/catalogo";
import type {RegraComercialPlano,OpcionalComercial} from "@/lib/cotacoes-veiculares/comercial";
import ConfiguracaoComercialEditor from "./ConfiguracaoComercialEditor";
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
type Modal={codigo:string|null;passo:1|2|3};
type ArquivoPendente={tipo:"precos"|"especiais";arquivo:File};
const dinheiro=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v/100);
const dataHora=(v:string)=>new Date(v).toLocaleString("pt-BR");

export default function PlanosCotacao({
  planos,arquivos,categoria,onCategoria,faixas,regras,opcionais,podeConfigurar,onUpdated,
}:Props){
  const [modal,setModal]=useState<Modal|null>(null);
  const [nome,setNome]=useState("");
  const [referencia,setReferencia]=useState("");
  const [vigencia,setVigencia]=useState("");
  const [precoEditando,setPrecoEditando]=useState<Faixa|null>(null);
  const [novoPreco,setNovoPreco]=useState("");
  const [arquivo,setArquivo]=useState<ArquivoPendente|null>(null);
  const [removerArquivo,setRemoverArquivo]=useState<"precos"|"especiais"|null>(null);
  const [excluirPlano,setExcluirPlano]=useState<string|null>(null);
  const [ocupado,setOcupado]=useState(false);
  const [erro,setErro]=useState("");
  const [sucesso,setSucesso]=useState("");
  const filePrecos=useRef<HTMLInputElement>(null);
  const fileEspeciais=useRef<HTMLInputElement>(null);
  const plano=planos.find(p=>p.codigo===modal?.codigo);
  const meta=arquivos.find(a=>a.plano===modal?.codigo);
  const itens=faixas.filter(f=>f.plano===modal?.codigo);
  const hoje=new Date().toISOString().slice(0,10);

  useEffect(()=>{
    if(!modal)return;
    const original=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!ocupado&&
      !arquivo&&!removerArquivo&&!excluirPlano)setModal(null);};
    window.addEventListener("keydown",onKey);
    return ()=>{document.body.style.overflow=original;window.removeEventListener("keydown",onKey);};
  },[modal!==null,ocupado,arquivo,removerArquivo,excluirPlano]);

  function abrir(planoAtual?:PlanoEmpresa){
    setNome(planoAtual?.nome||"");
    const info=arquivos.find(x=>x.plano===planoAtual?.codigo);
    setReferencia(info?.referencia||"");
    setVigencia(info?.vigencia_ate||"");
    setModal({codigo:planoAtual?.codigo||null,passo:1});
    setArquivo(null);setRemoverArquivo(null);setPrecoEditando(null);
    setErro("");setSucesso("");
  }
  function fechar(){
    if(ocupado)return;
    setModal(null);setArquivo(null);setRemoverArquivo(null);
    setPrecoEditando(null);setErro("");setSucesso("");
  }
  async function planoApi(acao:"criar"|"renomear"|"ativar"|"desativar"|"excluir",codigo?:string,nomeNovo?:string){
    const res=await fetch("/api/cotacoes-veiculares/planos",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({acao,codigo,nome:nomeNovo}),
    });
    const json=await res.json();
    if(!res.ok||!json.ok)throw new Error(json.error||"Não foi possível alterar o plano.");
    await onUpdated();
    return json as {codigo?:string};
  }
  async function salvarNome(){
    const valor=nome.trim().replace(/\s+/g," ");
    if(valor.length<2||valor.length>90){setErro("Informe um nome entre 2 e 90 caracteres.");return;}
    setOcupado(true);setErro("");
    try{
      let codigo=modal?.codigo||null;
      if(codigo){
        if(plano?.nome!==valor)await planoApi("renomear",codigo,valor);
      }else{
        const resultado=await planoApi("criar",undefined,valor);
        codigo=resultado.codigo||null;
        if(!codigo)throw new Error("Não foi possível identificar o plano criado.");
      }
      setModal({codigo,passo:2});
      setSucesso("");
    }catch(e){setErro(e instanceof Error?e.message:"Falha ao salvar nome.");}
    finally{setOcupado(false);}
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
      if(arquivo.tipo==="precos")form.set("referencia",referencia.trim()||"Tabela de "+plano?.nome);
      const res=await fetch("/api/cotacoes-veiculares/importar",{method:"POST",body:form});
      const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Falha ao importar arquivo.");
      setArquivo(null);
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
  async function salvarValores(acao:"vigencia"|"preco"){
    if(!modal?.codigo)return;
    setOcupado(true);setErro("");
    try{
      const endpoint=acao==="vigencia"?"/api/cotacoes-veiculares/comercial":"/api/cotacoes-veiculares";
      const corpo=acao==="vigencia"
        ?{acao,plano:modal.codigo,referencia,vigencia_ate:vigencia}
        :{acao,plano:modal.codigo,categoria,fipe_min_centavos:precoEditando?.fipe_min_centavos,
          valor_centavos:Math.round(Number(novoPreco.replace(",", "."))*100)};
      const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(corpo)});
      const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Falha ao salvar.");
      setPrecoEditando(null);await onUpdated();
      setSucesso(acao==="vigencia"?"Referência e validade salvas.":"Mensalidade alterada.");
    }catch(e){setErro(e instanceof Error?e.message:"Falha ao salvar.");}
    finally{setOcupado(false);}
  }
  function proximaEtapa(passo:1|2|3){
    setModal(v=>v?{...v,passo}:null);
    setErro("");setSucesso("");
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
        const valido=Boolean(info?.vigencia_ate&&info.vigencia_ate>=hoje);
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
            <span><CalendarDays size={15}/> {valido?"Vigente":info?.vigencia_ate?"Vencido":"Sem validade"}</span>
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
          {([["1","Nome"],["2","Regras"],["3","Arquivos e valores"]] as const).map(([n,rotulo],i)=>{
            const etapa=(i+1) as 1|2|3;
            return <button key={n} type="button" disabled={!modal.codigo&&etapa!==1||ocupado}
              aria-current={modal.passo===etapa?"step":undefined}
              className={modal.passo===etapa?styles.planStepActive:styles.planStep}
              onClick={()=>proximaEtapa(etapa)}>
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
            <span className={styles.planStepEyebrow}>01 / IDENTIFICAÇÃO</span>
            <h3>Identificação do plano</h3>
            <p>Escolha o nome que será exibido nas cotações e ao cliente.</p>
            <label className={styles.planWizardField}>Nome do plano
              <input autoFocus value={nome} maxLength={90}
                placeholder="Ex.: Essencial, Plus ou Proteção Total"
                disabled={!podeConfigurar||ocupado}
                onChange={e=>setNome(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void salvarNome();}}}/>
            </label>
            {plano&&<small className={styles.smallNote}>Renomear não altera as cotações antigas nem os arquivos cadastrados.</small>}
          </div>}
          {modal.passo===2&&plano&&<div className={styles.planStepContent}>
            <span className={styles.planStepEyebrow}>02 / CONFIGURAÇÃO</span>
            <h3>Regras e coberturas</h3>
            <p>Selecione uma categoria para começar. Se as regras forem iguais para outros veículos, marque as categorias adicionais ao final do formulário e salve tudo de uma vez.</p>
            <label className={styles.planWizardField}>Categoria de veículos
              <select value={categoria} disabled={ocupado} onChange={e=>
                onCategoria(e.target.value as CategoriaCotacao)}>
                {Object.entries(CATEGORIAS_COTACAO).map(([c,titulo])=>
                  <option key={c} value={c}>{titulo}</option>)}
              </select>
            </label>
            {plano.ativo?<div className={styles.planWizardEmbedded}>
              <ConfiguracaoComercialEditor categoria={categoria} planos={[plano]}
                regras={regras.filter(r=>r.plano===plano.codigo)}
                opcionais={opcionais.filter(o=>o.plano===plano.codigo)}
                podeConfigurar={podeConfigurar} onSaved={onUpdated}/>
            </div>:<p className={styles.smallNote}>Ative o plano para continuar a configuração.</p>}
          </div>}
          {modal.passo===3&&plano&&<div className={styles.planStepContent}>
            <span className={styles.planStepEyebrow}>03 / TABELAS E VALORES</span>
            <h3>Arquivos e mensalidades</h3>
            <p>Importe os preços deste plano e, se necessário, sua lista de veículos especiais. Os demais planos não são alterados.</p>
            <div className={styles.planUploadGrid}>
              {(["precos","especiais"] as const).map(tipo=>{
                const atual=tipo==="precos"?meta?.arquivo_precos_nome:meta?.arquivo_especiais_nome;
                const data=tipo==="precos"?meta?.arquivo_precos_em:meta?.arquivo_especiais_em;
                return <div className={styles.planUploadCard} key={tipo}>
                  <div className={styles.planUploadIcon}>{tipo==="precos"?<FileSpreadsheet size={22}/>:<CarFront size={22}/>}</div>
                  <h4>{tipo==="precos"?"Tabela de preços":"Veículos especiais"}</h4>
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
            <div className={styles.planValidity}>
              <label>Referência da tabela
                <input value={referencia} maxLength={160} disabled={!podeConfigurar||!plano.ativo}
                  onChange={e=>setReferencia(e.target.value)} placeholder={"Tabela comercial de "+plano.nome}/></label>
              <label>Válida até
                <input value={vigencia} type="date" disabled={!podeConfigurar||!plano.ativo}
                  onChange={e=>setVigencia(e.target.value)}/></label>
              <button type="button" className={styles.secondary}
                disabled={!podeConfigurar||!plano.ativo||ocupado||!meta?.arquivo_precos_nome}
                onClick={()=>void salvarValores("vigencia")}><CalendarDays size={16}/> Salvar validade</button>
            </div>
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
              {precoEditando&&<div className={styles.planPriceEditor}>
                <label>Nova mensalidade (R$)
                  <input inputMode="decimal" value={novoPreco} onChange={e=>setNovoPreco(e.target.value)}/></label>
                <button type="button" className={styles.secondary} onClick={()=>setPrecoEditando(null)}>Cancelar</button>
                <button type="button" className={styles.primary} disabled={ocupado}
                  onClick={()=>void salvarValores("preco")}><Save size={15}/> Salvar preço</button>
              </div>}
            </div>
          </div>}
        </div>
        <footer className={styles.planWizardFooter}>
          <span>{modal.passo===1?"Preencha o nome para avançar.":modal.passo===2?"Salve a categoria atual e, se desejar, copie para outras.":"Dados salvos por plano, sem afetar outros."}</span>
          <div className={styles.planWizardFooterActions}>
            {modal.passo>1&&<button type="button" className={styles.secondary}
              disabled={ocupado} onClick={()=>proximaEtapa(modal.passo===3?2:1)}>
              <ArrowLeft size={16}/> Voltar</button>}
            {modal.passo===1
              ?<button type="button" className={styles.primary}
                disabled={ocupado||!podeConfigurar||nome.trim().length<2}
                onClick={()=>void salvarNome()}>{ocupado?<Loader2 size={16}/>:<Save size={16}/>} Salvar e continuar</button>
              :modal.passo===2
                ?<button type="button" className={styles.primary} disabled={ocupado}
                  onClick={()=>proximaEtapa(3)}>Arquivos e valores <ArrowRight size={16}/></button>
                :<button type="button" className={styles.primary} disabled={ocupado}
                  onClick={fechar}><CheckCircle2 size={17}/> Concluir</button>}
          </div>
        </footer>
      </section>
    </div>}
  </section>;
}
