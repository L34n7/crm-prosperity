"use client";

import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {
  ArrowRight,CarFront,Check,ClipboardList,Layers3,Loader2,
  Pencil,Plus,Search,ShieldCheck,Tags,Trash2,X,
} from "lucide-react";
import {CATEGORIAS_COTACAO,type CategoriaCotacao} from "@/lib/cotacoes-veiculares/catalogo";
import {
  CATEGORIAS_POR_TIPO_MODELO,type TipoModeloFipe,
} from "@/lib/cotacoes-veiculares/regras-modelos";
import styles from "./page.module.css";

type Regra={
  id:string;tipo_fipe:TipoModeloFipe;marca:string;modelo:string;
  categoria:CategoriaCotacao;created_at:string;updated_at:string;
};
type Edicao={
  id:string|null;tipo_fipe:TipoModeloFipe;marca:string;
  modelo:string;categoria:CategoriaCotacao;
};
const novaEdicao=():Edicao=>({
  id:null,tipo_fipe:"cars",marca:"",modelo:"",categoria:"van_utilitario",
});
const nomesTipos:Record<TipoModeloFipe,string>={
  cars:"Automóvel",motorcycles:"Motocicleta",trucks:"Caminhão",
};
const endpoint="/api/cotacoes-veiculares/classificar-modelos";

export default function ClassificarModelos({podeConfigurar}:{
  podeConfigurar:boolean;
}){
  const [aberto,setAberto]=useState(false);
  const [registros,setRegistros]=useState<Regra[]>([]);
  const [carregando,setCarregando]=useState(true);
  const [salvando,setSalvando]=useState(false);
  const [edicao,setEdicao]=useState<Edicao|null>(null);
  const [excluir,setExcluir]=useState<Regra|null>(null);
  const [busca,setBusca]=useState("");
  const [erro,setErro]=useState("");
  const [sucesso,setSucesso]=useState("");

  const carregar=useCallback(async()=>{
    setCarregando(true);setErro("");
    try{
      const resposta=await fetch(endpoint,{cache:"no-store"});
      const dados=await resposta.json();
      if(!resposta.ok||!dados.ok)throw new Error(dados.error||"Falha ao carregar modelos.");
      setRegistros(Array.isArray(dados.regras)?dados.regras:[]);
    }catch(e){setErro(e instanceof Error?e.message:"Não foi possível carregar as classificações.");}
    finally{setCarregando(false);}
  },[]);
  useEffect(()=>{void carregar();},[carregar]);

  const filtrados=useMemo(()=>{
    const termo=busca.trim().toLocaleLowerCase("pt-BR");
    if(!termo)return registros;
    return registros.filter(regra=>
      [regra.marca,regra.modelo,CATEGORIAS_COTACAO[regra.categoria],
       nomesTipos[regra.tipo_fipe]].some(v=>v.toLocaleLowerCase("pt-BR").includes(termo)));
  },[registros,busca]);

  function abrirModal(){
    setAberto(true);setEdicao(null);setExcluir(null);setBusca("");setSucesso("");setErro("");
    void carregar();
  }
  function fecharModal(){
    if(salvando)return;
    setAberto(false);setEdicao(null);setExcluir(null);setErro("");setSucesso("");
  }
  function incluir(){
    setEdicao(novaEdicao());setExcluir(null);setErro("");setSucesso("");
  }
  function editar(regra:Regra){
    setEdicao({...regra});setExcluir(null);setErro("");setSucesso("");
  }
  async function salvar(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!edicao||salvando||!podeConfigurar)return;
    if(edicao.marca.trim().length<2||edicao.modelo.trim().length<2){
      setErro("Informe uma marca e um modelo válidos.");return;
    }
    setSalvando(true);setErro("");setSucesso("");
    try{
      const resposta=await fetch(endpoint,{
        method:edicao.id?"PATCH":"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(edicao),
      });
      const dados=await resposta.json();
      if(!resposta.ok||!dados.ok)throw new Error(dados.error||"Falha ao salvar classificação.");
      const salva=dados.regra as Regra;
      setRegistros(prev=>edicao.id
        ?prev.map(item=>item.id===salva.id?salva:item)
        :[salva,...prev]);
      setSucesso(edicao.id?"Classificação atualizada.":"Modelo incluído com sucesso.");
      setEdicao(null);
    }catch(e){setErro(e instanceof Error?e.message:"Não foi possível salvar a classificação.");}
    finally{setSalvando(false);}
  }
  async function apagar(){
    if(!excluir||salvando)return;
    setSalvando(true);setErro("");setSucesso("");
    try{
      const resposta=await fetch(endpoint+"?id="+encodeURIComponent(excluir.id),{
        method:"DELETE",
      });
      const dados=await resposta.json();
      if(!resposta.ok||!dados.ok)throw new Error(dados.error||"Falha ao excluir.");
      setRegistros(prev=>prev.filter(item=>item.id!==excluir.id));
      setSucesso("Classificação excluída. As próximas consultas usarão a regra restante ou a classificação padrão.");
      setExcluir(null);
    }catch(e){setErro(e instanceof Error?e.message:"Não foi possível excluir.");}
    finally{setSalvando(false);}
  }

  return <>
    <section className={styles.modelClassCard}>
      <span className={styles.modelClassIcon}><Tags size={24}/></span>
      <div className={styles.modelClassDescription}>
        <span className={styles.eyebrow}>Classificação comercial</span>
        <h2>Classificar modelo</h2>
        <p>Defina qual tabela de preços cada família de veículos utilizará, independentemente do ano ou da versão. A regra vale para a cotação manual e para o agente de IA.</p>
        <span className={styles.modelClassCount}>
          {carregando?<Loader2 size={14}/>:<Check size={14}/>}
          {carregando?"Consultando modelos...":
            registros.length===1?"1 modelo classificado":registros.length+" modelos classificados"}
        </span>
      </div>
      <button className={styles.modelClassOpen} type="button"
        onClick={abrirModal}><ClipboardList size={17}/> Gerenciar modelos <ArrowRight size={16}/></button>
    </section>

    {aberto&&<div className={styles.planModalOverlay} onMouseDown={e=>{
      if(e.target===e.currentTarget&&!edicao&&!excluir)fecharModal();
    }}>
      <section role="dialog" aria-modal="true" aria-label="Classificar modelo"
        className={styles.modelClassModal}>
        <header className={styles.planWizardHeader}>
          <div className={styles.planWizardTitle}>
            <span className={styles.modelClassIcon}><Tags size={22}/></span>
            <div><span className={styles.eyebrow}>Configurações · Cotação veicular</span>
              <h2>Classificar modelo</h2></div>
          </div>
          <button type="button" className={styles.planCloseButton}
            aria-label="Fechar" disabled={salvando} onClick={fecharModal}><X size={21}/></button>
        </header>
        <div className={styles.modelClassBody}>
          <div className={styles.modelClassToolbar}>
            <div className={styles.modelClassIntro}>
              <strong>Modelos classificados</strong>
              <p>Organize as tabelas comerciais por marca e família do modelo.</p>
            </div>
            {podeConfigurar&&<button type="button" className={styles.modelClassAdd}
              disabled={salvando} onClick={incluir}><Plus size={17}/> Incluir</button>}
          </div>
          {erro&&<div role="alert" className={styles.error}>{erro}</div>}
          {sucesso&&<div role="status" className={styles.success}><ShieldCheck size={16}/>{sucesso}</div>}

          {edicao&&<form className={styles.modelClassForm} onSubmit={salvar}>
            <div className={styles.modelClassFormHeading}>
              <div><span>{edicao.id?"EDITAR CLASSIFICAÇÃO":"NOVO MODELO"}</span>
                <h3>{edicao.id?"Editar modelo":"Incluir modelo"}</h3></div>
              <button type="button" aria-label="Cancelar edição" disabled={salvando}
                onClick={()=>{setEdicao(null);setErro("");}}><X size={18}/></button>
            </div>
            <div className={styles.modelClassFields}>
              <label>Tipo FIPE
                <select value={edicao.tipo_fipe} disabled={salvando}
                  onChange={e=>{
                    const tipo=e.target.value as TipoModeloFipe;
                    setEdicao(prev=>prev?{...prev,tipo_fipe:tipo,
                      categoria:CATEGORIAS_POR_TIPO_MODELO[tipo][0]}:null);
                  }}>
                  {Object.entries(nomesTipos).map(([v,label])=>
                    <option key={v} value={v}>{label}</option>)}
                </select>
              </label>
              <label>Marca
                <input required maxLength={80} value={edicao.marca} disabled={salvando}
                  placeholder="Ex.: Chevrolet ou Fiat"
                  onChange={e=>setEdicao(prev=>prev?{...prev,marca:e.target.value}:null)}/>
              </label>
              <label>Modelo (família)
                <input required maxLength={100} value={edicao.modelo} disabled={salvando}
                  placeholder="Ex.: Spin ou Fiorino"
                  onChange={e=>setEdicao(prev=>prev?{...prev,modelo:e.target.value}:null)}/>
              </label>
              <label>Tabela comercial
                <select required value={edicao.categoria} disabled={salvando}
                  onChange={e=>setEdicao(prev=>prev?{
                    ...prev,categoria:e.target.value as CategoriaCotacao}:null)}>
                  {CATEGORIAS_POR_TIPO_MODELO[edicao.tipo_fipe].map(cat=>
                    <option key={cat} value={cat}>{CATEGORIAS_COTACAO[cat]}</option>)}
                </select>
              </label>
            </div>
            <p className={styles.modelClassHint}>
              <ShieldCheck size={16}/> Informe a família, sem ano ou motorização.
              Exemplo: &quot;Spin&quot; abrange as versões Spin LT, LTZ e outras encontradas na FIPE.
              A consulta FIPE continua obrigatória.
            </p>
            <div className={styles.modelClassFormActions}>
              <button type="button" className={styles.secondary} disabled={salvando}
                onClick={()=>{setEdicao(null);setErro("");}}>Cancelar</button>
              <button type="submit" className={styles.modelClassAdd} disabled={salvando}>
                {salvando?<Loader2 size={16}/>:<Check size={16}/>}
                {salvando?"Salvando...":edicao.id?"Salvar alterações":"Incluir modelo"}
              </button>
            </div>
          </form>}

          <div className={styles.modelClassListTop}>
            <div className={styles.modelClassSearch}>
              <Search size={17}/>
              <input value={busca} onChange={e=>setBusca(e.target.value)}
                placeholder="Buscar por marca, modelo ou categoria"
                aria-label="Buscar modelos classificados"/>
            </div>
            <span>{filtrados.length} {filtrados.length===1?"registro":"registros"}</span>
          </div>
          <div className={styles.modelClassTableWrap}>
            {carregando?<div className={styles.modelClassEmpty}>
              <Loader2 size={26}/><strong>Carregando classificações...</strong>
            </div>:!filtrados.length?<div className={styles.modelClassEmpty}>
              <Layers3 size={30}/><strong>{busca?"Nenhum modelo encontrado":"Nenhum modelo classificado"}</strong>
              <p>{busca?"Experimente outro termo na pesquisa.":"Use Incluir para cadastrar sua primeira regra de classificação comercial."}</p>
            </div>:<table className={styles.modelClassTable}>
              <thead><tr>
                <th>Marca / Tipo</th>
                <th>Modelo</th>
                <th>Tabela comercial</th>
                <th>Ações</th>
              </tr></thead>
              <tbody>{filtrados.map(regra=><tr key={regra.id}>
                <td><div className={styles.modelClassVehicle}>
                  <span><CarFront size={16}/></span>
                  <div><strong>{regra.marca}</strong><small>{nomesTipos[regra.tipo_fipe]}</small></div>
                </div></td>
                <td><strong className={styles.modelClassModelName}>{regra.modelo}</strong>
                  <small className={styles.modelClassFamily}>Todos os anos e versões</small></td>
                <td><span className={styles.modelClassCategory}>{CATEGORIAS_COTACAO[regra.categoria]}</span></td>
                <td>{podeConfigurar?<div className={styles.modelClassActions}>
                  <button type="button" disabled={salvando} onClick={()=>editar(regra)}
                    title={"Editar "+regra.modelo}><Pencil size={15}/> Editar</button>
                  <button type="button" className={styles.modelClassDanger} disabled={salvando}
                    onClick={()=>{setExcluir(regra);setEdicao(null);setErro("");}}
                    title={"Apagar "+regra.modelo}><Trash2 size={15}/> Apagar</button>
                </div>:<span className={styles.modelClassReadonly}>Somente leitura</span>}</td>
              </tr>)}</tbody>
            </table>}
          </div>
          <p className={styles.modelClassFootnote}>
            Regras independentes por empresa. Uma classificação específica por código FIPE
            permanece prioritária; as regras de modelo substituem a classificação automática
            nas novas consultas.
          </p>
        </div>
        <footer className={styles.modelClassFooter}>
          <span>{registros.length} {registros.length===1?"classificação cadastrada":"classificações cadastradas"}</span>
          <button type="button" className={styles.secondary} disabled={salvando}
            onClick={fecharModal}>Fechar</button>
        </footer>
      </section>
    </div>}
    {aberto&&excluir&&<div className={styles.modelClassConfirmOverlay}>
      <section role="alertdialog" aria-modal="true" aria-label="Confirmar exclusão"
        className={styles.planDeleteDialog}>
        <div className={styles.planDeleteVisual}><Trash2 size={23}/></div>
        <h3>Apagar classificação?</h3>
        <p>Remover a regra de <strong>{excluir.marca} {excluir.modelo}</strong> para
          a tabela <strong>{CATEGORIAS_COTACAO[excluir.categoria]}</strong>?
          As próximas cotações usarão a classificação restante ou padrão.</p>
        {erro&&<div className={styles.error} role="alert">{erro}</div>}
        <div className={styles.planModalFooter}>
          <button type="button" disabled={salvando} className={styles.secondary}
            onClick={()=>{setExcluir(null);setErro("");}}>Cancelar</button>
          <button type="button" disabled={salvando} className={styles.planDeleteConfirm}
            onClick={()=>void apagar()}>{salvando?<Loader2 size={16}/>:<Trash2 size={16}/>} Apagar</button>
        </div>
      </section>
    </div>}
  </>;
}
