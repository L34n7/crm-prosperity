"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck, Calculator, CarFront, CheckCircle2, CircleAlert, ClipboardList,
  Copy, Loader2, Save, Settings2, ShieldCheck, X, FileText,
} from "lucide-react";
import Header from "@/components/Header";
import {
  CATEGORIAS_COTACAO,
  type CategoriaCotacao, type PlanoCotacao, type PlanoEmpresa,
} from "@/lib/cotacoes-veiculares/catalogo";
import { ENERGIAS_VEICULO, USOS_VEICULO, motorizacaoDaFipe, type UsoVeiculo, type EnergiaVeiculo, type RegraComercialPlano, type OpcionalComercial } from "@/lib/cotacoes-veiculares/comercial";
import PlanosCotacao, {type ArquivoPlano} from "./PlanosCotacao";
import styles from "./page.module.css";

type Faixa = {
  categoria: string; fipe_min_centavos: number; fipe_max_centavos: number;
  plano:string;valor_centavos:number;codigo_produto:string;
};
type Calculo = {
  plano:string;plano_nome:string;codigo_produto:string; mensalidade_base_centavos:number; total_centavos:number;
  cota_participacao_centavos:number; tabela_validada:boolean; referencia:string;
  assistencia_km_total:number; assistencias_ano:number; terceiros_limite_centavos:number;
  participacao_percentual:number; carro_reserva_incluso_dias:number;
  coberturas:string[]; observacoes:string;
  categoria:CategoriaCotacao;
  opcionais:Array<{codigo:string;nome:string;centavos:number}>;
  opcionais_disponiveis?:Array<{codigo:string;nome:string;centavos:number;grupo_exclusivo:string}>;
};
type Calculos = {planos:Calculo[]};
type Cotacao = {
  id:string; grupo_id:string|null; nome_contato:string|null; veiculo:string;
  categoria:string; plano:PlanoCotacao; plano_nome:string|null;status:string; origem:string;
  total_centavos:number; created_at:string; tabela_validada:boolean;
};
type CotacaoDetalhe=Cotacao&{
 valor_fipe_centavos:number;referencia_fipe:string|null;ano_modelo:number|null;
 mensalidade_base_centavos:number;cota_participacao_centavos:number;codigo_produto:string;
 opcionais_json:Array<{codigo:string;nome:string;centavos:number}>;
 regras_snapshot:Calculo|null;
};
type Status = {pronta:boolean;pendencias:string[];categorias:CategoriaCotacao[];faixas:number;regras:number};
type RegraBanco=RegraComercialPlano;
type OpcionalBanco=OpcionalComercial & {plano:PlanoCotacao;categoria:string};
type Opcao = {code:string;name:string};
type DetalheFipe = {
  brand:string;model:string;modelYear:number;fuel:string;referenceMonth:string;codeFipe:string;price:string;
};

const moeda=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n/100);
const formatoNumerico=(n:number)=>new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
const dataHora=(s:string)=>new Date(s).toLocaleString("pt-BR");
const valorDeMoeda=(valor:string)=>{
  const limpo=valor.replace(/[^\d,.-]/g,"").trim();
  if(!limpo)return 0;
  const texto=limpo.includes(",")?limpo.replace(/\./g,"").replace(",",".")
    :/^\d{1,3}(\.\d{3})+$/.test(limpo)?limpo.replace(/\./g,""):limpo;
  const n=Number(texto);
  return Number.isFinite(n)?Math.round(n*100):0;
};
const categorias=Object.entries(CATEGORIAS_COTACAO) as Array<[CategoriaCotacao,string]>;

export default function CotacoesVeicularesPage() {
  const [aba,setAba]=useState<"nova"|"tabela"|"historico">("nova");
  const [categoria,setCategoria]=useState<CategoriaCotacao>("auto_leves"); // Somente administração de planos
  const [categoriaCotacao,setCategoriaCotacao]=useState<CategoriaCotacao|null>(null);
  const [tipoFipe,setTipoFipe]=useState<"cars"|"motorcycles"|"trucks">("cars");
  const [codigoMarcaFipe,setCodigoMarcaFipe]=useState("");
  const [nomeContato,setNomeContato]=useState("");
  const [uso,setUso]=useState<UsoVeiculo>("particular");
  const [energia,setEnergia]=useState<EnergiaVeiculo|null>(null);
  const [combustivelFipe,setCombustivelFipe]=useState("");
  const requisicaoFipe=useRef(0);
  const [veiculo,setVeiculo]=useState("");
  const [anoModelo,setAnoModelo]=useState("");
  const [valorFipe,setValorFipe]=useState("");
  const [referenciaFipe,setReferenciaFipe]=useState("");
  const [opcionaisPorPlano,setOpcionaisPorPlano]=useState<Record<string,string[]>>({});
  const [faixas,setFaixas]=useState<Faixa[]>([]);
  const [planos,setPlanos]=useState<PlanoEmpresa[]>([]);
  const [arquivos,setArquivos]=useState<ArquivoPlano[]>([]);
  const [status,setStatus]=useState<Status>({pronta:false,pendencias:[],categorias:[],faixas:0,regras:0});
  const [regras,setRegras]=useState<RegraBanco[]>([]);
  const [catalogoExtras,setCatalogoExtras]=useState<OpcionalBanco[]>([]);
  const [cotacoes,setCotacoes]=useState<Cotacao[]>([]);
  const [podeGerenciar,setPodeGerenciar]=useState(false);
  const [podeConfigurar,setPodeConfigurar]=useState(false);
  const [calculos,setCalculos]=useState<Calculos|null>(null);
  const [cotacaoSalva,setCotacaoSalva]=useState<string|null>(null);
  const [idsSalvos,setIdsSalvos]=useState<Record<string,string>>({});
  const [salvandoOpcional,setSalvandoOpcional]=useState<string|null>(null);
  const [historicoAberto,setHistoricoAberto]=useState<string|null>(null);
  const [detalhesHistorico,setDetalhesHistorico]=useState<CotacaoDetalhe[]>([]);
  const [carregandoDetalhes,setCarregandoDetalhes]=useState(false);
  const [erroDetalhes,setErroDetalhes]=useState("");
  const [erro,setErro]=useState("");
  const [sucesso,setSucesso]=useState("");
  const [carregando,setCarregando]=useState(true);
  const [ocupado,setOcupado]=useState(false);
  const [marcas,setMarcas]=useState<Opcao[]>([]);
  const [modelos,setModelos]=useState<Opcao[]>([]);
  const [anos,setAnos]=useState<Opcao[]>([]);
  const [marca,setMarca]=useState("");
  const [modelo,setModelo]=useState("");
  const [ano,setAno]=useState("");
  const [buscandoFipe,setBuscandoFipe]=useState(false);
  const [carregandoMarcas,setCarregandoMarcas]=useState(false);


  const atualizar=useCallback(async()=>{
    setErro("");
    try{
      const res=await fetch("/api/cotacoes-veiculares?categoria="+categoria,{cache:"no-store"});
      const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Erro ao carregar cotações.");
      setFaixas(json.faixas||[]);setStatus(json.status);setPlanos(json.planos||[]);setArquivos(json.arquivos||[]);
      setCotacoes(json.cotacoes||[]);
      setPodeGerenciar(Boolean(json.pode_gerenciar));setPodeConfigurar(Boolean(json.pode_configurar));
    }catch(e){setErro(e instanceof Error?e.message:"Erro ao carregar.");}
    finally{setCarregando(false);}
  },[categoria]);
  const carregarComercial=useCallback(async()=>{
    const resposta=await fetch("/api/cotacoes-veiculares/comercial?categoria="+categoria,{cache:"no-store"});
    const json=await resposta.json();
    if(!resposta.ok||!json.ok)throw new Error(json.error||"Erro ao consultar regras comerciais.");
    setRegras(json.regras||[]);setCatalogoExtras(json.opcionais||[]);
  },[categoria]);
  useEffect(()=>{void carregarComercial().catch(e=>setErro(e instanceof Error?e.message:"Erro ao carregar regras."));},[carregarComercial]);
  async function atualizarTudo(){await Promise.all([atualizar(),carregarComercial()]);}
  useEffect(()=>{void atualizar();},[atualizar]);
  useEffect(()=>{setCalculos(null);setCotacaoSalva(null);setIdsSalvos({});},[categoriaCotacao,valorFipe,uso,energia]);
  useEffect(()=>{setOpcionaisPorPlano({});},[categoriaCotacao]);

  const consultarApiFipe=useCallback(async(etapa:string,params:Record<string,string>={})=>{
    const query=new URLSearchParams({tipo:etapa==="marcas"?"all":tipoFipe,etapa,uso,...params});
    const response=await fetch("/api/cotacoes-veiculares/fipe?"+query,{cache:"no-store"});
    const json=await response.json();
    if(!response.ok||!json.ok)throw new Error(json.error||"Consulta FIPE indisponível.");
    return json;
  },[tipoFipe,uso]);

  // As três bases FIPE são reunidas na lista de marcas, sem pedir categoria comercial.
  useEffect(()=>{
    let ativo=true;
    setCarregandoMarcas(true);
    void fetch("/api/cotacoes-veiculares/fipe?tipo=all&etapa=marcas",{cache:"no-store"})
      .then(async r=>{const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||"Falha na FIPE.");return j;})
      .then(j=>{if(ativo)setMarcas(j.itens||[]);})
      .catch(e=>{if(ativo)setErro(e instanceof Error?e.message:"Falha ao carregar marcas FIPE.");})
      .finally(()=>{if(ativo)setCarregandoMarcas(false);});
    return ()=>{ativo=false;};
  },[]);
  useEffect(()=>{
    if(!historicoAberto)return;
    const aoTeclar=(event:KeyboardEvent)=>{if(event.key==="Escape")setHistoricoAberto(null);};
    document.addEventListener("keydown",aoTeclar);
    return ()=>document.removeEventListener("keydown",aoTeclar);
  },[historicoAberto]);

  async function consultarFipe(etapa:"modelos"|"anos"|"preco",params:Record<string,string>){
    const requisicao=++requisicaoFipe.current;
    setBuscandoFipe(true);setErro("");
    try{
      const json=await consultarApiFipe(etapa,params);
      if(requisicao!==requisicaoFipe.current)return;
      if(etapa==="modelos")setModelos(json.itens||[]);
      else if(etapa==="anos")setAnos(json.itens||[]);
      else{
        const d=json.veiculo as DetalheFipe;
        setCombustivelFipe(d.fuel||"");
        setEnergia(motorizacaoDaFipe(d.fuel,d.model));
        setVeiculo(d.brand+" "+d.model);
        setAnoModelo(String(d.modelYear));
        setValorFipe(formatoNumerico(Number(json.valor_fipe_centavos)));
        setReferenciaFipe(d.referenceMonth+" | "+d.codeFipe);
        setCategoriaCotacao(json.categoria_interna||null);
        if(json.classificacao_pendente)
          setSucesso("Veículo sem classificação comercial definida. Ajuste a categoria diretamente no banco FIPE.");
        else if(!motorizacaoDaFipe(d.fuel,d.model))
          setSucesso("A motorização não pôde ser identificada pela FIPE. Confira os dados antes de cotar.");
        else if(json.especial===true)
          setSucesso("O enquadramento especial é verificado separadamente em cada plano.");
        else setSucesso("");
      }
    }catch(e){if(requisicao===requisicaoFipe.current)
      setErro(e instanceof Error?e.message:"Erro ao consultar FIPE.");}
    finally{if(requisicao===requisicaoFipe.current)setBuscandoFipe(false);}
  }

  async function enviar(acao:"simular"|"salvar",dados:Record<string,unknown>){
    setOcupado(true);setErro("");setSucesso("");
    try{
      const res=await fetch("/api/cotacoes-veiculares",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({acao,...dados,...(acao==="simular"?{opcionais_por_plano:{}}:{})}),
      });
      const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Não foi possível concluir.");
      if(acao==="simular"){setCalculos(json.calculos);setCotacaoSalva(null);setIdsSalvos({});setOpcionaisPorPlano({});}
      if(acao==="salvar"){
        setCalculos(json.calculos);setCotacaoSalva(json.grupo_id);
        setIdsSalvos(Object.fromEntries((json.cotacoes||[]).map((c:{id:string;plano:string})=>[c.plano,c.id])));
        setSucesso(json.cotacoes?.[0]?.status==="rascunho"
          ?"Proposta salva em rascunho até a validação comercial."
          :"Cotação de todos os planos registrada no histórico.");
        await atualizar();
      }
    }catch(e){setErro(e instanceof Error?e.message:"Erro ao processar solicitação.");}
    finally{setOcupado(false);}
  }

  function dadosCotacao(){
    return {
      tipo_fipe:tipoFipe,marca_fipe:codigoMarcaFipe,modelo_fipe:modelo,ano_fipe:ano,
      veiculo,nome_contato:nomeContato,ano_modelo:anoModelo,uso,
      valor_fipe_centavos:valorDeMoeda(valorFipe),referencia_fipe:referenciaFipe,
      opcionais_por_plano:opcionaisPorPlano,
    };
  }

  function calcularComOpcional(c:Calculo,codigo:string,ativar:boolean):Calculo{
    const catalogo=c.opcionais_disponiveis||[];
    const alvo=catalogo.find(e=>e.codigo===codigo);
    if(!alvo)throw new Error("Opcional não encontrado na cotação.");
    const restantes=c.opcionais.filter(e=>e.codigo!==codigo);
    const semIncompativeis=ativar&&alvo.grupo_exclusivo
      ?restantes.filter(e=>catalogo.find(v=>v.codigo===e.codigo)?.grupo_exclusivo!==alvo.grupo_exclusivo)
      :restantes;
    const escolhidos=ativar?[...semIncompativeis,{codigo:alvo.codigo,nome:alvo.nome,centavos:alvo.centavos}]:semIncompativeis;
    return {...c,opcionais:escolhidos,
      total_centavos:c.mensalidade_base_centavos+escolhidos.reduce((total,e)=>total+e.centavos,0)};
  }
  async function atualizarOpcionalSalvo(id:string,codigos:string[]):Promise<CotacaoDetalhe>{
    const res=await fetch("/api/cotacoes-veiculares",{
      method:"PATCH",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({cotacao_id:id,opcionais:codigos}),
    });
    const json=await res.json();
    if(!res.ok||!json.ok)throw new Error(json.error||"Não foi possível atualizar os opcionais.");
    return json.cotacao as CotacaoDetalhe;
  }
  async function alternarOpcionalResultado(plano:string,codigo:string,ativar:boolean){
    const calculo=calculos?.planos.find(c=>c.plano===plano);
    if(!calculo||salvandoOpcional)return;
    try{
      const atualizado=calcularComOpcional(calculo,codigo,ativar);
      if(cotacaoSalva){
        const id=idsSalvos[plano];
        if(!id)throw new Error("Cotação salva não identificada.");
        setSalvandoOpcional("resultado:"+plano);
        const registro=await atualizarOpcionalSalvo(id,atualizado.opcionais.map(o=>o.codigo));
        atualizado.opcionais=registro.opcionais_json;
        atualizado.total_centavos=registro.total_centavos;
        await atualizar();
      }
      setCalculos(prev=>prev?{planos:prev.planos.map(c=>c.plano===plano?atualizado:c)}:prev);
      setOpcionaisPorPlano(prev=>({...prev,[plano]:atualizado.opcionais.map(o=>o.codigo)}));
      setErro("");
    }catch(e){setErro(e instanceof Error?e.message:"Não foi possível alterar o opcional.");}
    finally{setSalvandoOpcional(null);}
  }
  async function abrirDetalhesHistorico(id:string){
    setHistoricoAberto(id);setDetalhesHistorico([]);setCarregandoDetalhes(true);setErroDetalhes("");
    try{
      const res=await fetch("/api/cotacoes-veiculares?grupo_id="+encodeURIComponent(id),{cache:"no-store"});
      const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Não foi possível consultar a proposta.");
      setDetalhesHistorico(json.cotacoes||[]);
    }catch(e){setErroDetalhes(e instanceof Error?e.message:"Falha ao abrir a proposta.");}
    finally{setCarregandoDetalhes(false);}
  }
  async function alternarOpcionalHistorico(item:CotacaoDetalhe,codigo:string,ativar:boolean){
    if(!item.regras_snapshot||salvandoOpcional)return;
    try{
      const novo=calcularComOpcional({...item.regras_snapshot,
        opcionais:item.opcionais_json||[],total_centavos:item.total_centavos},codigo,ativar);
      setSalvandoOpcional("historico:"+item.id);
      const atualizado=await atualizarOpcionalSalvo(item.id,novo.opcionais.map(o=>o.codigo));
      setDetalhesHistorico(prev=>prev.map(v=>v.id===atualizado.id?atualizado:v));
      setCotacoes(prev=>prev.map(v=>v.id===atualizado.id?{...v,total_centavos:atualizado.total_centavos}:v));
      if(idsSalvos[item.plano]===item.id){
        setCalculos(prev=>prev?{planos:prev.planos.map(c=>c.plano===item.plano?{
          ...c,opcionais:atualizado.opcionais_json,total_centavos:atualizado.total_centavos}:c)}:prev);
      }
      setErroDetalhes("");
    }catch(e){setErroDetalhes(e instanceof Error?e.message:"Não foi possível atualizar a proposta.");}
    finally{setSalvandoOpcional(null);}
  }
  async function copiarResumo(){
    if(!calculos)return;
    const linhas=[
      "COTAÇÃO DE PROTEÇÃO VEICULAR",
      veiculo?"Veículo: "+veiculo:"",
      anoModelo?"Ano: "+anoModelo:"",
      "Categoria: "+(categoriaCotacao?CATEGORIAS_COTACAO[categoriaCotacao]:"Não classificada"),
      "Uso: "+USOS_VEICULO[uso],"Motorização: "+(energia?ENERGIAS_VEICULO[energia]:"Não identificada"),
      valorFipe?"Valor FIPE: R$ "+valorFipe:"",
      ...calculos.planos.flatMap(c=>[
        "", "PLANO "+c.plano_nome.toUpperCase(),
        "Mensalidade: "+moeda(c.total_centavos),
        "Cota de participação: "+moeda(c.cota_participacao_centavos),
        "Terceiros: "+(c.terceiros_limite_centavos?moeda(c.terceiros_limite_centavos):"Não disponível"),
        "Assistência: "+c.assistencia_km_total+" km totais",
        ...c.coberturas.map(item=>"Cobertura: "+item),
        ...(c.observacoes?["Condições: "+c.observacoes]:[]),
        ...(c.opcionais_disponiveis||[]).map(item=>
          "Opcional "+(c.opcionais.some(v=>v.codigo===item.codigo)?"incluído":"disponível")+": "+item.nome+" (+ "+moeda(item.centavos)+"/mês)"),
      ]),
      "", "Tabela: "+calculos.planos[0]?.referencia,
      "Proposta informativa, sujeita às condições comerciais da associação.",
      !calculos.planos[0]?.tabela_validada?"RASCUNHO — VALIDAÇÃO COMERCIAL PENDENTE":"",
    ].filter(Boolean).join("\n");
    try{await navigator.clipboard.writeText(linhas);setSucesso("Comparativo copiado.");}
    catch{setErro("Não foi possível copiar no navegador.");}
  }
  const historico=useMemo(()=>{
    const grupos=new Map<string,Cotacao[]>();
    for(const c of cotacoes){
      const chave=c.grupo_id||c.id;
      grupos.set(chave,[...(grupos.get(chave)||[]),c]);
    }
    return [...grupos.entries()].map(([id,itens])=>({id,itens,principal:itens[0]}));
  },[cotacoes]);
  const alertaTabela=!status.pronta;

  return (<>
    <Header title="Cotação" subtitle="Simule, configure e acompanhe propostas de proteção veicular."/>
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon}><CarFront size={27}/></div>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>Seguro Veicular</span>
          <h1>Cotação de proteção veicular</h1>
          <p>Compare automaticamente todos os planos cadastrados pela sua empresa.</p>
        </div>
        <div className={styles.heroStatus+" "+(status.pronta?styles.heroStatusReady:styles.heroStatusPending)}
          role="status" aria-label={status.pronta?"Configuração pronta":"Configuração pendente"}>
          {status.pronta
            ?<><BadgeCheck size={16}/> Configuração pronta</>
            :<><CircleAlert size={16}/> Configuração pendente</>}
        </div>
      </section>
      {alertaTabela&&<div className={styles.warning}><CircleAlert size={20}/>
        <span>Cadastre seus planos, importe os preços e configure as coberturas para liberar a ferramenta no agente IA.</span>
      </div>}
      {erro&&<div className={styles.error} role="alert">{erro}</div>}
      {sucesso&&<div className={styles.success} role="status">{sucesso}</div>}
      <nav className={styles.tabs} aria-label="Seções de cotação">
        <button type="button" aria-pressed={aba==="nova"} className={aba==="nova"?styles.active:""} onClick={()=>setAba("nova")}><Calculator size={17}/><span>Nova cotação</span></button>
        <button type="button" aria-pressed={aba==="tabela"} className={aba==="tabela"?styles.active:""} onClick={()=>setAba("tabela")}><Settings2 size={17}/><span className={styles.tabLabelDesktop}>Planos</span><span className={styles.tabLabelMobile}>Planos</span></button>
        <button type="button" aria-pressed={aba==="historico"} className={aba==="historico"?styles.active:""} onClick={()=>setAba("historico")}><ClipboardList size={17}/><span>Histórico</span></button>
      </nav>

      {carregando&&<p className={styles.loading}><Loader2 size={18}/> Carregando...</p>}

      {!carregando&&aba==="nova"&&<div className={styles.layout}>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}><h2>Dados do veículo</h2>
            <p>Preencha uma vez para comparar todos os planos cadastrados.</p>
          </div>
          <div className={styles.fipePanel}>
            <div className={styles.fipeHeader}><strong>Buscar veículo na Tabela FIPE</strong>
              {carregandoMarcas&&<span className={styles.fipeLoading}><Loader2 size={14}/> Carregando marcas...</span>}
            </div>
            <div className={styles.fieldsThree}>
              <label>Marca<select value={marca} disabled={carregandoMarcas||!marcas.length} onChange={e=>{
                const v=e.target.value;
                setMarca(v);setModelo("");setAno("");setModelos([]);setAnos([]);
                setCategoriaCotacao(null);setVeiculo("");setAnoModelo("");setValorFipe("");setReferenciaFipe("");
                setEnergia(null);setCombustivelFipe("");
                const [tipo,codigo]=v.split("|");
                if(v&&["cars","motorcycles","trucks"].includes(tipo)&&codigo){
                  setTipoFipe(tipo as "cars"|"motorcycles"|"trucks");
                  setCodigoMarcaFipe(codigo);
                  void consultarFipe("modelos",{marca:codigo,tipo});
                }else setCodigoMarcaFipe("");
              }}>
                <option value="">{carregandoMarcas?"Carregando...":"Selecione a marca na FIPE"}</option>
                {marcas.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
              </select></label>
              <label>Modelo<select value={modelo} disabled={buscandoFipe||!modelos.length} onChange={e=>{
                const v=e.target.value;setModelo(v);setAno("");setAnos([]);
                setCategoriaCotacao(null);setVeiculo("");setAnoModelo("");setValorFipe("");setReferenciaFipe("");
                setEnergia(null);setCombustivelFipe("");
                if(v)void consultarFipe("anos",{marca:codigoMarcaFipe,modelo:v});
              }}>
                <option value="">Selecione o modelo</option>
                {modelos.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
              </select></label>
              <label>Ano/combustível<select value={ano} disabled={buscandoFipe||!anos.length} onChange={e=>{
                const v=e.target.value;setAno(v);setCategoriaCotacao(null);
                setVeiculo("");setAnoModelo("");setValorFipe("");setReferenciaFipe("");
                setEnergia(null);setCombustivelFipe("");
                if(v)void consultarFipe("preco",{marca:codigoMarcaFipe,modelo,ano:v});
              }}>
                <option value="">Selecione o ano</option>
                {anos.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
              </select></label>
            </div>
            <small>Marca, modelo e ano são consultados diretamente na FIPE.</small>
          </div>
          {referenciaFipe&&<section className={styles.vehicleSummary} aria-label="Informações do veículo na FIPE">
            <div className={styles.vehicleSummaryHeader}>
              <span className={styles.vehicleSummaryIcon}><CarFront size={23}/></span>
              <div className={styles.vehicleSummaryIdentity}>
                <span className={styles.vehicleSummaryEyebrow}>VEÍCULO IDENTIFICADO</span>
                <strong>{veiculo}</strong>
                <small>{referenciaFipe}</small>
              </div>
              <span className={styles.vehicleSummaryVerified}><CheckCircle2 size={15}/> FIPE consultada</span>
            </div>
            <div className={styles.vehicleSummaryGrid}>
              <div><span>Ano do modelo</span><strong>{anoModelo}</strong></div>
              <div><span>Combustível</span><strong>{combustivelFipe||"Não informado"}</strong></div>
              <div><span>Motorização</span>
                <strong>{energia?ENERGIAS_VEICULO[energia]:"Não identificada"}</strong></div>
              <div className={styles.vehicleSummaryPrice}>
                <span>Valor FIPE</span><strong>R$ {valorFipe}</strong></div>
            </div>
            <div className={styles.vehicleSummaryCategory}>
              <BadgeCheck size={16}/>
              <span>Categoria interna:</span>
              <strong>{categoriaCotacao?CATEGORIAS_COTACAO[categoriaCotacao]:"Classificação pendente"}</strong>
            </div>
            {(!energia||!categoriaCotacao)&&<p className={styles.vehicleSummaryWarning}>
              <CircleAlert size={16}/> {categoriaCotacao
                ?"A FIPE não identificou a motorização. Não é possível cotar sem confirmar esse dado."
                :"O veículo precisa ser classificado em Planos → Classificações FIPE antes da cotação."}
            </p>}
          </section>}
          <div className={styles.fields}>
            <label>Finalidade de uso
              <select value={uso} disabled={buscandoFipe} onChange={e=>{
                const novo=e.target.value as UsoVeiculo;setUso(novo);setCategoriaCotacao(null);
                if(ano&&codigoMarcaFipe&&modelo)
                  void consultarFipe("preco",{marca:codigoMarcaFipe,modelo,ano,uso:novo});
              }}>
                {Object.entries(USOS_VEICULO).map(([codigo,nome])=><option key={codigo} value={codigo}>{nome}</option>)}
              </select>
            </label>
            <label>Interessado (opcional)
              <input value={nomeContato} maxLength={160}
                placeholder="Nome do contato"
                onChange={e=>setNomeContato(e.target.value)}/>
            </label>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={ocupado||buscandoFipe||!podeGerenciar||!categoriaCotacao||!energia||!referenciaFipe}
              onClick={()=>void enviar("simular",dadosCotacao())}><Calculator size={17}/> Gerar cotação</button>
          </div>
        </section>
        <aside className={styles.panel}>
          <div className={styles.sectionHeading}><h2>Comparativo de planos</h2>
            <p>O sistema calcula os preços de todos os seus planos.</p>
          </div>
          {!calculos?<div className={styles.empty}><ShieldCheck size={34}/>
            <strong>Pronto para comparar</strong>
            <p>Preencha os dados para comparar todos os planos disponíveis.</p>
          </div>:<>
            <div className={styles.comparison}>
              {calculos.planos.map(c=>{
                return <div key={c.plano} className={styles.planCard}>
                  <span className={styles.planName}>{c.plano_nome}</span>
                  <strong className={styles.planPrice}>{moeda(c.total_centavos)}<small> / mês</small></strong>
                  <dl className={styles.detail}>
                    <div><dt>Mensalidade base</dt><dd>{moeda(c.mensalidade_base_centavos)}</dd></div>
                    <div><dt>Cota de participação</dt><dd>{moeda(c.cota_participacao_centavos)}</dd></div>
                    <div><dt>Terceiros</dt><dd>{c.terceiros_limite_centavos?moeda(c.terceiros_limite_centavos):"Não disponível"}</dd></div>
                    <div><dt>Assistência 24h</dt><dd>{c.assistencia_km_total} km · {c.assistencias_ano} acionamentos/ano</dd></div>
                    {c.carro_reserva_incluso_dias>0&&<div><dt>Carro reserva</dt><dd>{c.carro_reserva_incluso_dias} dias</dd></div>}
                    <div><dt>Código</dt><dd>{c.codigo_produto}</dd></div>
                    <div><dt>Coberturas</dt><dd>{c.coberturas.join(", ")}</dd></div>
                    {c.observacoes&&<div><dt>Condições</dt><dd>{c.observacoes}</dd></div>}
                  </dl>
                  <div className={styles.quoteExtras}>
                    <div className={styles.quoteExtrasHeader}>
                      <strong>Opcionais deste plano</strong>
                      <small>Ative ou desative para atualizar a mensalidade</small>
                    </div>
                    {(c.opcionais_disponiveis||[]).length?
                      c.opcionais_disponiveis!.map(extra=>{
                        const ligado=c.opcionais.some(item=>item.codigo===extra.codigo);
                        return <div key={extra.codigo} className={styles.quoteExtraRow}>
                          <div><strong>{extra.nome}</strong><span>+ {moeda(extra.centavos)}/mês</span></div>
                          <button type="button" role="switch" aria-checked={ligado}
                            aria-label={(ligado?"Remover ":"Incluir ")+extra.nome+" no plano "+c.plano_nome}
                            className={styles.quoteSwitch+" "+(ligado?styles.quoteSwitchOn:"")}
                            disabled={!podeGerenciar||Boolean(salvandoOpcional)}
                            onClick={()=>void alternarOpcionalResultado(c.plano,extra.codigo,!ligado)}>
                            <span/>
                          </button>
                        </div>;
                      })
                    :<p className={styles.smallNote}>Não há opcionais disponíveis para este plano.</p>}
                    <div className={styles.quoteExtrasTotal}>
                      <span>Total mensal com opcionais</span><strong>{moeda(c.total_centavos)}</strong>
                    </div>
                  </div>
                </div>;
              })}
            </div>
            <p className={styles.footnote}>Valores informativos. A cota de participação não integra a mensalidade.</p>
            <span className={calculos.planos[0]?.tabela_validada?styles.goodStatus:styles.pendingStatus}>
              {calculos.planos[0]?.tabela_validada?"Tabela validada":"Rascunho — validação comercial pendente"}
            </span>
            <div className={styles.actions+" "+styles.comparisonActions}>
              <button type="button" className={styles.secondary} onClick={()=>void copiarResumo()}><Copy size={16}/> Copiar comparativo</button>
              <button type="button" className={styles.primary} disabled={ocupado||!podeGerenciar||!calculos||Boolean(cotacaoSalva)}
                onClick={()=>void enviar("salvar",dadosCotacao())}><Save size={17}/> {cotacaoSalva?"Cotação salva":"Salvar cotação"}</button>
            </div>
            {cotacaoSalva&&<p className={styles.saved}>Cotação salva: {cotacaoSalva.slice(0,8).toUpperCase()}</p>}
          </>}
        </aside>
      </div>}

      {!carregando&&aba==="tabela"&&<>
        <PlanosCotacao planos={planos} arquivos={arquivos} categoria={categoria}
          onCategoria={setCategoria} faixas={faixas} regras={regras} opcionais={catalogoExtras}
          podeConfigurar={podeConfigurar} onUpdated={atualizarTudo}/>
        {status.pendencias.length>0&&<div className={styles.completionStatus}>
          <strong>O que falta para habilitar a cotação automática</strong>
          <ul>{status.pendencias.slice(0,12).map((p,i)=><li key={i}>{p}</li>)}</ul>
        </div>}
      </>}
      {!carregando&&aba==="historico"&&<section className={styles.panel}>
        <div className={styles.sectionHeading}><h2>Histórico de cotações</h2>
          <p>Os planos da mesma proposta são exibidos juntos, com data, origem e situação.</p></div>
        {historico.length===0?<div className={styles.empty}><ClipboardList size={32}/>
          <p>Nenhuma cotação registrada ainda.</p></div>
          :<div className={styles.historyList}>{historico.map(grupo=><button type="button" className={styles.historyCard+" "+styles.historyCardAction} key={grupo.id}
            onClick={()=>void abrirDetalhesHistorico(grupo.id)} aria-label={"Ver detalhes da cotação de "+(grupo.principal.nome_contato||grupo.principal.veiculo)}>
            <div className={styles.historyTop}>
              <div><strong>{grupo.principal.nome_contato||"Interessado não informado"}</strong>
                <small>{grupo.principal.veiculo} · {dataHora(grupo.principal.created_at)}</small></div>
              <span className={grupo.principal.status==="emitida"?styles.goodStatus:styles.pendingStatus}>
                {grupo.principal.status==="emitida"?"Emitida":"Rascunho"}</span>
            </div>
            <div className={styles.historyPlans}>{grupo.itens.map(item=>
              <div key={item.id}><span>{item.plano_nome||planos.find(p=>p.codigo===item.plano)?.nome||item.plano}</span>
              <strong>{moeda(item.total_centavos)}/mês</strong></div>)}</div>
            <small className={styles.historySource}>{grupo.principal.origem==="agente_ia"?"Agente IA":"Cotação manual"}</small>
            <span className={styles.historyView}>Ver detalhes <FileText size={15}/></span>
          </button>)}</div>}
      </section>}

      {historicoAberto&&<div className={styles.quoteModalBackdrop}
        onMouseDown={e=>{if(e.target===e.currentTarget)setHistoricoAberto(null);}}>
        <section role="dialog" aria-modal="true" aria-labelledby="detalhes-cotacao-titulo"
          className={styles.quoteModal}>
          <header className={styles.quoteModalHeader}>
            <div><span className={styles.vehicleSummaryEyebrow}>PROPOSTA DE PROTEÇÃO</span>
              <h2 id="detalhes-cotacao-titulo">Detalhes da cotação</h2></div>
            <button type="button" className={styles.quoteModalClose}
              aria-label="Fechar detalhes" onClick={()=>setHistoricoAberto(null)}><X size={21}/></button>
          </header>
          <div className={styles.quoteModalBody}>
            {erroDetalhes&&<div className={styles.error} role="alert">{erroDetalhes}</div>}
            {carregandoDetalhes?<p className={styles.loading}><Loader2 size={18}/> Carregando detalhes...</p>
              :detalhesHistorico.length>0&&<>
                <div className={styles.quoteModalSummary}>
                  <div><span>Interessado</span><strong>{detalhesHistorico[0].nome_contato||"Não informado"}</strong></div>
                  <div><span>Veículo</span><strong>{detalhesHistorico[0].veiculo}</strong></div>
                  <div><span>Ano</span><strong>{detalhesHistorico[0].ano_modelo||"—"}</strong></div>
                  <div><span>Valor FIPE</span><strong>{moeda(detalhesHistorico[0].valor_fipe_centavos)}</strong></div>
                  <div><span>Referência FIPE</span><strong>{detalhesHistorico[0].referencia_fipe||"Não informada"}</strong></div>
                  <div><span>Data e origem</span><strong>{dataHora(detalhesHistorico[0].created_at)} · {detalhesHistorico[0].origem==="agente_ia"?"Agente IA":"Manual"}</strong></div>
                </div>
                <div className={styles.quoteModalPlans}>
                  {detalhesHistorico.map(item=>{
                    const snap=item.regras_snapshot;
                    const selecionados=item.opcionais_json||[];
                    const disponiveis=snap?.opcionais_disponiveis||[];
                    return <article key={item.id} className={styles.quoteModalPlan}>
                      <div className={styles.quoteModalPlanHead}>
                        <div><span className={styles.vehicleSummaryEyebrow}>{item.status==="emitida"?"EMITIDA":"RASCUNHO"}</span>
                          <h3>{item.plano_nome||item.plano}</h3></div>
                        <strong>{moeda(item.total_centavos)}<small>/mês</small></strong>
                      </div>
                      <dl className={styles.detail}>
                        <div><dt>Mensalidade base</dt><dd>{moeda(item.mensalidade_base_centavos)}</dd></div>
                        <div><dt>Categoria</dt><dd>{CATEGORIAS_COTACAO[item.categoria as CategoriaCotacao]||item.categoria}</dd></div>
                        <div><dt>Código do produto</dt><dd>{item.codigo_produto}</dd></div>
                        <div><dt>Cota de participação</dt><dd>{moeda(item.cota_participacao_centavos)}</dd></div>
                        {snap&&<>
                          <div><dt>Participação</dt><dd>{snap.participacao_percentual}%</dd></div>
                          <div><dt>Terceiros</dt><dd>{snap.terceiros_limite_centavos?moeda(snap.terceiros_limite_centavos):"Não disponível"}</dd></div>
                          <div><dt>Assistência 24h</dt><dd>{snap.assistencia_km_total} km · {snap.assistencias_ano} acionamentos/ano</dd></div>
                          <div><dt>Carro reserva incluso</dt><dd>{snap.carro_reserva_incluso_dias? (snap.carro_reserva_incluso_dias+" dias"):"Não incluso"}</dd></div>
                          <div><dt>Coberturas</dt><dd>{snap.coberturas?.join(", ")||"Não informado"}</dd></div>
                          {snap.observacoes&&<div><dt>Condições</dt><dd>{snap.observacoes}</dd></div>}
                        </>}
                      </dl>
                      <div className={styles.quoteExtras}>
                        <div className={styles.quoteExtrasHeader}><strong>Opcionais do plano</strong>
                          <small>Valores mensais adicionais</small></div>
                        {disponiveis.length?
                          disponiveis.map(extra=>{
                            const ligado=selecionados.some(v=>v.codigo===extra.codigo);
                            const editavel=item.origem==="manual"&&item.status!=="cancelada"&&podeGerenciar;
                            return <div className={styles.quoteExtraRow} key={extra.codigo}>
                              <div><strong>{extra.nome}</strong><span>+ {moeda(extra.centavos)}/mês</span></div>
                              <button type="button" role="switch" aria-checked={ligado}
                                aria-label={(ligado?"Remover ":"Incluir ")+extra.nome+" no plano "+(item.plano_nome||item.plano)}
                                className={styles.quoteSwitch+" "+(ligado?styles.quoteSwitchOn:"")}
                                disabled={!editavel||Boolean(salvandoOpcional)}
                                onClick={()=>void alternarOpcionalHistorico(item,extra.codigo,!ligado)}>
                                <span/>
                              </button>
                            </div>;
                          })
                          :selecionados.length?selecionados.map(extra=>
                            <div className={styles.quoteExtraRow} key={extra.codigo}>
                              <div><strong>{extra.nome}</strong><span>+ {moeda(extra.centavos)}/mês · incluído</span></div>
                            </div>)
                          :<p className={styles.smallNote}>Nenhum opcional incluído nesta cotação.</p>}
                        <div className={styles.quoteExtrasTotal}><span>Total mensal deste plano</span>
                          <strong>{moeda(item.total_centavos)}</strong></div>
                      </div>
                    </article>;
                  })}
                </div>
              </>}
          </div>
          <footer className={styles.quoteModalFooter}><button type="button" className={styles.primary}
            onClick={()=>setHistoricoAberto(null)}>Fechar</button></footer>
        </section>
      </div>}
      <footer className={styles.footer}><CheckCircle2 size={15}/> O cálculo é feito no servidor; a IA não inventa mensalidades nem confirma contratações.</footer>
    </main>

  </>);
}
