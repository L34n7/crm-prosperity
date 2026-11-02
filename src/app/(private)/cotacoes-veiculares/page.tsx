"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck, Bot, Calculator, CarFront, CheckCircle2, CircleAlert,
  ClipboardList, Copy, Loader2, Save, Settings2, ShieldCheck,
} from "lucide-react";
import Header from "@/components/Header";
import {
  CATEGORIAS_COTACAO,
  opcionaisDisponiveis,
  type CategoriaCotacao,
  type PlanoCotacao,
} from "@/lib/cotacoes-veiculares/catalogo";
import styles from "./page.module.css";

type Faixa = {
  categoria: string; fipe_min_centavos: number; fipe_max_centavos: number;
  premium_centavos: number; completo_centavos: number; revisar: boolean;
};
type Config = { tabela_validada:boolean; ia_habilitada:boolean; referencia:string };
type Calculo = {
  codigo_produto: string; mensalidade_base_centavos:number; total_centavos:number;
  cota_participacao_centavos:number; tabela_validada:boolean; referencia:string;
  assistencia_km_total:number; assistencias_ano:number; terceiros_limite_centavos:number;
  participacao_percentual:number; carro_reserva_incluso_dias:number;
  opcionais: Array<{codigo:string;nome:string;centavos:number}>;
};
type Cotacao = {
  id:string; nome_contato:string|null; veiculo:string; categoria:string; plano:PlanoCotacao;
  status:string; origem:string; total_centavos:number; created_at:string; tabela_validada:boolean;
};
type Opcao = { code:string;name:string };
type DetalheFipe = {
  brand:string;model:string;modelYear:number;referenceMonth:string;codeFipe:string;price:string;
};
const moeda=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n/100);
const numero=(n:number)=>new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
const dataHora=(s:string)=>new Date(s).toLocaleString("pt-BR");
const valorDeMoeda=(valor:string)=> {
  const limpo=valor.replace(/[^\d,.-]/g,"").trim();
  if (!limpo) return 0;
  const n=Number(limpo.includes(",")?limpo.replace(/\./g,"").replace(",","."):/^\d{1,3}(\.\d{3})+$/.test(limpo)?limpo.replace(/\./g,""):limpo);
  return Number.isFinite(n)?Math.round(n*100):0;
};
const categorias = Object.entries(CATEGORIAS_COTACAO) as Array<[CategoriaCotacao,string]>;

export default function CotacoesVeicularesPage() {
  const [aba,setAba]=useState<"nova"|"tabela"|"historico">("nova");
  const [categoria,setCategoria]=useState<CategoriaCotacao>("auto_leves");
  const [plano,setPlano]=useState<PlanoCotacao>("premium");
  const [nomeContato,setNomeContato]=useState("");
  const [veiculo,setVeiculo]=useState("");
  const [anoModelo,setAnoModelo]=useState("");
  const [valorFipe,setValorFipe]=useState("");
  const [referenciaFipe,setReferenciaFipe]=useState("");
  const [opcionais,setOpcionais]=useState<string[]>([]);
  const [config,setConfig]=useState<Config>({tabela_validada:false,ia_habilitada:false,referencia:"Tabela Save Car jan/2024 — pendente de confirmação"});
  const [faixas,setFaixas]=useState<Faixa[]>([]);
  const [cotacoes,setCotacoes]=useState<Cotacao[]>([]);
  const [podeGerenciar,setPodeGerenciar]=useState(false);
  const [podeConfigurar,setPodeConfigurar]=useState(false);
  const [calculo,setCalculo]=useState<Calculo|null>(null);
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

  const tipoFipe = categoria==="motocicleta"?"motorcycles":categoria.startsWith("caminhao_")?"trucks":"cars";
  const atualizar = useCallback(async()=>{
    setCarregando(true);setErro("");
    try {
      const resposta=await fetch("/api/cotacoes-veiculares?categoria="+categoria,{cache:"no-store"});
      const json=await resposta.json();
      if (!resposta.ok || !json.ok) throw new Error(json.error||"Erro ao carregar cotações.");
      setConfig(json.config);setFaixas(json.faixas||[]);
      setCotacoes(json.cotacoes||[]);setPodeGerenciar(Boolean(json.pode_gerenciar));
      setPodeConfigurar(Boolean(json.pode_configurar));
    } catch(e) {setErro(e instanceof Error?e.message:"Falha ao carregar.");}
    finally {setCarregando(false);}
  },[categoria]);
  useEffect(()=>{void atualizar();},[atualizar]);
  useEffect(()=>{setCalculo(null);setCotacaoSalva(null);},[categoria,plano,valorFipe,opcionais]);
  useEffect(()=>{setOpcionais([]);},[categoria,plano]);
  useEffect(()=>{setMarcas([]);setModelos([]);setAnos([]);setMarca("");setModelo("");setAno("");},[tipoFipe]);

  async function apiFipe(etapa:string, params:Record<string,string>={}) {
    const busca=new URLSearchParams({tipo:tipoFipe,etapa,...params});
    const resposta=await fetch("/api/cotacoes-veiculares/fipe?"+busca.toString(),{cache:"no-store"});
    const json=await resposta.json();
    if (!resposta.ok || !json.ok) throw new Error(json.error||"Falha ao consultar FIPE.");
    return json;
  }
  async function consultarFipe(etapa:"marcas"|"modelos"|"anos"|"preco",params:Record<string,string>={}) {
    setBuscandoFipe(true);setErro("");
    try {
      const json=await apiFipe(etapa,params);
      if (etapa==="marcas") setMarcas(json.itens||[]);
      else if (etapa==="modelos") setModelos(json.itens||[]);
      else if (etapa==="anos") setAnos(json.itens||[]);
      else {
        const detalhe=json.veiculo as DetalheFipe;
        setVeiculo(detalhe.brand+" "+detalhe.model);
        setAnoModelo(String(detalhe.modelYear));
        setValorFipe(numero(Number(json.valor_fipe_centavos)));
        setReferenciaFipe(detalhe.referenceMonth+" | "+detalhe.codeFipe);
        setSucesso("Valor FIPE consultado: "+detalhe.price+". Confirme a categoria comercial do veículo.");
      }
    }catch(e){setErro(e instanceof Error?e.message:"Erro ao consultar FIPE.");}
    finally{setBuscandoFipe(false);}
  }
  async function enviar(acao:"simular"|"salvar"|"configurar"|"preco", dados:Record<string,unknown>) {
    setOcupado(true);setErro("");setSucesso("");
    try {
      const resposta=await fetch("/api/cotacoes-veiculares",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({acao,...dados}),
      });
      const json=await resposta.json();
      if(!resposta.ok||!json.ok) throw new Error(json.error||"Erro ao salvar.");
      if (acao==="simular") {setCalculo(json.calculo);setCotacaoSalva(null);}
      if (acao==="salvar") {
        setCalculo(json.calculo);setCotacaoSalva(json.cotacao.id);
        setSucesso(json.cotacao.status==="rascunho"?"Cotação salva como rascunho. Aguarde validação da tabela.":"Cotação gerada e registrada no histórico.");
        await atualizar();
      }
      if (acao==="preco") {setSucesso("Preço ajustado. A tabela precisa ser validada novamente.");setEditando(null);await atualizar();}
      if (acao==="configurar") {setSucesso("Configurações atualizadas.");await atualizar();}
    } catch(e){setErro(e instanceof Error?e.message:"Erro ao processar solicitação.");}
    finally{setOcupado(false);}
  }
  function dadosCotacao() {
    return {
      categoria,plano,veiculo,nome_contato:nomeContato,ano_modelo:anoModelo,
      valor_fipe_centavos:valorDeMoeda(valorFipe),referencia_fipe:referenciaFipe,opcionais,
    };
  }
  async function copiarResumo() {
    if (!calculo) return;
    const resumo = [
      "COTAÇÃO DE PROTEÇÃO VEICULAR",
      "Veículo: " + (veiculo || "Não informado"),
      anoModelo ? "Ano: " + anoModelo : "",
      "Categoria: " + CATEGORIAS_COTACAO[categoria],
      "Plano: " + (plano === "premium" ? "Premium" : "Completo"),
      valorFipe ? "Valor FIPE de referência: R$ " + valorFipe : "",
      "Mensalidade: " + moeda(calculo.total_centavos),
      "Assistência 24h: " + calculo.assistencia_km_total + " km totais",
      "Cobertura de terceiros: " + (calculo.terceiros_limite_centavos ? moeda(calculo.terceiros_limite_centavos) : "Não disponível"),
      ...calculo.opcionais.map((extra) => "Opcional: " + extra.nome + " (" + moeda(extra.centavos) + "/mês)"),
      "Cota de participação: " + moeda(calculo.cota_participacao_centavos),
      "Tabela: " + calculo.referencia,
      "Cotação informativa, sujeita às condições da associação; não confirma contratação.",
      !calculo.tabela_validada ? "PRÉ-COTAÇÃO — AGUARDANDO VALIDAÇÃO COMERCIAL" : "",
    ].filter(Boolean).join("\\n");
    try { await navigator.clipboard.writeText(resumo); setSucesso("Resumo da cotação copiado."); }
    catch { setErro("Não foi possível copiar o resumo neste navegador."); }
  }
  const extras=opcionaisDisponiveis(categoria,plano);
  const alertaTabela=!config.tabela_validada;

  return (
    <>
      <Header title="Cotação" subtitle="Simule, configure e acompanhe propostas de proteção veicular." />
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroIcon}><CarFront size={27}/></div>
          <div className={styles.heroText}>
            <span className={styles.eyebrow}>Seguro Veicular</span>
            <h1>Cotação de proteção veicular</h1>
            <p>Valores calculados pelas faixas FIPE cadastradas, com planos e opcionais específicos por categoria.</p>
          </div>
          <div className={styles.heroStatus}>{config.tabela_validada?<><BadgeCheck size={16}/> Tabela validada</>:<><CircleAlert size={16}/> Validação pendente</>}</div>
        </section>
        {alertaTabela&&<div className={styles.warning}><CircleAlert size={20}/><span>Os valores de referência são de janeiro de 2024 e indicavam validade de seis meses. Até a conferência comercial, as cotações ficam em rascunho e a IA permanece bloqueada.</span></div>}
        {erro&&<div className={styles.error} role="alert">{erro}</div>}
        {sucesso&&<div className={styles.success} role="status">{sucesso}</div>}
        <nav className={styles.tabs} aria-label="Seções de cotação">
          <button className={aba==="nova"?styles.active:""} onClick={()=>setAba("nova")}><Calculator size={17}/> Nova cotação</button>
          <button className={aba==="tabela"?styles.active:""} onClick={()=>setAba("tabela")}><Settings2 size={17}/> Tabela e configurações</button>
          <button className={aba==="historico"?styles.active:""} onClick={()=>setAba("historico")}><ClipboardList size={17}/> Histórico</button>
        </nav>
        {carregando&&<p className={styles.loading}><Loader2 size={17}/> Carregando informações...</p>}
        {!carregando&&aba==="nova"&&<div className={styles.layout}>
          <section className={styles.panel}>
            <div className={styles.sectionHeading}><h2>Dados do veículo</h2><p>Selecione a categoria comercial e informe os dados para consultar a FIPE.</p></div>
            <div className={styles.fields}>
              <label>Categoria de proteção<select value={categoria} onChange={e=>{setCategoria(e.target.value as CategoriaCotacao);setEditando(null);setValorFipe("");setVeiculo("");setReferenciaFipe("");setAnoModelo("");}}>{categorias.map(([codigo,nome])=><option key={codigo} value={codigo}>{nome}</option>)}</select></label>
              <label>Plano<select value={plano} onChange={e=>setPlano(e.target.value as PlanoCotacao)}><option value="premium">Premium</option><option value="completo">Completo</option></select></label>
            </div>
            <div className={styles.fipePanel}>
              <div className={styles.fipeHeader}><strong>Buscar valor na Tabela FIPE</strong><button type="button" disabled={buscandoFipe} onClick={()=>void consultarFipe("marcas")}>{buscandoFipe?<Loader2 size={15}/>:<CarFront size={15}/>} Consultar marcas</button></div>
              <div className={styles.fieldsThree}>
                <label>Marca<select value={marca} onChange={e=>{setMarca(e.target.value);setModelo("");setAno("");setModelos([]);setAnos([]);void consultarFipe("modelos",{marca:e.target.value});}} disabled={!marcas.length}><option value="">Selecione</option>{marcas.map(m=><option key={m.code} value={m.code}>{m.name}</option>)}</select></label>
                <label>Modelo<select value={modelo} onChange={e=>{setModelo(e.target.value);setAno("");setAnos([]);void consultarFipe("anos",{marca,modelo:e.target.value});}} disabled={!modelos.length}><option value="">Selecione</option>{modelos.map(m=><option key={m.code} value={m.code}>{m.name}</option>)}</select></label>
                <label>Ano/combustível<select value={ano} onChange={e=>{setAno(e.target.value);void consultarFipe("preco",{marca,modelo,ano:e.target.value});}} disabled={!anos.length}><option value="">Selecione</option>{anos.map(m=><option key={m.code} value={m.code}>{m.name}</option>)}</select></label>
              </div>
              <small>Consulta informativa a uma API de preços FIPE. Confirme que o modelo e a categoria correspondem ao veículo.</small>
            </div>
            <div className={styles.fields}>
              <label>Veículo (marca e modelo)<input value={veiculo} maxLength={240} placeholder="Ex.: Fiat Argo 1.0" onChange={e=>{setVeiculo(e.target.value);setCalculo(null);}}/></label>
              <label>Ano do modelo<input inputMode="numeric" value={anoModelo} placeholder="Ex.: 2022" onChange={e=>setAnoModelo(e.target.value)}/></label>
              <label>Valor FIPE (R$)<input value={valorFipe} inputMode="decimal" placeholder="Ex.: 50.000,00" onChange={e=>setValorFipe(e.target.value)}/></label>
              <label>Nome do interessado (opcional)<input value={nomeContato} placeholder="Nome do contato" onChange={e=>setNomeContato(e.target.value)}/></label>
            </div>
            <div className={styles.options}><h3>Opcionais disponíveis</h3>{extras.map(extra=><label key={extra.codigo} className={styles.option}><input type="checkbox" checked={opcionais.includes(extra.codigo)} onChange={e=>setOpcionais(current=>e.target.checked?[...current.filter(x=>!((extra.codigo==="carro_reserva_7d"||extra.codigo==="carro_reserva_15d") && x.startsWith("carro_reserva_"))),extra.codigo]:current.filter(x=>x!==extra.codigo))}/><span>{extra.nome}</span><b>+ {moeda(extra.centavos)}/mês</b></label>)}{!extras.length&&<p>Não há opcionais para esta modalidade.</p>}</div>
            <div className={styles.actions}><button className={styles.secondary} disabled={ocupado||!podeGerenciar} onClick={()=>void enviar("simular",dadosCotacao())}><Calculator size={17}/> Simular</button><button className={styles.primary} disabled={ocupado||!podeGerenciar||!calculo} onClick={()=>void enviar("salvar",dadosCotacao())}><Save size={17}/> Salvar cotação</button></div>
          </section>
          <aside className={styles.panel}>
            <div className={styles.sectionHeading}><h2>Resumo da cotação</h2><p>A proposta é recalculada no servidor antes de ser salva.</p></div>
            {!calculo?<div className={styles.empty}><ShieldCheck size={34}/><strong>Nenhuma simulação ainda</strong><p>Preencha o valor FIPE e clique em Simular para consultar a mensalidade.</p></div>:<>
              <div className={styles.total}><span>{plano==="premium"?"Plano Premium":"Plano Completo"}</span><strong>{moeda(calculo.total_centavos)}<small> / mês</small></strong></div>
              <dl className={styles.detail}><div><dt>Mensalidade base</dt><dd>{moeda(calculo.mensalidade_base_centavos)}</dd></div>{calculo.opcionais.map(x=><div key={x.codigo}><dt>{x.nome}</dt><dd>+ {moeda(x.centavos)}</dd></div>)}<div><dt>Cota de participação</dt><dd>{moeda(calculo.cota_participacao_centavos)}</dd></div><div><dt>Cobertura terceiros</dt><dd>{calculo.terceiros_limite_centavos?moeda(calculo.terceiros_limite_centavos):"Não disponível"}</dd></div><div><dt>Assistência 24h</dt><dd>{calculo.assistencia_km_total} km totais · {calculo.assistencias_ano} acionamentos/ano</dd></div>{calculo.carro_reserva_incluso_dias>0&&<div><dt>Carro reserva incluído</dt><dd>{calculo.carro_reserva_incluso_dias} dias</dd></div>}<div><dt>Código produto</dt><dd>{calculo.codigo_produto}</dd></div></dl>
              <p className={styles.footnote}>A cota de participação é aplicada nas condições previstas no regulamento, não como cobrança mensal.</p>
              <span className={calculo.tabela_validada?styles.goodStatus:styles.pendingStatus}>{calculo.tabela_validada?"Tabela validada":"Pré-cotação: requer validação comercial"}</span>
              <div className={styles.actions}><button className={styles.secondary} type="button" onClick={()=>void copiarResumo()}><Copy size={16}/> Copiar resumo</button></div>
              {cotacaoSalva&&<p className={styles.saved}>Registro salvo: {cotacaoSalva.slice(0,8).toUpperCase()}</p>}
            </>}
          </aside>
        </div>}
        {!carregando&&aba==="tabela"&&<div className={styles.stack}>
          <section className={styles.panel}><div className={styles.sectionHeading}><h2>Regras comerciais e agente IA</h2><p>Ative a automação somente depois de confirmar os valores e as condições vigentes com a associação.</p></div>
            <label className={styles.wideLabel}>Identificação / vigência da tabela<input value={config.referencia} disabled={!podeConfigurar} onChange={e=>setConfig({...config,referencia:e.target.value})}/></label>
            <label className={styles.switchRow}><span><strong>Tabela conferida e validada</strong><small>Confirma que a tabela foi revisada pela equipe responsável.</small></span><input type="checkbox" disabled={!podeConfigurar} checked={config.tabela_validada} onChange={e=>setConfig({...config,tabela_validada:e.target.checked,ia_habilitada:e.target.checked&&config.ia_habilitada})}/></label>
            <label className={styles.switchRow}><span><strong><Bot size={16}/> Permitir cotação automática pelo agente IA</strong><small>Também é necessário habilitar a ferramenta no próprio agente.</small></span><input type="checkbox" disabled={!podeConfigurar||!config.tabela_validada} checked={config.ia_habilitada} onChange={e=>setConfig({...config,ia_habilitada:e.target.checked})}/></label>
            <div className={styles.actions}><button disabled={!podeConfigurar||ocupado} className={styles.primary} onClick={()=>void enviar("configurar",config)}><Save size={17}/> Salvar configurações</button></div>
          </section>
          <section className={styles.panel}><div className={styles.sectionHeading}><h2>Faixas por categoria</h2><p>Edite as mensalidades diretamente no sistema. Qualquer alteração suspende a validação anterior.</p></div>
            <label className={styles.wideLabel}>Categoria<select value={categoria} onChange={e=>setCategoria(e.target.value as CategoriaCotacao)}>{categorias.map(([id,nome])=><option key={id} value={id}>{nome}</option>)}</select></label>
            <div className={styles.tableScroll}><table><thead><tr><th>Valor FIPE</th><th>Premium</th><th>Completo</th><th>Conferência</th><th></th></tr></thead><tbody>{faixas.map(f=><tr key={f.fipe_min_centavos}><td>{moeda(f.fipe_min_centavos)} – {moeda(f.fipe_max_centavos)}</td><td>{moeda(f.premium_centavos)}</td><td>{moeda(f.completo_centavos)}</td><td>{f.revisar?<span className={styles.pendingStatus}>Revisar</span>:<span className={styles.goodStatus}>Sem alerta</span>}</td><td><button className={styles.smallButton} disabled={!podeConfigurar} onClick={()=>{setEditando(f);setPrecoPremium(numero(f.premium_centavos));setPrecoCompleto(numero(f.completo_centavos));}}>Editar</button></td></tr>)}</tbody></table></div>
          </section>
          {editando&&<section className={styles.panel}><h2>Editar faixa FIPE: {moeda(editando.fipe_min_centavos)} até {moeda(editando.fipe_max_centavos)}</h2><div className={styles.fields}><label>Premium (R$)<input value={precoPremium} onChange={e=>setPrecoPremium(e.target.value)}/></label><label>Completo (R$)<input value={precoCompleto} onChange={e=>setPrecoCompleto(e.target.value)}/></label></div><div className={styles.actions}><button className={styles.secondary} onClick={()=>setEditando(null)}>Cancelar</button><button className={styles.primary} disabled={ocupado} onClick={()=>void enviar("preco",{categoria,fipe_min_centavos:editando.fipe_min_centavos,premium_centavos:valorDeMoeda(precoPremium),completo_centavos:valorDeMoeda(precoCompleto)})}>Salvar valores</button></div></section>}
        </div>}
        {!carregando&&aba==="historico"&&<section className={styles.panel}><div className={styles.sectionHeading}><h2>Histórico de cotações</h2><p>Simulações salvas com rastreabilidade do plano, origem e situação comercial.</p></div>
          {cotacoes.length===0?<div className={styles.empty}><ClipboardList size={32}/><p>Ainda não há cotações registradas.</p></div>:<div className={styles.tableScroll}><table><thead><tr><th>Data</th><th>Interessado / veículo</th><th>Plano</th><th>Mensalidade</th><th>Origem</th><th>Situação</th></tr></thead><tbody>{cotacoes.map(c=><tr key={c.id}><td>{dataHora(c.created_at)}</td><td><b>{c.nome_contato||"Sem nome"}</b><small>{c.veiculo}</small></td><td>{c.plano==="premium"?"Premium":"Completo"}</td><td>{moeda(c.total_centavos)}</td><td>{c.origem==="agente_ia"?"Agente IA":"Manual"}</td><td><span className={c.status==="emitida"?styles.goodStatus:styles.pendingStatus}>{c.status==="emitida"?"Emitida":"Rascunho"}</span></td></tr>)}</tbody></table></div>}
        </section>}
        <footer className={styles.footer}><CheckCircle2 size={15}/> Cálculos gerados no backend; a IA não define preços nem altera as regras comerciais.</footer>
      </main>
    </>
  );
}
