"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck, Calculator, CarFront, CheckCircle2, CircleAlert, ClipboardList,
  Copy, Loader2, Save, Settings2, ShieldCheck,
} from "lucide-react";
import Header from "@/components/Header";
import {
  CATEGORIAS_COTACAO,
  type CategoriaCotacao, type PlanoCotacao, type PlanoEmpresa,
} from "@/lib/cotacoes-veiculares/catalogo";
import { ENERGIAS_VEICULO, USOS_VEICULO, motorizacaoDaFipe, type UsoVeiculo, type EnergiaVeiculo, type RegraComercialPlano, type OpcionalComercial } from "@/lib/cotacoes-veiculares/comercial";
import PlanosCotacao, {type ArquivoPlano} from "./PlanosCotacao";
import ClassificacoesFipe from "./ClassificacoesFipe";
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
  opcionais:Array<{codigo:string;nome:string;centavos:number}>;
};
type Calculos = {planos:Calculo[]};
type Cotacao = {
  id:string; grupo_id:string|null; nome_contato:string|null; veiculo:string;
  categoria:string; plano:PlanoCotacao; plano_nome:string|null;status:string; origem:string;
  total_centavos:number; created_at:string; tabela_validada:boolean;
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
  const [extrasCotacao,setExtrasCotacao]=useState<OpcionalBanco[]>([]);
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
  useEffect(()=>{setCalculos(null);setCotacaoSalva(null);},[categoriaCotacao,valorFipe,opcionaisPorPlano,uso,energia]);
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
    if(!categoriaCotacao){setExtrasCotacao([]);return;}
    let ativo=true;
    void fetch("/api/cotacoes-veiculares/comercial?categoria="+categoriaCotacao,{cache:"no-store"})
      .then(async r=>{const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||"Falha nas opções comerciais.");return j;})
      .then(j=>{if(ativo)setExtrasCotacao(j.opcionais||[]);})
      .catch(e=>{if(ativo)setErro(e instanceof Error?e.message:"Falha nas opções comerciais.");});
    return ()=>{ativo=false;};
  },[categoriaCotacao]);

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
          setSucesso("Classificação pendente: configure o veículo em Planos → Classificações FIPE.");
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
        body:JSON.stringify({acao,...dados}),
      });
      const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Não foi possível concluir.");
      if(acao==="simular"){setCalculos(json.calculos);setCotacaoSalva(null);}
      if(acao==="salvar"){
        setCalculos(json.calculos);setCotacaoSalva(json.grupo_id);
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
  function alternarOpcional(plano:string,codigo:string,ativado:boolean){
    setOpcionaisPorPlano(atual=>{
      const selecionados=(atual[plano]||[]).filter(v=>v!==codigo);
      const extra=extrasCotacao.find(v=>v.plano===plano&&v.codigo===codigo);
      const semExclusivos=ativado&&extra?.grupo_exclusivo
        ?selecionados.filter(v=>extrasCotacao.find(e=>e.plano===plano&&e.codigo===v)?.grupo_exclusivo!==extra.grupo_exclusivo)
        :selecionados;
      return {...atual,[plano]:ativado?[...semExclusivos,codigo]:semExclusivos};
    });
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
        ...c.opcionais.map(item=>"Opcional: "+item.nome),
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
        <div className={styles.heroStatus}>{status.pronta
          ?<><BadgeCheck size={16}/> Configuração pronta</>
          :<><CircleAlert size={16}/> Configuração incompleta</>}</div>
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

          <div className={styles.options}>
            <h3>Opcionais por plano</h3>
            <p className={styles.smallNote}>Os opcionais disponíveis são os cadastrados pela sua empresa. Todos os planos serão calculados.</p>
            <div className={styles.optionsGrid}>
              {planos.filter(p=>p.ativo).map(plano=><div key={plano.codigo} className={styles.optionsGroup}>
                <strong>{plano.nome}</strong>
                {extrasCotacao.filter(extra=>extra.plano===plano.codigo && extra.ativo).map(extra=>
                  <label key={extra.codigo} className={styles.option}>
                    <input type="checkbox" checked={(opcionaisPorPlano[plano.codigo]||[]).includes(extra.codigo)}
                      onChange={e=>alternarOpcional(plano.codigo,extra.codigo,e.target.checked)}/>
                    <span>{extra.nome}</span><b>+ {moeda(extra.valor_centavos)}/mês</b>
                  </label>
                )}
                {!extrasCotacao.some(extra=>extra.plano===plano.codigo&&extra.ativo)&&<p>Nenhum opcional cadastrado para este plano.</p>}
              </div>)}
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} disabled={ocupado||buscandoFipe||!podeGerenciar||!categoriaCotacao||!energia||!referenciaFipe}
              onClick={()=>void enviar("simular",dadosCotacao())}><Calculator size={17}/> Simular todos os planos</button>
            <button type="button" className={styles.primary} disabled={ocupado||!podeGerenciar||!calculos}
              onClick={()=>void enviar("salvar",dadosCotacao())}><Save size={17}/> Salvar cotação</button>
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
                    {c.opcionais.map(item=><div key={item.codigo}><dt>{item.nome}</dt><dd>+ {moeda(item.centavos)}</dd></div>)}
                    <div><dt>Cota de participação</dt><dd>{moeda(c.cota_participacao_centavos)}</dd></div>
                    <div><dt>Terceiros</dt><dd>{c.terceiros_limite_centavos?moeda(c.terceiros_limite_centavos):"Não disponível"}</dd></div>
                    <div><dt>Assistência 24h</dt><dd>{c.assistencia_km_total} km · {c.assistencias_ano} acionamentos/ano</dd></div>
                    {c.carro_reserva_incluso_dias>0&&<div><dt>Carro reserva</dt><dd>{c.carro_reserva_incluso_dias} dias</dd></div>}
                    <div><dt>Código</dt><dd>{c.codigo_produto}</dd></div>
                    <div><dt>Coberturas</dt><dd>{c.coberturas.join(", ")}</dd></div>
                    {c.observacoes&&<div><dt>Condições</dt><dd>{c.observacoes}</dd></div>}
                  </dl>
                </div>;
              })}
            </div>
            <p className={styles.footnote}>Valores informativos. A cota de participação não integra a mensalidade.</p>
            <span className={calculos.planos[0]?.tabela_validada?styles.goodStatus:styles.pendingStatus}>
              {calculos.planos[0]?.tabela_validada?"Tabela validada":"Rascunho — validação comercial pendente"}
            </span>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={()=>void copiarResumo()}><Copy size={16}/> Copiar comparativo</button>
            </div>
            {cotacaoSalva&&<p className={styles.saved}>Cotação salva: {cotacaoSalva.slice(0,8).toUpperCase()}</p>}
          </>}
        </aside>
      </div>}

      {!carregando&&aba==="tabela"&&<>
        <PlanosCotacao planos={planos} arquivos={arquivos} categoria={categoria}
          onCategoria={setCategoria} faixas={faixas} regras={regras} opcionais={catalogoExtras}
          podeConfigurar={podeConfigurar} onUpdated={atualizarTudo}/>
        <ClassificacoesFipe podeConfigurar={podeConfigurar}/>
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
          :<div className={styles.historyList}>{historico.map(grupo=><article className={styles.historyCard} key={grupo.id}>
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
          </article>)}</div>}
      </section>}
      <footer className={styles.footer}><CheckCircle2 size={15}/> O cálculo é feito no servidor; a IA não inventa mensalidades nem confirma contratações.</footer>
    </main>

  </>);
}
