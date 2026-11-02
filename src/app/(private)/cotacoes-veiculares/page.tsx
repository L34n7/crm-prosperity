"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck, Bot, Calculator, CarFront, CheckCircle2, CircleAlert, ClipboardList,
  Copy, Download, FileSpreadsheet, Loader2, Save, Settings2, ShieldCheck, UploadCloud, X,
} from "lucide-react";
import Header from "@/components/Header";
import {
  CATEGORIAS_COTACAO, opcionaisDisponiveis,
  type CategoriaCotacao, type PlanoCotacao,
} from "@/lib/cotacoes-veiculares/catalogo";
import styles from "./page.module.css";

type Faixa = {
  categoria: string; fipe_min_centavos: number; fipe_max_centavos: number;
  premium_centavos: number; completo_centavos: number; revisar: boolean;
};
type Config = {
  tabela_validada:boolean; ia_habilitada:boolean; tabela_importada:boolean;
  modelos_importados:boolean; referencia:string;
};
type Calculo = {
  codigo_produto:string; mensalidade_base_centavos:number; total_centavos:number;
  cota_participacao_centavos:number; tabela_validada:boolean; referencia:string;
  assistencia_km_total:number; assistencias_ano:number; terceiros_limite_centavos:number;
  participacao_percentual:number; carro_reserva_incluso_dias:number;
  opcionais:Array<{codigo:string;nome:string;centavos:number}>;
};
type Calculos = Record<PlanoCotacao,Calculo>;
type Cotacao = {
  id:string; grupo_id:string|null; nome_contato:string|null; veiculo:string;
  categoria:string; plano:PlanoCotacao; status:string; origem:string;
  total_centavos:number; created_at:string; tabela_validada:boolean;
};
type Opcao = {code:string;name:string};
type DetalheFipe = {
  brand:string;model:string;modelYear:number;referenceMonth:string;codeFipe:string;price:string;
};
type ImportacaoPendente = {tipo:"precos"|"especiais";arquivo:File};

const planos:PlanoCotacao[]=["premium","completo"];
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
const rotuloPlano=(plano:PlanoCotacao)=>plano==="premium"?"Premium":"Completo";

export default function CotacoesVeicularesPage() {
  const [aba,setAba]=useState<"nova"|"tabela"|"historico">("nova");
  const [categoria,setCategoria]=useState<CategoriaCotacao>("auto_leves");
  const [nomeContato,setNomeContato]=useState("");
  const [veiculo,setVeiculo]=useState("");
  const [anoModelo,setAnoModelo]=useState("");
  const [valorFipe,setValorFipe]=useState("");
  const [referenciaFipe,setReferenciaFipe]=useState("");
  const [opcionaisPorPlano,setOpcionaisPorPlano]=useState<Record<PlanoCotacao,string[]>>({premium:[],completo:[]});
  const [config,setConfig]=useState<Config>({
    tabela_validada:false,ia_habilitada:false,tabela_importada:false,
    modelos_importados:false,referencia:"Tabela Save Car jan/2024 — pendente de confirmação",
  });
  const [faixas,setFaixas]=useState<Faixa[]>([]);
  const [cotacoes,setCotacoes]=useState<Cotacao[]>([]);
  const [modelosTotal,setModelosTotal]=useState(0);
  const [podeGerenciar,setPodeGerenciar]=useState(false);
  const [podeConfigurar,setPodeConfigurar]=useState(false);
  const [calculos,setCalculos]=useState<Calculos|null>(null);
  const [cotacaoSalva,setCotacaoSalva]=useState<string|null>(null);
  const [erro,setErro]=useState("");
  const [sucesso,setSucesso]=useState("");
  const [carregando,setCarregando]=useState(true);
  const [ocupado,setOcupado]=useState(false);
  const [editando,setEditando]=useState<Faixa|null>(null);
  const [precoPremium,setPrecoPremium]=useState("");
  const [precoCompleto,setPrecoCompleto]=useState("");
  const [marcas,setMarcas]=useState<Opcao[]>([]);
  const [modelos,setModelos]=useState<Opcao[]>([]);
  const [anos,setAnos]=useState<Opcao[]>([]);
  const [marca,setMarca]=useState("");
  const [modelo,setModelo]=useState("");
  const [ano,setAno]=useState("");
  const [buscandoFipe,setBuscandoFipe]=useState(false);
  const [carregandoMarcas,setCarregandoMarcas]=useState(false);
  const [importacao,setImportacao]=useState<ImportacaoPendente|null>(null);
  const inputPrecosRef=useRef<HTMLInputElement>(null);
  const inputEspeciaisRef=useRef<HTMLInputElement>(null);

  const tipoFipe=categoria==="motocicleta"?"motorcycles"
    :categoria.startsWith("caminhao_")?"trucks":"cars";

  const atualizar=useCallback(async()=>{
    setCarregando(true);setErro("");
    try{
      const res=await fetch("/api/cotacoes-veiculares?categoria="+categoria,{cache:"no-store"});
      const json=await res.json();
      if(!res.ok||!json.ok)throw new Error(json.error||"Erro ao carregar cotações.");
      setConfig(json.config);setFaixas(json.faixas||[]);
      setCotacoes(json.cotacoes||[]);setModelosTotal(Number(json.modelos_especiais_total||0));
      setPodeGerenciar(Boolean(json.pode_gerenciar));setPodeConfigurar(Boolean(json.pode_configurar));
    }catch(e){setErro(e instanceof Error?e.message:"Erro ao carregar.");}
    finally{setCarregando(false);}
  },[categoria]);
  useEffect(()=>{void atualizar();},[atualizar]);
  useEffect(()=>{setCalculos(null);setCotacaoSalva(null);},[categoria,valorFipe,opcionaisPorPlano]);
  useEffect(()=>{setOpcionaisPorPlano({premium:[],completo:[]});},[categoria]);

  const consultarApiFipe=useCallback(async(etapa:string,params:Record<string,string>={})=>{
    const query=new URLSearchParams({tipo:tipoFipe,etapa,...params});
    const response=await fetch("/api/cotacoes-veiculares/fipe?"+query,{cache:"no-store"});
    const json=await response.json();
    if(!response.ok||!json.ok)throw new Error(json.error||"Consulta FIPE indisponível.");
    return json;
  },[tipoFipe]);

  useEffect(()=>{
    let ativo=true;
    setMarcas([]);setModelos([]);setAnos([]);setMarca("");setModelo("");setAno("");
    setCarregandoMarcas(true);
    void consultarApiFipe("marcas").then(json=>{
      if(ativo)setMarcas(json.itens||[]);
    }).catch(e=>{
      if(ativo)setErro(e instanceof Error?e.message:"Não foi possível carregar marcas FIPE.");
    }).finally(()=>{if(ativo)setCarregandoMarcas(false);});
    return ()=>{ativo=false;};
  },[consultarApiFipe]);

  async function consultarFipe(etapa:"modelos"|"anos"|"preco",params:Record<string,string>){
    setBuscandoFipe(true);setErro("");
    try{
      const json=await consultarApiFipe(etapa,params);
      if(etapa==="modelos")setModelos(json.itens||[]);
      else if(etapa==="anos")setAnos(json.itens||[]);
      else{
        const d=json.veiculo as DetalheFipe;
        setVeiculo(d.brand+" "+d.model);
        setAnoModelo(String(d.modelYear));
        setValorFipe(formatoNumerico(Number(json.valor_fipe_centavos)));
        setReferenciaFipe(d.referenceMonth+" | "+d.codeFipe);
        if(json.especial===true && categoria!=="especiais"){
          setCategoria("especiais");
          setSucesso("Veículo identificado na lista de especiais. Categoria ajustada automaticamente.");
        }else{
          setSucesso("Consulta FIPE concluída: "+d.price+". Confira a categoria comercial.");
        }
      }
    }catch(e){setErro(e instanceof Error?e.message:"Erro ao consultar FIPE.");}
    finally{setBuscandoFipe(false);}
  }

  async function enviar(acao:"simular"|"salvar"|"configurar"|"preco",dados:Record<string,unknown>){
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
          ?"Premium e Completo salvos como rascunho até a validação comercial."
          :"Cotação com os dois planos registrada no histórico.");
        await atualizar();
      }
      if(acao==="preco"){
        setEditando(null);await atualizar();
        setSucesso("Valores atualizados. A tabela precisa ser validada novamente.");
      }
      if(acao==="configurar"){
        await atualizar();setSucesso("Configurações comerciais salvas.");
      }
    }catch(e){setErro(e instanceof Error?e.message:"Erro ao processar solicitação.");}
    finally{setOcupado(false);}
  }

  function dadosCotacao(){
    return {
      categoria,veiculo,nome_contato:nomeContato,ano_modelo:anoModelo,
      valor_fipe_centavos:valorDeMoeda(valorFipe),referencia_fipe:referenciaFipe,
      opcionais_por_plano:opcionaisPorPlano,
    };
  }
  function alternarOpcional(plano:PlanoCotacao,codigo:string,ativado:boolean){
    setOpcionaisPorPlano(atual=>{
      const selecionados=atual[plano].filter(item=>item!==codigo);
      const semAlternativo=ativado && codigo.startsWith("carro_reserva_")
        ?selecionados.filter(item=>!item.startsWith("carro_reserva_")):selecionados;
      return {...atual,[plano]:ativado?[...semAlternativo,codigo]:semAlternativo};
    });
  }
  async function copiarResumo(){
    if(!calculos)return;
    const linhas=[
      "COTAÇÃO DE PROTEÇÃO VEICULAR",veiculo ? "Veículo: "+veiculo : "",
      anoModelo?"Ano: "+anoModelo:"",
      "Categoria: "+CATEGORIAS_COTACAO[categoria],
      valorFipe?"Valor FIPE: R$ "+valorFipe:"",
      ...planos.flatMap(plano=>{
        const c=calculos[plano];
        return [
          "", "PLANO "+rotuloPlano(plano).toUpperCase(),
          "Mensalidade: "+moeda(c.total_centavos),
          "Cota de participação: "+moeda(c.cota_participacao_centavos),
          "Terceiros: "+(c.terceiros_limite_centavos?moeda(c.terceiros_limite_centavos):"Não disponível"),
          "Assistência 24h: "+c.assistencia_km_total+" km totais",
          ...c.opcionais.map(item=>"Opcional: "+item.nome),
        ];
      }),
      "", "Tabela: "+calculos.premium.referencia,
      "Proposta informativa, sujeita às condições comerciais da associação.",
      !calculos.premium.tabela_validada?"RASCUNHO — VALIDAÇÃO COMERCIAL PENDENTE":"",
    ].filter(Boolean).join("\n");
    try{await navigator.clipboard.writeText(linhas);setSucesso("Resumo com os dois planos copiado.");}
    catch{setErro("Não foi possível copiar o resumo neste navegador.");}
  }

  async function confirmarImportacao(){
    if(!importacao)return;
    setOcupado(true);setErro("");setSucesso("");
    try{
      const form=new FormData();
      form.set("tipo",importacao.tipo);form.set("arquivo",importacao.arquivo);
      if(importacao.tipo==="precos"){
        const referencia=config.referencia.includes("Save Car") || !config.referencia.trim()
          ? "Tabela de preços importada em "+new Date().toLocaleDateString("pt-BR")
          : config.referencia;
        form.set("referencia",referencia);
      }
      const response=await fetch("/api/cotacoes-veiculares/importar",{method:"POST",body:form});
      const json=await response.json();
      if(!response.ok||!json.ok)throw new Error(json.error||"Não foi possível importar o arquivo.");
      setImportacao(null);
      await atualizar();
      setSucesso(String(json.total)+" registros importados com sucesso. "+json.aviso);
    }catch(e){setErro(e instanceof Error?e.message:"Erro ao importar arquivo.");}
    finally{setOcupado(false);}
  }
  const historico=useMemo(()=>{
    const grupos=new Map<string,Cotacao[]>();
    for(const c of cotacoes){
      const chave=c.grupo_id||c.id;
      grupos.set(chave,[...(grupos.get(chave)||[]),c]);
    }
    return [...grupos.entries()].map(([id,itens])=>({id,itens,principal:itens[0]}));
  },[cotacoes]);
  const alertaTabela=!config.tabela_validada;

  return (<>
    <Header title="Cotação" subtitle="Simule, configure e acompanhe propostas de proteção veicular."/>
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon}><CarFront size={27}/></div>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>Seguro Veicular</span>
          <h1>Cotação de proteção veicular</h1>
          <p>Uma simulação com os dois planos, calculados pelas faixas FIPE da empresa.</p>
        </div>
        <div className={styles.heroStatus}>{config.tabela_validada
          ?<><BadgeCheck size={16}/> Tabela validada</>
          :<><CircleAlert size={16}/> Validação pendente</>}</div>
      </section>
      {alertaTabela&&<div className={styles.warning}><CircleAlert size={20}/>
        <span>A tabela atual ainda precisa de validação comercial. As cotações ficam em rascunho e a IA permanece bloqueada.</span>
      </div>}
      {erro&&<div className={styles.error} role="alert">{erro}</div>}
      {sucesso&&<div className={styles.success} role="status">{sucesso}</div>}
      <nav className={styles.tabs} aria-label="Seções de cotação">
        <button type="button" aria-pressed={aba==="nova"} className={aba==="nova"?styles.active:""} onClick={()=>setAba("nova")}><Calculator size={17}/><span>Nova cotação</span></button>
        <button type="button" aria-pressed={aba==="tabela"} className={aba==="tabela"?styles.active:""} onClick={()=>setAba("tabela")}><Settings2 size={17}/><span className={styles.tabLabelDesktop}>Tabela e configurações</span><span className={styles.tabLabelMobile}>Tabela</span></button>
        <button type="button" aria-pressed={aba==="historico"} className={aba==="historico"?styles.active:""} onClick={()=>setAba("historico")}><ClipboardList size={17}/><span>Histórico</span></button>
      </nav>

      {carregando&&<p className={styles.loading}><Loader2 size={18}/> Carregando...</p>}

      {!carregando&&aba==="nova"&&<div className={styles.layout}>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}><h2>Dados do veículo</h2>
            <p>Preencha os dados uma única vez. O sistema apresentará Premium e Completo.</p>
          </div>
          <div className={styles.fields}>
            <label>Categoria de proteção
              <select value={categoria} onChange={e=>{setCategoria(e.target.value as CategoriaCotacao);setValorFipe("");setVeiculo("");setReferenciaFipe("");setAnoModelo("");}}>
                {categorias.map(([codigo,nome])=><option key={codigo} value={codigo}>{nome}</option>)}
              </select>
            </label>
          </div>
          <div className={styles.fipePanel}>
            <div className={styles.fipeHeader}><strong>Buscar veículo na Tabela FIPE</strong>
              {carregandoMarcas&&<span className={styles.fipeLoading}><Loader2 size={14}/> Carregando marcas...</span>}
            </div>
            <div className={styles.fieldsThree}>
              <label>Marca<select value={marca} disabled={carregandoMarcas||!marcas.length} onChange={e=>{
                const v=e.target.value;setMarca(v);setModelo("");setAno("");setModelos([]);setAnos([]);
                if(v)void consultarFipe("modelos",{marca:v});
              }}>
                <option value="">{carregandoMarcas?"Carregando...":"Selecione a marca"}</option>
                {marcas.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
              </select></label>
              <label>Modelo<select value={modelo} disabled={buscandoFipe||!modelos.length} onChange={e=>{
                const v=e.target.value;setModelo(v);setAno("");setAnos([]);
                if(v)void consultarFipe("anos",{marca,modelo:v});
              }}>
                <option value="">Selecione o modelo</option>
                {modelos.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
              </select></label>
              <label>Ano/combustível<select value={ano} disabled={buscandoFipe||!anos.length} onChange={e=>{
                const v=e.target.value;setAno(v);if(v)void consultarFipe("preco",{marca,modelo,ano:v});
              }}>
                <option value="">Selecione o ano</option>
                {anos.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
              </select></label>
            </div>
            <small>As marcas são carregadas automaticamente. A categoria deve corresponder ao regulamento do veículo.</small>
          </div>
          <div className={styles.fields}>
            <label>Veículo (marca e modelo)<input value={veiculo} maxLength={240} placeholder="Ex.: Fiat Argo 1.0" onChange={e=>{setVeiculo(e.target.value);setCalculos(null);}}/></label>
            <label>Ano do modelo<input inputMode="numeric" value={anoModelo} placeholder="Ex.: 2022" onChange={e=>setAnoModelo(e.target.value)}/></label>
            <label>Valor FIPE (R$)<input inputMode="decimal" value={valorFipe} placeholder="Ex.: 50.000,00" onChange={e=>setValorFipe(e.target.value)}/></label>
            <label>Interessado (opcional)<input value={nomeContato} placeholder="Nome do contato" onChange={e=>setNomeContato(e.target.value)}/></label>
          </div>

          <div className={styles.options}>
            <h3>Opcionais por plano</h3>
            <p className={styles.smallNote}>Escolha os opcionais que deseja comparar em cada plano. Ambos são calculados juntos.</p>
            <div className={styles.optionsGrid}>
              {planos.map(plano=><div key={plano} className={styles.optionsGroup}>
                <strong>{rotuloPlano(plano)}</strong>
                {opcionaisDisponiveis(categoria,plano).map(extra=>
                  <label key={extra.codigo} className={styles.option}>
                    <input type="checkbox" checked={opcionaisPorPlano[plano].includes(extra.codigo)}
                      onChange={e=>alternarOpcional(plano,extra.codigo,e.target.checked)}/>
                    <span>{extra.nome}</span><b>+ {moeda(extra.centavos)}/mês</b>
                  </label>
                )}
                {!opcionaisDisponiveis(categoria,plano).length&&<p>Nenhum opcional disponível.</p>}
              </div>)}
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} disabled={ocupado||!podeGerenciar}
              onClick={()=>void enviar("simular",dadosCotacao())}><Calculator size={17}/> Simular os dois planos</button>
            <button type="button" className={styles.primary} disabled={ocupado||!podeGerenciar||!calculos}
              onClick={()=>void enviar("salvar",dadosCotacao())}><Save size={17}/> Salvar cotação</button>
          </div>
        </section>
        <aside className={styles.panel}>
          <div className={styles.sectionHeading}><h2>Comparativo de planos</h2>
            <p>O resultado é calculado no servidor e será salvo como uma única proposta.</p>
          </div>
          {!calculos?<div className={styles.empty}><ShieldCheck size={34}/>
            <strong>Pronto para comparar</strong>
            <p>Preencha o valor FIPE e clique em Simular para ver Premium e Completo juntos.</p>
          </div>:<>
            <div className={styles.comparison}>
              {planos.map(plano=>{
                const c=calculos[plano];
                return <div key={plano} className={styles.planCard}>
                  <span className={styles.planName}>Plano {rotuloPlano(plano)}</span>
                  <strong className={styles.planPrice}>{moeda(c.total_centavos)}<small> / mês</small></strong>
                  <dl className={styles.detail}>
                    <div><dt>Mensalidade base</dt><dd>{moeda(c.mensalidade_base_centavos)}</dd></div>
                    {c.opcionais.map(item=><div key={item.codigo}><dt>{item.nome}</dt><dd>+ {moeda(item.centavos)}</dd></div>)}
                    <div><dt>Cota de participação</dt><dd>{moeda(c.cota_participacao_centavos)}</dd></div>
                    <div><dt>Terceiros</dt><dd>{c.terceiros_limite_centavos?moeda(c.terceiros_limite_centavos):"Não disponível"}</dd></div>
                    <div><dt>Assistência 24h</dt><dd>{c.assistencia_km_total} km · {c.assistencias_ano} acionamentos/ano</dd></div>
                    {c.carro_reserva_incluso_dias>0&&<div><dt>Carro reserva</dt><dd>{c.carro_reserva_incluso_dias} dias</dd></div>}
                    <div><dt>Código</dt><dd>{c.codigo_produto}</dd></div>
                  </dl>
                </div>;
              })}
            </div>
            <p className={styles.footnote}>Valores informativos. A cota de participação não integra a mensalidade.</p>
            <span className={calculos.premium.tabela_validada?styles.goodStatus:styles.pendingStatus}>
              {calculos.premium.tabela_validada?"Tabela validada":"Rascunho — validação comercial pendente"}
            </span>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={()=>void copiarResumo()}><Copy size={16}/> Copiar os dois planos</button>
            </div>
            {cotacaoSalva&&<p className={styles.saved}>Cotação salva: {cotacaoSalva.slice(0,8).toUpperCase()}</p>}
          </>}
        </aside>
      </div>}

      {!carregando&&aba==="tabela"&&<div className={styles.stack}>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}><h2>Configurações comerciais e agente IA</h2>
            <p>Os preços e os veículos especiais são exclusivos da empresa. Valide a tabela antes de liberar a automação.</p>
          </div>
          <label className={styles.wideLabel}>Referência / vigência da tabela
            <input disabled={!podeConfigurar} maxLength={160} value={config.referencia}
              onChange={e=>setConfig({...config,referencia:e.target.value})}/>
          </label>
          <label className={styles.switchRow}><span><strong>Tabela conferida e validada</strong>
            <small>Declaro que preços e condições foram revisados pela equipe responsável.</small></span>
            <input type="checkbox" disabled={!podeConfigurar} checked={config.tabela_validada}
              onChange={e=>setConfig({...config,tabela_validada:e.target.checked,
                ia_habilitada:e.target.checked&&config.ia_habilitada})}/>
          </label>
          <label className={styles.switchRow}><span><strong><Bot size={16}/> Permitir cotação pelo agente IA</strong>
            <small>É necessário também ativar a ferramenta no agente.</small></span>
            <input type="checkbox" disabled={!podeConfigurar||!config.tabela_validada}
              checked={config.ia_habilitada} onChange={e=>setConfig({...config,ia_habilitada:e.target.checked})}/>
          </label>
          <div className={styles.actions}><button type="button" disabled={!podeConfigurar||ocupado}
            className={styles.primary} onClick={()=>void enviar("configurar",config)}>
            <Save size={16}/> Salvar configurações
          </button></div>
        </section>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}><h2>Importação de tabelas</h2>
            <p>Use os modelos em Excel para configurar seu próprio catálogo sem precisar alterar o código.</p>
          </div>
          <div className={styles.importGrid}>
            <div className={styles.importCard}>
              <div className={styles.importIcon}><FileSpreadsheet size={22}/></div>
              <h3>Tabela de preços</h3>
              <p>Importe faixas FIPE, códigos e mensalidades Premium e Completo.</p>
              <div className={styles.importMeta}>{config.tabela_importada?"Tabela própria importada":"Tabela inicial de referência"}</div>
              <input className={styles.hiddenFile} type="file" ref={inputPrecosRef} accept=".xlsx"
                onChange={e=>{const file=e.target.files?.[0];if(file)setImportacao({tipo:"precos",arquivo:file});e.target.value="";}}/>
              <div className={styles.importActions}>
                <button type="button" className={styles.primary} disabled={!podeConfigurar||ocupado}
                  onClick={()=>inputPrecosRef.current?.click()}><UploadCloud size={16}/> Importar tabela de preços</button>
                <a className={styles.modelLink} href="/api/cotacoes-veiculares/importar?tipo=precos"><Download size={15}/> Baixar modelo</a>
              </div>
            </div>
            <div className={styles.importCard}>
              <div className={styles.importIcon}><CarFront size={22}/></div>
              <h3>Veículos especiais</h3>
              <p>Importe os modelos e códigos FIPE considerados especiais pela empresa.</p>
              <div className={styles.importMeta}>{modelosTotal} modelo(s) na lista da empresa</div>
              <input className={styles.hiddenFile} type="file" ref={inputEspeciaisRef} accept=".xlsx"
                onChange={e=>{const file=e.target.files?.[0];if(file)setImportacao({tipo:"especiais",arquivo:file});e.target.value="";}}/>
              <div className={styles.importActions}>
                <button type="button" className={styles.primary} disabled={!podeConfigurar||ocupado}
                  onClick={()=>inputEspeciaisRef.current?.click()}><UploadCloud size={16}/> Importar veículos especiais</button>
                <a className={styles.modelLink} href="/api/cotacoes-veiculares/importar?tipo=especiais"><Download size={15}/> Baixar modelo</a>
              </div>
            </div>
          </div>
          <p className={styles.importNotice}><CircleAlert size={17}/>
            Cada importação substitui somente os dados daquele tipo nesta empresa e suspende a validação e a IA até nova aprovação.
          </p>
          <p className={styles.smallNote}>Os modelos importados configuram preços e classificação especial; opcionais, coberturas e regras de participação ainda seguem as regras comerciais do módulo.</p>
        </section>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}><h2>Faixas FIPE por categoria</h2>
            <p>Consulte e ajuste individualmente os preços. Qualquer edição exige nova validação comercial.</p>
          </div>
          <label className={styles.wideLabel}>Categoria
            <select value={categoria} onChange={e=>{setCategoria(e.target.value as CategoriaCotacao);setEditando(null);}}>
              {categorias.map(([id,nome])=><option key={id} value={id}>{nome}</option>)}
            </select>
          </label>
          <p className={styles.scrollHint}>Deslize a tabela para os lados para ver todas as colunas.</p>
          <div className={styles.tableScroll}><table>
            <thead><tr><th>Faixa FIPE</th><th>Premium</th><th>Completo</th><th>Conferência</th><th></th></tr></thead>
            <tbody>{faixas.map(f=><tr key={f.fipe_min_centavos}>
              <td>{moeda(f.fipe_min_centavos)} – {moeda(f.fipe_max_centavos)}</td>
              <td>{moeda(f.premium_centavos)}</td><td>{moeda(f.completo_centavos)}</td>
              <td><span className={f.revisar?styles.pendingStatus:styles.goodStatus}>{f.revisar?"Revisar":"Sem alerta"}</span></td>
              <td><button type="button" className={styles.smallButton} disabled={!podeConfigurar}
                onClick={()=>{setEditando(f);setPrecoPremium(formatoNumerico(f.premium_centavos));setPrecoCompleto(formatoNumerico(f.completo_centavos));}}>Editar</button></td>
            </tr>)}</tbody>
          </table></div>
          {faixas.length===0&&<p className={styles.smallNote}>Não há faixas cadastradas nesta categoria. Importe a tabela incluindo esta categoria para cotá-la.</p>}
        </section>
        {editando&&<section className={styles.panel}>
          <h2>Editar faixa de {moeda(editando.fipe_min_centavos)} a {moeda(editando.fipe_max_centavos)}</h2>
          <div className={styles.fields}>
            <label>Premium (R$)<input value={precoPremium} onChange={e=>setPrecoPremium(e.target.value)}/></label>
            <label>Completo (R$)<input value={precoCompleto} onChange={e=>setPrecoCompleto(e.target.value)}/></label>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={()=>setEditando(null)}>Cancelar</button>
            <button type="button" className={styles.primary} disabled={ocupado} onClick={()=>void enviar("preco",{
              categoria,fipe_min_centavos:editando.fipe_min_centavos,
              premium_centavos:valorDeMoeda(precoPremium),completo_centavos:valorDeMoeda(precoCompleto),
            })}>Salvar preços</button>
          </div>
        </section>}
      </div>}

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
            <div className={styles.historyPlans}>{planos.map(plano=>{
              const item=grupo.itens.find(i=>i.plano===plano);
              return item?<div key={plano}><span>{rotuloPlano(plano)}</span><strong>{moeda(item.total_centavos)}/mês</strong></div>:null;
            })}</div>
            <small className={styles.historySource}>{grupo.principal.origem==="agente_ia"?"Agente IA":"Cotação manual"}</small>
          </article>)}</div>}
      </section>}
      <footer className={styles.footer}><CheckCircle2 size={15}/> O cálculo é feito no servidor; a IA não inventa mensalidades nem confirma contratações.</footer>
    </main>

    {importacao&&<div className={styles.importOverlay} role="presentation" onClick={()=>!ocupado&&setImportacao(null)}>
      <section className={styles.importModal} role="dialog" aria-modal="true" aria-label="Confirmar importação" onClick={e=>e.stopPropagation()}>
        <div className={styles.modalHeading}>
          <span className={styles.importIcon}><FileSpreadsheet size={21}/></span>
          <button type="button" aria-label="Fechar" disabled={ocupado} onClick={()=>setImportacao(null)}><X size={20}/></button>
        </div>
        <h2>Confirmar importação</h2>
        <p>Arquivo: <strong>{importacao.arquivo.name}</strong></p>
        <p>Os {importacao.tipo==="precos"?"preços e faixas FIPE":"modelos especiais"} atuais desta empresa serão <strong>substituídos</strong>. Outras empresas não serão afetadas.</p>
        <p>A cotação automática será desativada até você validar os novos dados.</p>
        <div className={styles.actions}>
          <button className={styles.secondary} type="button" disabled={ocupado} onClick={()=>setImportacao(null)}>Cancelar</button>
          <button className={styles.primary} type="button" disabled={ocupado} onClick={()=>void confirmarImportacao()}>
            {ocupado?<Loader2 size={16}/>:<UploadCloud size={16}/>} Confirmar importação
          </button>
        </div>
      </section>
    </div>}
  </>);
}
