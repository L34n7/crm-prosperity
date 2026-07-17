"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Cable, ListChecks, MessageSquareText, Plus, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import FeedbackToast from "@/components/FeedbackToast";
import { useHeaderUser } from "@/components/header-user-context";
import type { PublicacaoImovelResumo } from "../imoveis/IntegracoesImobiliarias";
import { getStatusPublicacaoLabel } from "@/lib/imoveis/publicacao";
import ImoveisOperacoesModais from "./ImoveisOperacoesModais";
import styles from "./meus-imoveis.module.css";

type PessoaOpcao = { id: string; nome: string; cpf_cnpj: string | null; email: string | null };
type Imovel = {
  id: string;
  proprietario_pessoa_id: string | null;
  titulo: string;
  codigo: string | null;
  tipo: string;
  finalidade: string;
  status: string;
  valor: number | string | null;
  valor_condominio: number | string | null;
  valor_iptu: number | string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  area_m2: number | string | null;
  descricao: string | null;
  imagem_url?: string | null;
  proprietario?: PessoaOpcao | null;
  publicacoes?: PublicacaoImovelResumo[];
  total_leads_portal?: number;
};

type FormImovel = {
  proprietario_pessoa_id: string; titulo: string; codigo: string; tipo: string;
  finalidade: string; status: string; valor: string; valor_condominio: string;
  valor_iptu: string; cep: string; logradouro: string; numero: string;
  complemento: string; bairro: string; cidade: string; estado: string;
  quartos: string; suites: string; banheiros: string; vagas: string;
  area_m2: string; descricao: string;
};

const FORM_INICIAL: FormImovel = {
  proprietario_pessoa_id: "", titulo: "", codigo: "", tipo: "apartamento", finalidade: "venda",
  status: "disponivel", valor: "", valor_condominio: "", valor_iptu: "", cep: "", logradouro: "",
  numero: "", complemento: "", bairro: "", cidade: "", estado: "", quartos: "", suites: "",
  banheiros: "", vagas: "", area_m2: "", descricao: ""
};

function valorTexto(valor: unknown) { return valor === null || valor === undefined ? "" : String(valor) }
function formFromImovel(i: Imovel): FormImovel {
  return {
    proprietario_pessoa_id: i.proprietario_pessoa_id ?? "", titulo: i.titulo ?? "", codigo: i.codigo ?? "",
    tipo: i.tipo ?? "apartamento", finalidade: i.finalidade ?? "venda", status: i.status ?? "disponivel",
    valor: valorTexto(i.valor), valor_condominio: valorTexto(i.valor_condominio), valor_iptu: valorTexto(i.valor_iptu),
    cep: i.cep ?? "", logradouro: i.logradouro ?? "", numero: i.numero ?? "", complemento: i.complemento ?? "",
    bairro: i.bairro ?? "", cidade: i.cidade ?? "", estado: i.estado ?? "", quartos: valorTexto(i.quartos),
    suites: valorTexto(i.suites), banheiros: valorTexto(i.banheiros), vagas: valorTexto(i.vagas),
    area_m2: valorTexto(i.area_m2), descricao: i.descricao ?? ""
  }
}
function formatarMoeda(v: number | string | null) { const n = Number(v ?? 0); return !Number.isFinite(n) || n <= 0 ? "Valor não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n) }
function labelFinalidade(v: string) { return ({ venda: "Venda", locacao: "Locação", venda_locacao: "Venda ou locação" } as Record<string, string>)[v] ?? v }
function labelStatus(v: string) { return ({ disponivel: "Disponível", reservado: "Reservado", vendido: "Vendido", alugado: "Alugado", inativo: "Inativo" } as Record<string, string>)[v] ?? v }
function statusPublicacaoClass(status?: string | null) { if (status === "publicado") return styles.statusSuccess; if (status === "rejeitado") return styles.statusDanger; if (status === "pendente" || status === "em_analise") return styles.statusWarning; return styles.statusMuted }

export default function MeusImoveisPage() {
  const router = useRouter();
  const { permissoes } = useHeaderUser();
  const [imoveis, setImoveis] = useState<Imovel[]>([]); const [pessoas, setPessoas] = useState<PessoaOpcao[]>([]);
  const [pagina, setPagina] = useState(1); const [totalPaginas, setTotalPaginas] = useState(1); const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState(""); const [buscaAplicada, setBuscaAplicada] = useState(""); const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false); const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erro, setErro] = useState(""); const [mensagem, setMensagem] = useState(""); const [form, setForm] = useState<FormImovel>(FORM_INICIAL);
  const [modalCadastro, setModalCadastro] = useState(false); const [modalOperacao, setModalOperacao] = useState<"publicacao" | "fila" | "leads" | null>(null);
  const [imovelOperacaoId, setImovelOperacaoId] = useState<string | null>(null);
  const podeCriar = permissoes.includes("imoveis.criar"), podeEditar = permissoes.includes("imoveis.editar"), podeArquivar = permissoes.includes("imoveis.arquivar");
  const podeSalvar = editandoId ? podeEditar : podeCriar;

  const carregar = useCallback(async () => { setCarregando(true); setErro(""); try { const params = new URLSearchParams({ pagina: String(pagina), limite: "24" }); if (buscaAplicada) params.set("busca", buscaAplicada); const response = await fetch(`/api/imoveis?${params}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Erro ao carregar imóveis."); setImoveis(data.imoveis ?? []); setPessoas(data.pessoas ?? []); setTotal(data.paginacao?.total ?? 0); setTotalPaginas(data.paginacao?.total_paginas ?? 1) } catch (error) { setErro(error instanceof Error ? error.message : "Erro ao carregar imóveis.") } finally { setCarregando(false) } }, [buscaAplicada, pagina]);
  useEffect(() => { void carregar() }, [carregar]);

  function atualizarForm<K extends keyof FormImovel>(chave: K, valor: string) { setForm(a => ({ ...a, [chave]: valor })) }
  function abrirNovo() { setEditandoId(null); setForm(FORM_INICIAL); setErro(""); setModalCadastro(true) }
  function editarImovel(i: Imovel) { setEditandoId(i.id); setForm(formFromImovel(i)); setErro(""); setModalCadastro(true) }
  async function salvarImovel() { if (!form.titulo.trim()) { setErro("Informe o título do imóvel."); return } setSalvando(true); setErro(""); try { const response = await fetch(editandoId ? `/api/imoveis/${editandoId}` : "/api/imoveis", { method: editandoId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Erro ao salvar imóvel."); setMensagem(data.message || "Imóvel salvo com sucesso."); setModalCadastro(false); setEditandoId(null); setForm(FORM_INICIAL); await carregar() } catch (error) { setErro(error instanceof Error ? error.message : "Erro ao salvar imóvel.") } finally { setSalvando(false) } }
  async function arquivarImovel(i: Imovel) { if (!window.confirm(`Arquivar o imóvel "${i.titulo}"?`)) return; try { const response = await fetch(`/api/imoveis/${i.id}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Erro ao arquivar imóvel."); setMensagem(data.message || "Imóvel arquivado."); await carregar() } catch (error) { setErro(error instanceof Error ? error.message : "Erro ao arquivar imóvel.") } }
  function abrirOperacao(tipo: "publicacao" | "fila" | "leads", imovelId?: string) { setImovelOperacaoId(imovelId ?? null); setModalOperacao(tipo) }

  const camposNumericos = useMemo(() => [["valor", "Valor"], ["valor_condominio", "Condomínio"], ["valor_iptu", "IPTU"], ["area_m2", "Área m²"], ["quartos", "Quartos"], ["suites", "Suítes"], ["banheiros", "Banheiros"], ["vagas", "Vagas"]] as Array<[keyof FormImovel, string]>, []);
  const camposEndereco = useMemo(() => [["cep", "CEP"], ["logradouro", "Logradouro"], ["numero", "Número"], ["complemento", "Complemento"], ["bairro", "Bairro"], ["cidade", "Cidade"], ["estado", "Estado"]] as Array<[keyof FormImovel, string]>, []);

  return <>
    <Header title="Meus imóveis" subtitle="Gerencie sua carteira e acompanhe a publicação em todos os portais." />
    <main className={styles.page}>
      <section className={styles.toolbar}>
        <div className={styles.searchArea}><input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { setPagina(1); setBuscaAplicada(busca.trim()) } }} placeholder="Buscar por título, código, bairro ou cidade" /><button className={styles.searchButton} type="button" onClick={() => { setPagina(1); setBuscaAplicada(busca.trim()) }}>Buscar</button></div>
        <div className={styles.toolbarActions}>
          <button
            className={`${styles.secondaryButton} ${styles.integrationButton}`}
            type="button"
            onClick={() =>
              router.push("/configuracoes-gerais#integracao-imobiliaria")
            }
          >
            <Cable size={17} />
            Integração API
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => abrirOperacao("leads")}><MessageSquareText size={17} />Leads</button>
          <button className={styles.secondaryButton} type="button" onClick={() => abrirOperacao("fila")}><ListChecks size={17} />Fila</button>
          {podeCriar ? <button className={styles.primaryButton} type="button" onClick={abrirNovo}><Plus size={17} />Novo imóvel</button> : null}
        </div>
      </section>
      {erro ? <div className={styles.error}>{erro}</div> : null}
      <section className={styles.contentCard}>
        <div className={styles.cardHeader}><div><span className={styles.eyebrow}>Carteira imobiliária</span><h2>Imóveis cadastrados</h2><p>{total} registros encontrados.</p></div><span className={styles.badge}>Página {pagina} de {totalPaginas}</span></div>
        {carregando ? <div className={styles.empty}>Carregando imóveis...</div> : imoveis.length === 0 ? <div className={styles.empty}>Nenhum imóvel encontrado. Use “Novo imóvel” para cadastrar o primeiro.</div> : <div className={styles.propertyGrid}>{imoveis.map(imovel => {
          const publicacoes = imovel.publicacoes ?? []; return <article key={imovel.id} className={styles.itemCard}>
            <div className={styles.propertyImage}>{imovel.imagem_url ? <img src={imovel.imagem_url} alt={imovel.titulo} /> : <Building2 size={34} />}</div>
            <div className={styles.itemBody}><div className={styles.itemHeader}><div><h3>{imovel.titulo}</h3><p className={styles.muted}>{imovel.bairro || "Bairro não informado"}{imovel.cidade ? ` · ${imovel.cidade}` : ""}</p></div><span className={styles.statusBadge}>{labelStatus(imovel.status)}</span></div>
              <div className={styles.itemMeta}><span>{labelFinalidade(imovel.finalidade)}</span><span>{formatarMoeda(imovel.valor)}</span>{imovel.quartos ? <span>{imovel.quartos} quartos</span> : null}{imovel.area_m2 ? <span>{imovel.area_m2} m²</span> : null}</div>
              <div className={styles.publicationSummary}>{publicacoes.length === 0 ? <span className={`${styles.statusBadge} ${styles.statusMuted}`}>Ainda não publicado</span> : publicacoes.slice(0, 3).map(p => <span key={p.id} className={`${styles.statusBadge} ${statusPublicacaoClass(p.status)}`}>{p.canal_nome}: {getStatusPublicacaoLabel(p.status)}</span>)}</div>
              <p className={styles.muted}>Proprietário: {imovel.proprietario?.nome ?? "Não vinculado"}</p>
              <div className={styles.itemActions}><button className={styles.primaryButton} type="button" onClick={() => abrirOperacao("publicacao", imovel.id)}><UploadCloud size={16} />Publicar</button>{podeEditar ? <button className={styles.secondaryButton} type="button" onClick={() => editarImovel(imovel)}>Editar</button> : null}{podeArquivar ? <button className={styles.dangerButton} type="button" onClick={() => void arquivarImovel(imovel)}>Arquivar</button> : null}</div></div>
          </article>
        })}</div>}
        <div className={styles.pagination}><button className={styles.secondaryButton} disabled={pagina <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</button><button className={styles.secondaryButton} disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>Próxima</button></div>
      </section>
    </main>

    {modalCadastro ? <div className={styles.modalOverlay} role="presentation" onMouseDown={() => setModalCadastro(false)}><section className={styles.modal} role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}><header className={styles.modalHeader}><div><span className={styles.eyebrow}>{editandoId ? "Editar imóvel" : "Novo imóvel"}</span><h2>{editandoId ? "Atualizar cadastro" : "Cadastrar imóvel"}</h2><p>Preencha os dados usados na carteira e nas publicações.</p></div><button className={styles.iconButton} onClick={() => setModalCadastro(false)} aria-label="Fechar"><X size={20} /></button></header><div className={styles.modalBody}><div className={styles.formGrid}>
      <label className={`${styles.field} ${styles.fullField}`}><span>Título *</span><input value={form.titulo} onChange={e => atualizarForm("titulo", e.target.value)} placeholder="Ex.: Apartamento 2 quartos no Centro" /></label>
      <label className={styles.field}><span>Código interno</span><input value={form.codigo} onChange={e => atualizarForm("codigo", e.target.value)} /></label>
      <label className={styles.field}><span>Proprietário</span><select value={form.proprietario_pessoa_id} onChange={e => atualizarForm("proprietario_pessoa_id", e.target.value)}><option value="">Não vinculado</option>{pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
      <label className={styles.field}><span>Tipo</span><select value={form.tipo} onChange={e => atualizarForm("tipo", e.target.value)}><option value="apartamento">Apartamento</option><option value="casa">Casa</option><option value="terreno">Terreno</option><option value="sala_comercial">Sala comercial</option><option value="galpao">Galpão</option><option value="outro">Outro</option></select></label>
      <label className={styles.field}><span>Finalidade</span><select value={form.finalidade} onChange={e => atualizarForm("finalidade", e.target.value)}><option value="venda">Venda</option><option value="locacao">Locação</option><option value="venda_locacao">Venda ou locação</option></select></label>
      <label className={styles.field}><span>Status</span><select value={form.status} onChange={e => atualizarForm("status", e.target.value)}><option value="disponivel">Disponível</option><option value="reservado">Reservado</option><option value="vendido">Vendido</option><option value="alugado">Alugado</option><option value="inativo">Inativo</option></select></label>
      {camposNumericos.map(([chave, label]) => <label key={chave} className={styles.field}><span>{label}</span><input value={form[chave]} onChange={e => atualizarForm(chave, e.target.value)} /></label>)}
      {camposEndereco.map(([chave, label]) => <label key={chave} className={styles.field}><span>{label}</span><input value={form[chave]} maxLength={chave === "estado" ? 2 : undefined} onChange={e => atualizarForm(chave, e.target.value)} /></label>)}
      <label className={`${styles.field} ${styles.fullField}`}><span>Descrição</span><textarea value={form.descricao} onChange={e => atualizarForm("descricao", e.target.value)} /></label>
    </div></div><footer className={styles.modalFooter}><button className={styles.secondaryButton} onClick={() => setModalCadastro(false)}>Cancelar</button><button className={styles.primaryButton} disabled={salvando || !podeSalvar} onClick={() => void salvarImovel()}>{salvando ? "Salvando..." : "Salvar imóvel"}</button></footer></section></div> : null}

    <ImoveisOperacoesModais imoveis={imoveis} permissoes={permissoes} modal={modalOperacao} imovelInicialId={imovelOperacaoId} onClose={() => setModalOperacao(null)} onChanged={carregar} onError={setErro} onMessage={setMensagem} />
    {mensagem ? <FeedbackToast success={mensagem} onSuccessDismiss={() => setMensagem("")} /> : null}
  </>
}
