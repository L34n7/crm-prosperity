"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { CATEGORIAS_COTACAO, type CategoriaCotacao, type PlanoEmpresa } from "@/lib/cotacoes-veiculares/catalogo";
import { ENERGIAS_VEICULO,USOS_VEICULO,regraVazia,validarRegraComercial,
 type OpcionalComercial,type RegraComercialPlano,type EnergiaVeiculo,type UsoVeiculo,
} from "@/lib/cotacoes-veiculares/comercial";
import styles from "./page.module.css";
type RegraBanco=RegraComercialPlano;
type OpcionalBanco=OpcionalComercial&{plano:string;categoria:string};
export type EditorHandle={
 validate:()=>boolean;
 validateAndSave:(persistedCodigo?:string,skipRefresh?:boolean)=>Promise<boolean>;
};
type Props={
 categoria:CategoriaCotacao;planos:PlanoEmpresa[];
 regras:RegraBanco[];opcionais:OpcionalBanco[];
 podeConfigurar:boolean;onSaved:()=>Promise<void>;
 rascunho?:boolean; nomeRascunho?:string;
};
const reais=(centavos:number)=>Number((Number(centavos||0)/100).toFixed(2));
const centavos=(v:string)=>Math.round(Number(v||0)*100);
const ConfiguracaoComercialEditor=forwardRef<EditorHandle,Props>(function ConfiguracaoComercialEditor({
 categoria,planos,regras,opcionais,podeConfigurar,onSaved,rascunho=false,nomeRascunho,
},ref){
 const [rascunhos,setRascunhos]=useState<Record<string,RegraComercialPlano>>({});
 const [extras,setExtras]=useState<Record<string,OpcionalComercial[]>>({});
 const [novasCoberturas,setNovasCoberturas]=useState<Record<string,string>>({});
 const [camposPreenchidos,setCamposPreenchidos]=useState<Record<string,string[]>>({});
 const [errosCampos,setErrosCampos]=useState<Record<string,string>>({});
 const [tentativa,setTentativa]=useState(0);
 const camposRef=useRef<HTMLElement|null>(null);
 const [copiarPara,setCopiarPara]=useState<Record<string,CategoriaCotacao[]>>({});
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
  setRascunhos(r);setExtras(o);setNovasCoberturas({});setCopiarPara({});
  const preenchidos:Record<string,string[]>={};
  for(const plano of planos.filter(p=>p.ativo)){
    const regra=regras.find(v=>v.plano===plano.codigo);
    const extrasPlano=opcionais.filter(o=>o.plano===plano.codigo);
    preenchidos[plano.codigo]=regra&&!validarRegraComercial(regra,extrasPlano)
      ?["participacao_percentual","participacao_min_centavos","terceiros_limite_centavos",
        "assistencia_km_total","assistencias_ano","carro_reserva_incluso_dias"]:[];
  }
  setCamposPreenchidos(preenchidos);setErrosCampos({});setErro("");setSucesso("");
 },[categoria,planos,regras,opcionais]);
 function alterar(codigo:string,campo:keyof RegraComercialPlano,valor:unknown,preenchido=true){
  setRascunhos(prev=>({...prev,[codigo]:{...prev[codigo],[campo]:valor}}));
  setCamposPreenchidos(prev=>({
    ...prev,[codigo]:preenchido?
      [...new Set([...(prev[codigo]||[]),campo])]:
      (prev[codigo]||[]).filter(v=>v!==campo),
  }));
  setErrosCampos(prev=>{const copy={...prev};delete copy[campo];return copy;});
 }
 function marcar(codigo:string,campo:"usos_permitidos"|"energias_permitidas",valor:string,ativado:boolean){
  const lista=rascunhos[codigo][campo] as string[];
  alterar(codigo,campo,ativado?[...new Set([...lista,valor])]:lista.filter(v=>v!==valor));
 }
 async function atualizarCobertura(codigo:string,nome:string,remover=false){
  const cobertura=nome.trim();
  if(cobertura.length<2||cobertura.length>160){setErro("Informe uma cobertura de 2 a 160 caracteres.");return;}
  const atuais=rascunhos[codigo]?.coberturas||[];
  if(!remover&&atuais.some(v=>v.toLowerCase()===cobertura.toLowerCase())){
    setErro("Essa cobertura já está cadastrada.");return;
  }
  if(!remover&&atuais.length>=30){setErro("Limite de 30 coberturas por plano.");return;}
  setSalvando(codigo);setErro("");setSucesso("");
  try{
   if(!rascunho){
    const res=await fetch("/api/cotacoes-veiculares/comercial",{
     method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({acao:remover?"remover_cobertura":"adicionar_cobertura",
       categoria,plano:codigo,cobertura}),
    });
    const json=await res.json();
    if(!res.ok||!json.ok)throw new Error(json.error||"Falha ao salvar cobertura.");
   }
   setNovasCoberturas(v=>({...v,[codigo]:""}));
   setRascunhos(atual=>{
    const regraAtual=atual[codigo];if(!regraAtual)return atual;
    const lista=remover
      ?regraAtual.coberturas.filter(v=>v.toLowerCase()!==cobertura.toLowerCase())
      :[...regraAtual.coberturas,cobertura];
    return {...atual,[codigo]:{...regraAtual,coberturas:lista}};
   });
   setErrosCampos(prev=>{const copy={...prev};delete copy.coberturas;return copy;});
   setSucesso(remover?"Cobertura removida.":rascunho
     ?"Cobertura adicionada ao cadastro. Será salva ao avançar."
     :"Cobertura salva.");
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
  const nomeCampo=k==="valor_centavos"?"valor":k;
  setErrosCampos(prev=>{
    const copy={...prev};delete copy["extra_"+nomeCampo+"_"+i];return copy;
  });
 }
 const numericos=[
  ["participacao_percentual","Participação (%)"],
  ["participacao_min_centavos","Participação mínima (R$)"],
  ["terceiros_limite_centavos","Cobertura para terceiros (R$)"],
  ["assistencia_km_total","Assistência (km totais)"],
  ["assistencias_ano","Assistências por ano"],
  ["carro_reserva_incluso_dias","Carro reserva incluso (dias)"],
 ] as const;
 function validarCampos(codigo:string):boolean {
  const regra=rascunhos[codigo],items=extras[codigo]||[];
  if(!regra)return false;
  const invalidos:Record<string,string>={};
  for(const [campo,nome] of numericos){
    if(!(camposPreenchidos[codigo]||[]).includes(campo))
      invalidos[campo]="Informe "+nome.toLowerCase()+". Use 0 quando não se aplicar.";
    else if(!Number.isFinite(Number(regra[campo]))||Number(regra[campo])<0)
      invalidos[campo]="Informe um valor válido, igual ou maior que zero.";
  }
  if(!regra.coberturas.length)invalidos.coberturas="Adicione pelo menos uma cobertura ao plano.";
  if(!regra.usos_permitidos.length)invalidos.usos_permitidos="Selecione pelo menos uma finalidade de uso.";
  if(!regra.energias_permitidas.length)invalidos.energias_permitidas="Selecione pelo menos uma motorização.";
  for(let i=0;i<items.length;i++){
    const item=items[i];
    if(!item.nome.trim()||item.nome.trim().length<2)
      invalidos["extra_nome_"+i]="Informe o nome do opcional.";
    if(!/^[a-z0-9_]{2,50}$/.test(item.codigo))
      invalidos["extra_codigo_"+i]="Informe um código válido (letras minúsculas, números e _).";
    if(!Number.isSafeInteger(item.valor_centavos)||item.valor_centavos<0)
      invalidos["extra_valor_"+i]="Informe um valor válido para o opcional.";
  }
  if(!Object.keys(invalidos).length){
    const problema=validarRegraComercial(regra,items);
    if(problema)invalidos.geral=problema;
  }
  setErrosCampos(invalidos);
  if(Object.keys(invalidos).length){
    setTentativa(n=>n+1);
    setErro("Revise os campos destacados antes de avançar.");
    requestAnimationFrame(()=>{
      const alvo=camposRef.current?.querySelector('[aria-invalid="true"],[data-required-error="true"]');
      alvo?.scrollIntoView({behavior:"smooth",block:"center"});
    });
    return false;
  }
  setErro("");
  return true;
 }
 async function salvar(codigo:string,persistedCodigo=codigo,skipRefresh=false):Promise<boolean>{
  if(!validarCampos(codigo))return false;
  const regra=rascunhos[codigo],items=extras[codigo]||[];
  setSalvando(codigo);setErro("");setSucesso("");
  try{
   const categorias=[categoria,...(copiarPara[codigo]||[]).filter(c=>c!==categoria)];
   const res=await fetch("/api/cotacoes-veiculares/comercial",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({acao:"regra",regra:{...regra,plano:persistedCodigo},opcionais:items,categorias}),
   });
   const json=await res.json();
   if(!res.ok||!json.ok)throw new Error(json.error||"Falha ao salvar as regras.");
   if(!skipRefresh)await onSaved();
   setSucesso(categorias.length===1?"Regras desta categoria salvas.":
    "Regras salvas em "+categorias.length+" categorias.");
   return true;
  }catch(e){setErro(e instanceof Error?e.message:"Não foi possível salvar.");return false;}
  finally{setSalvando(null);}
 }
 useImperativeHandle(ref,()=>({
  validate:()=>{
    const codigo=planos.find(p=>p.ativo)?.codigo;
    return codigo?validarCampos(codigo):false;
  },
  validateAndSave:async(persistedCodigo,skipRefresh=false)=>{
    const codigo=planos.find(p=>p.ativo)?.codigo;
    return codigo?salvar(codigo,persistedCodigo||codigo,skipRefresh):false;
  },
 }));
 function campoErro(campo:string){
  return errosCampos[campo]?
    <span className={styles.requiredError} role="alert">{errosCampos[campo]}</span>:null;
 }
 function campoInvalido(campo:string){return Boolean(errosCampos[campo]);}
 function campoValor(codigo:string,campo:typeof numericos[number][0],valor:number){
   return (camposPreenchidos[codigo]||[]).includes(campo)?valor:"";
 }
 const ativos=planos.filter(p=>p.ativo);
 return <section ref={camposRef} className={styles.panel}>
  <div className={styles.sectionHeading}><h2>Regras e coberturas</h2>
   <p>Configure as condições para a categoria selecionada. Quando forem iguais, aplique-as a outras categorias sem preencher tudo novamente.</p></div>
  {erro&&<p role="alert" className={styles.error}>{erro}</p>}
  {sucesso&&<p role="status" className={styles.success}>{sucesso}</p>}
  {!ativos.length&&<p className={styles.smallNote}>Crie um plano para começar a configurar suas regras.</p>}
  <div className={styles.commercialGrid}>
   {ativos.map(p=>{
    const regra=rascunhos[p.codigo];if(!regra)return null;
    const cod=p.codigo,salvo=regras.some(r=>r.plano===cod &&
      !validarRegraComercial(r,opcionais.filter(o=>o.plano===cod)));
    return <article key={cod} className={styles.commercialCard}>
     <div className={styles.commercialCardHeading}>
      <h3>{rascunho?(nomeRascunho?.trim()||"Novo plano"):p.nome}</h3><span className={salvo?styles.goodStatus:styles.pendingStatus}>
       {salvo?"Regras salvas":"Regras ainda incompletas"}</span>
     </div>
     <div className={styles.fields}>
      <label key={"participacao_percentual-"+(campoInvalido("participacao_percentual")?tentativa:0)} className={campoInvalido("participacao_percentual")?styles.requiredFieldInvalid:undefined}>Participação (%)<input aria-invalid={campoInvalido("participacao_percentual")} type="number" min="0" max="100" step=".001" disabled={!podeConfigurar}
       value={campoValor(cod,"participacao_percentual",regra.participacao_percentual)} onChange={e=>alterar(cod,"participacao_percentual",e.target.value===""?0:Number(e.target.value),e.target.value!=="")}/>{campoErro("participacao_percentual")}</label>
      <label key={"participacao_min_centavos-"+(campoInvalido("participacao_min_centavos")?tentativa:0)} className={campoInvalido("participacao_min_centavos")?styles.requiredFieldInvalid:undefined}>Participação mínima (R$)<input aria-invalid={campoInvalido("participacao_min_centavos")} type="number" min="0" step=".01" disabled={!podeConfigurar}
       value={campoValor(cod,"participacao_min_centavos",reais(regra.participacao_min_centavos))}
       onChange={e=>alterar(cod,"participacao_min_centavos",centavos(e.target.value),e.target.value!=="")}/>{campoErro("participacao_min_centavos")}</label>
      <label key={"terceiros_limite_centavos-"+(campoInvalido("terceiros_limite_centavos")?tentativa:0)} className={campoInvalido("terceiros_limite_centavos")?styles.requiredFieldInvalid:undefined}>Terceiros (R$)<input aria-invalid={campoInvalido("terceiros_limite_centavos")} type="number" min="0" step=".01" disabled={!podeConfigurar}
       value={campoValor(cod,"terceiros_limite_centavos",reais(regra.terceiros_limite_centavos))}
       onChange={e=>alterar(cod,"terceiros_limite_centavos",centavos(e.target.value),e.target.value!=="")}/>{campoErro("terceiros_limite_centavos")}</label>
      <label key={"assistencia_km_total-"+(campoInvalido("assistencia_km_total")?tentativa:0)} className={campoInvalido("assistencia_km_total")?styles.requiredFieldInvalid:undefined}>Assistência (km totais)<input aria-invalid={campoInvalido("assistencia_km_total")} type="number" min="0" step="1" disabled={!podeConfigurar}
       value={campoValor(cod,"assistencia_km_total",regra.assistencia_km_total)}
       onChange={e=>alterar(cod,"assistencia_km_total",e.target.value===""?0:Number(e.target.value),e.target.value!=="")}/>{campoErro("assistencia_km_total")}</label>
      <label key={"assistencias_ano-"+(campoInvalido("assistencias_ano")?tentativa:0)} className={campoInvalido("assistencias_ano")?styles.requiredFieldInvalid:undefined}>Assistências por ano<input aria-invalid={campoInvalido("assistencias_ano")} type="number" min="0" step="1" disabled={!podeConfigurar}
       value={campoValor(cod,"assistencias_ano",regra.assistencias_ano)}
       onChange={e=>alterar(cod,"assistencias_ano",e.target.value===""?0:Number(e.target.value),e.target.value!=="")}/>{campoErro("assistencias_ano")}</label>
      <label key={"carro_reserva_incluso_dias-"+(campoInvalido("carro_reserva_incluso_dias")?tentativa:0)} className={campoInvalido("carro_reserva_incluso_dias")?styles.requiredFieldInvalid:undefined}>Carro reserva incluso (dias)<input aria-invalid={campoInvalido("carro_reserva_incluso_dias")} type="number" min="0" step="1" disabled={!podeConfigurar}
       value={campoValor(cod,"carro_reserva_incluso_dias",regra.carro_reserva_incluso_dias)}
       onChange={e=>alterar(cod,"carro_reserva_incluso_dias",e.target.value===""?0:Number(e.target.value),e.target.value!=="")}/>{campoErro("carro_reserva_incluso_dias")}</label>
     </div>
     <div data-required-error={campoInvalido("coberturas")?"true":undefined} key={"coverage-"+(campoInvalido("coberturas")?tentativa:0)} className={styles.coverageBox+" "+(campoInvalido("coberturas")?styles.requiredFieldInvalid:"")}>
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
      {campoErro("coberturas")}
     </div>
     <div className={styles.commercialChoices}>
      <fieldset data-required-error={campoInvalido("usos_permitidos")?"true":undefined} key={"uses-"+(campoInvalido("usos_permitidos")?tentativa:0)} className={campoInvalido("usos_permitidos")?styles.requiredFieldInvalid:undefined} disabled={!podeConfigurar}><legend>Usos permitidos</legend>
       {Object.entries(USOS_VEICULO).map(([key,nome])=><label key={key}>
        <input type="checkbox" checked={regra.usos_permitidos.includes(key as UsoVeiculo)}
         onChange={e=>marcar(cod,"usos_permitidos",key,e.target.checked)}/>{nome}</label>)}
       {campoErro("usos_permitidos")}
      </fieldset>
      <fieldset data-required-error={campoInvalido("energias_permitidas")?"true":undefined} key={"energy-"+(campoInvalido("energias_permitidas")?tentativa:0)} className={campoInvalido("energias_permitidas")?styles.requiredFieldInvalid:undefined} disabled={!podeConfigurar}><legend>Motorização permitida</legend>
       {Object.entries(ENERGIAS_VEICULO).map(([key,nome])=><label key={key}>
        <input type="checkbox" checked={regra.energias_permitidas.includes(key as EnergiaVeiculo)}
         onChange={e=>marcar(cod,"energias_permitidas",key,e.target.checked)}/>{nome}</label>)}
       {campoErro("energias_permitidas")}
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
       <label key={"extra_nome_"+i+"-"+(campoInvalido("extra_nome_"+i)?tentativa:0)}
       className={campoInvalido("extra_nome_"+i)?styles.requiredFieldInvalid:undefined}>Nome<input aria-invalid={campoInvalido("extra_nome_"+i)} disabled={!podeConfigurar} value={item.nome}
        onChange={e=>mudarExtra(cod,i,"nome",e.target.value)}/>{campoErro("extra_nome_"+i)}</label>
       <label key={"extra_codigo_"+i+"-"+(campoInvalido("extra_codigo_"+i)?tentativa:0)}
       className={campoInvalido("extra_codigo_"+i)?styles.requiredFieldInvalid:undefined}>Código<input aria-invalid={campoInvalido("extra_codigo_"+i)} disabled={!podeConfigurar} value={item.codigo}
        onChange={e=>mudarExtra(cod,i,"codigo",e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}/>{campoErro("extra_codigo_"+i)}</label>
       <label key={"extra_valor_"+i+"-"+(campoInvalido("extra_valor_"+i)?tentativa:0)}
       className={campoInvalido("extra_valor_"+i)?styles.requiredFieldInvalid:undefined}>Valor mensal (R$)<input aria-invalid={campoInvalido("extra_valor_"+i)} type="number" step=".01" min="0" disabled={!podeConfigurar}
        value={reais(item.valor_centavos)}
        onChange={e=>mudarExtra(cod,i,"valor_centavos",centavos(e.target.value))}/>{campoErro("extra_valor_"+i)}</label>
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
     <div className={styles.ruleApplyBox}>
       <strong>Aplicar estas regras também em outras categorias?</strong>
       <p>Opcional. Marque apenas as categorias que possuem as mesmas condições. O salvamento substitui as regras e opcionais já existentes nas categorias marcadas, mas não altera os preços.</p>
       <div className={styles.ruleCategoryGrid}>
         {Object.entries(CATEGORIAS_COTACAO).filter(([c])=>c!==categoria).map(([codigo,nome])=>{
           const marcado=(copiarPara[cod]||[]).includes(codigo as CategoriaCotacao);
           return <label key={codigo} className={styles.ruleCategoryChoice}>
             <input type="checkbox" disabled={!podeConfigurar||salvando!==null} checked={marcado}
               onChange={e=>setCopiarPara(prev=>{
                 const lista=prev[cod]||[];
                 return {...prev,[cod]:e.target.checked?
                   [...lista,codigo as CategoriaCotacao]:
                   lista.filter(c=>c!==codigo)};
               })}/>
             <span>{nome}</span>
           </label>;
         })}
       </div>
       <span className={styles.ruleCategoryInfo}>
         {1+(copiarPara[cod]||[]).length} categoria(s) selecionada(s), incluindo a atual.
       </span>
     </div>
     {campoErro("geral")}
    </article>;
   })}
  </div>
 </section>;
});
export default ConfiguracaoComercialEditor;
