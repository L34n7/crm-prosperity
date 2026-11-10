"use client";

import {useEffect,useMemo,useState} from "react";
import {Check,ChevronDown,Loader2,Search} from "lucide-react";
import {
  familiasModelosDoCatalogoFipe,normalizarChaveModelo,
  type OpcaoModeloFipe,type TipoModeloFipe,type FamiliaModeloFipe,
} from "@/lib/cotacoes-veiculares/regras-modelos";
import styles from "./page.module.css";

type Opcao={code:string;name:string};
type CampoAtivo="marca"|"modelo"|null;
const normalizar=normalizarChaveModelo;
function marcaCorrespondente(marcas:Opcao[],nome:string):Opcao|undefined{
  const chave=normalizar(nome);
  if(!chave)return undefined;
  const exata=marcas.find(item=>normalizar(item.name)===chave);
  if(exata)return exata;
  // Registros antigos podem conter "Chevrolet" e a FIPE, "GM - Chevrolet".
  const contidas=marcas.filter(item=>
    (" "+normalizar(item.name)+" ").includes(" "+chave+" "));
  return contidas.length===1?contidas[0]:undefined;
}

export default function BuscaModeloFipe({
  tipo,marca,modelo,disabled,onChange,onValidityChange,
}:{
  tipo:TipoModeloFipe;
  marca:string;
  modelo:string;
  disabled:boolean;
  onChange:(marca:string,modelo:string)=>void;
  onValidityChange:(valid:boolean)=>void;
}){
  const [marcas,setMarcas]=useState<Opcao[]>([]);
  const [modelos,setModelos]=useState<FamiliaModeloFipe[]>([]);
  const [codigoMarca,setCodigoMarca]=useState("");
  const [buscaMarca,setBuscaMarca]=useState(marca);
  const [buscaModelo,setBuscaModelo]=useState(modelo);
  const [carregandoMarcas,setCarregandoMarcas]=useState(true);
  const [carregandoModelos,setCarregandoModelos]=useState(false);
  const [erro,setErro]=useState("");
  const [ativo,setAtivo]=useState<CampoAtivo>(null);

  useEffect(()=>{
    const abort=new AbortController();
    setCarregandoMarcas(true);
    setMarcas([]);setCodigoMarca("");setModelos([]);setErro("");
    onValidityChange(false);
    void (async()=>{
      try{
        const query=new URLSearchParams({etapa:"marcas",tipo});
        const resposta=await fetch("/api/cotacoes-veiculares/fipe?"+query,{
          cache:"no-store",signal:abort.signal,
        });
        const dados=await resposta.json();
        if(!resposta.ok||!dados.ok||!Array.isArray(dados.itens))
          throw new Error(dados.error||"Não foi possível carregar marcas da FIPE.");
        if(abort.signal.aborted)return;
        const oficiais=dados.itens as Opcao[];
        setMarcas(oficiais);
        const anterior=marcaCorrespondente(oficiais,marca);
        if(anterior){
          setBuscaMarca(anterior.name);
          setCodigoMarca(anterior.code);
          if(anterior.name!==marca)onChange(anterior.name,modelo);
        }
      }catch(err){
        if(!abort.signal.aborted)
          setErro(err instanceof Error?err.message:"Falha ao consultar marcas FIPE.");
      }finally{if(!abort.signal.aborted)setCarregandoMarcas(false);}
    })();
    return ()=>abort.abort();
    // Cada alteração de tipo remonta a busca, sem refazer a consulta ao digitar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tipo]);

  useEffect(()=>{
    if(!codigoMarca){setModelos([]);onValidityChange(false);return;}
    const abort=new AbortController();
    setCarregandoModelos(true);setModelos([]);setErro("");
    onValidityChange(false);
    void (async()=>{
      try{
        const query=new URLSearchParams({etapa:"modelos",tipo,marca:codigoMarca});
        const resposta=await fetch("/api/cotacoes-veiculares/fipe?"+query,{
          cache:"no-store",signal:abort.signal,
        });
        const dados=await resposta.json();
        if(!resposta.ok||!dados.ok||!Array.isArray(dados.itens))
          throw new Error(dados.error||"Não foi possível carregar os modelos dessa marca.");
        if(abort.signal.aborted)return;
        const familias=familiasModelosDoCatalogoFipe(dados.itens as OpcaoModeloFipe[]);
        setModelos(familias);
        const anterior=familias.find(item=>normalizar(item.nome)===normalizar(modelo));
        if(anterior){setBuscaModelo(anterior.nome);onValidityChange(true);}
      }catch(err){
        if(!abort.signal.aborted)
          setErro(err instanceof Error?err.message:"Falha ao consultar modelos FIPE.");
      }finally{if(!abort.signal.aborted)setCarregandoModelos(false);}
    })();
    return ()=>abort.abort();
    // A busca depende da marca selecionada, não do texto do campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tipo,codigoMarca]);

  const marcasVisiveis=useMemo(()=>{
    const termo=normalizar(buscaMarca);
    return marcas.filter(item=>!termo||normalizar(item.name).includes(termo)).slice(0,70);
  },[marcas,buscaMarca]);
  const modelosVisiveis=useMemo(()=>{
    const termo=normalizar(buscaModelo);
    return modelos.filter(item=>!termo||normalizar(item.nome).includes(termo)).slice(0,80);
  },[modelos,buscaModelo]);

  function escolherMarca(opcao:Opcao){
    setCodigoMarca(opcao.code);setBuscaMarca(opcao.name);setBuscaModelo("");
    setModelos([]);setAtivo(null);setErro("");
    onChange(opcao.name,"");onValidityChange(false);
  }
  function digitarMarca(texto:string){
    setBuscaMarca(texto);setBuscaModelo("");setCodigoMarca("");
    setModelos([]);setAtivo("marca");setErro("");
    onChange("","");onValidityChange(false);
  }
  function escolherModelo(opcao:FamiliaModeloFipe){
    setBuscaModelo(opcao.nome);setAtivo(null);setErro("");
    onChange(marca,opcao.nome);onValidityChange(true);
  }
  function digitarModelo(texto:string){
    setBuscaModelo(texto);setAtivo("modelo");setErro("");
    onChange(marca,"");onValidityChange(false);
  }

  return <>
    <div className={styles.modelClassComboField}>
      <label htmlFor="classificacaoMarcaFipe">Marca</label>
      <div className={styles.modelClassCombo} data-disabled={disabled||carregandoMarcas}>
        <Search size={17}/>
        <input id="classificacaoMarcaFipe" type="text" autoComplete="off"
          role="combobox" aria-expanded={ativo==="marca"}
          aria-controls="classificacaoMarcasLista" aria-autocomplete="list"
          required value={buscaMarca} maxLength={80}
          disabled={disabled||carregandoMarcas}
          placeholder={carregandoMarcas?"Carregando marcas...":"Pesquisar marca na FIPE"}
          onFocus={()=>setAtivo("marca")}
          onBlur={()=>setAtivo(atual=>atual==="marca"?null:atual)}
          onChange={event=>digitarMarca(event.target.value)}
          onKeyDown={event=>{
            if(event.key==="Escape"){setAtivo(null);return;}
            if(event.key==="Enter"&&ativo==="marca"){
              event.preventDefault();
              if(marcasVisiveis.length)escolherMarca(marcasVisiveis[0]);
            }
          }}/>
        {carregandoMarcas?<Loader2 size={16}/>:codigoMarca?<Check size={16}/>:<ChevronDown size={16}/>}
        {ativo==="marca"&&!carregandoMarcas&&<div id="classificacaoMarcasLista"
          role="listbox" className={styles.modelClassComboOptions}>
          {marcasVisiveis.length?marcasVisiveis.map(item=>
            <button key={item.code} type="button" role="option"
              aria-selected={codigoMarca===item.code}
              onMouseDown={event=>event.preventDefault()}
              onClick={()=>escolherMarca(item)}>{item.name}</button>)
          :<span className={styles.modelClassNoMatch}>Nenhuma marca encontrada na FIPE</span>}
        </div>}
      </div>
    </div>
    <div className={styles.modelClassComboField}>
      <label htmlFor="classificacaoModeloFipe">Modelo (família)</label>
      <div className={styles.modelClassCombo}
        data-disabled={disabled||!codigoMarca||carregandoModelos}>
        <Search size={17}/>
        <input id="classificacaoModeloFipe" type="text" autoComplete="off"
          role="combobox" aria-expanded={ativo==="modelo"}
          aria-controls="classificacaoModelosLista" aria-autocomplete="list"
          required value={buscaModelo} maxLength={100}
          disabled={disabled||!codigoMarca||carregandoModelos}
          placeholder={!codigoMarca?"Selecione a marca primeiro":
            carregandoModelos?"Carregando modelos...":"Pesquisar modelo da marca"}
          onFocus={()=>setAtivo("modelo")}
          onBlur={()=>setAtivo(atual=>atual==="modelo"?null:atual)}
          onChange={event=>digitarModelo(event.target.value)}
          onKeyDown={event=>{
            if(event.key==="Escape"){setAtivo(null);return;}
            if(event.key==="Enter"&&ativo==="modelo"){
              event.preventDefault();
              if(modelosVisiveis.length)escolherModelo(modelosVisiveis[0]);
            }
          }}/>
        {carregandoModelos?<Loader2 size={16}/>:modelo?<Check size={16}/>:<ChevronDown size={16}/>}
        {ativo==="modelo"&&!carregandoModelos&&codigoMarca&&<div
          id="classificacaoModelosLista" role="listbox"
          className={styles.modelClassComboOptions}>
          {modelosVisiveis.length?modelosVisiveis.map(item=>
            <button key={item.nome} type="button" role="option"
              aria-selected={normalizar(item.nome)===normalizar(modelo)}
              onMouseDown={event=>event.preventDefault()}
              onClick={()=>escolherModelo(item)}>
              <span>{item.nome}</span>
              <small>{item.quantidadeVersoes} {item.quantidadeVersoes===1?"versão":"versões"}</small>
            </button>)
          :<span className={styles.modelClassNoMatch}>Nenhum modelo encontrado nessa marca</span>}
        </div>}
      </div>
    </div>
    {erro&&<p className={styles.modelClassSearchError} role="alert">{erro}</p>}
  </>;
}
