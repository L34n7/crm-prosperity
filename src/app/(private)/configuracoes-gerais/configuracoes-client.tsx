"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Cable,
  CheckCircle2,
  CircleAlert,
  HeartPulse,
  Home,
  ImageIcon,
  Save,
  ShoppingBag,
  Stethoscope,
} from "lucide-react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { getNichoConfig } from "@/lib/nichos/config";
import IntegracaoEntradaImoveisSection from "./IntegracaoEntradaImoveisSection";
import styles from "./configuracoes.module.css";

type Aba = "empresa" | "integracoes";
type Nicho = {
  id: string;
  codigo: string;
  nome: string;
  grupo: "comercial" | "saude";
  rotulo_cadastro_singular: string;
  rotulo_cadastro_plural: string;
};
type Empresa = {
  id: string;
  nome_fantasia: string;
  documento: string | null;
  email: string;
  telefone: string | null;
  site: string | null;
  logo_url: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  nicho_id: string;
  nicho: Nicho | null;
};
type FormEmpresa = {
  nome_fantasia: string;
  documento: string;
  email: string;
  telefone: string;
  site: string;
  logo_url: string;
  endereco: string;
  cidade: string;
  estado: string;
  nicho_id: string;
};

const FORM_VAZIO: FormEmpresa = {
  nome_fantasia: "",
  documento: "",
  email: "",
  telefone: "",
  site: "",
  logo_url: "",
  endereco: "",
  cidade: "",
  estado: "",
  nicho_id: "",
};
const MODULOS_LABEL: Record<string, string> = {
  "cadastros.pessoas": "Cadastro de pessoas",
  "saude.pacientes": "Cadastro de pacientes",
  "saude.prontuarios": "Prontuário eletrônico",
  "saude.odontograma": "Odontograma",
  "imobiliario.imoveis": "Cadastro de imóveis",
  "imobiliario.negociacoes": "Negociações imobiliárias",
};

function IconeNicho({ codigo }: { codigo: string }) {
  if (codigo === "imobiliaria") return <Home size={24} />;
  if (codigo === "medicina") return <Stethoscope size={24} />;
  if (codigo === "odontologia") return <HeartPulse size={24} />;
  if (codigo === "comercio") return <ShoppingBag size={24} />;
  return <Building2 size={24} />;
}

function paraForm(empresa: Empresa): FormEmpresa {
  return {
    nome_fantasia: empresa.nome_fantasia || "",
    documento: empresa.documento || "",
    email: empresa.email || "",
    telefone: empresa.telefone || "",
    site: empresa.site || "",
    logo_url: empresa.logo_url || "",
    endereco: empresa.endereco || "",
    cidade: empresa.cidade || "",
    estado: empresa.estado || "",
    nicho_id: empresa.nicho_id || "",
  };
}

export default function ConfiguracoesClient({
  integracaoImobiliariaAtiva,
}: {
  integracaoImobiliariaAtiva: boolean;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("empresa");
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [form, setForm] = useState<FormEmpresa>(FORM_VAZIO);
  const [nichos, setNichos] = useState<Nicho[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoNicho, setConfirmandoNicho] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const nichoSelecionado = useMemo(
    () => nichos.find((item) => item.id === form.nicho_id) ?? null,
    [form.nicho_id, nichos]
  );
  const configSelecionada = getNichoConfig(nichoSelecionado?.codigo);
  const alterouNicho = Boolean(empresa && form.nicho_id !== empresa.nicho_id);
  const alterouFormulario = Boolean(empresa) && JSON.stringify(form) !== JSON.stringify(paraForm(empresa!));
  const trocaDeGrupo = Boolean(empresa?.nicho && nichoSelecionado) && empresa?.nicho?.grupo !== nichoSelecionado?.grupo;

  useEffect(() => {
    async function carregar() {
      try {
        setCarregando(true);
        const response = await fetch("/api/configuracoes/empresa", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Erro ao carregar as configurações.");
        setEmpresa(data.empresa);
        setForm(paraForm(data.empresa));
        setNichos(data.nichos || []);
      } catch (error) {
        setErro(error instanceof Error ? error.message : "Erro ao carregar as configurações.");
      } finally {
        setCarregando(false);
      }
    }
    void carregar();
  }, []);

  function atualizar(campo: keyof FormEmpresa, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setErro("");
    setSucesso("");
    if (campo === "nicho_id") setConfirmandoNicho(false);
  }

  async function salvar() {
    if (!alterouFormulario) return;
    if (alterouNicho && !confirmandoNicho) {
      setConfirmandoNicho(true);
      return;
    }

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");
      const response = await fetch("/api/configuracoes/empresa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao salvar as configurações.");
      setEmpresa(data.empresa);
      setForm(paraForm(data.empresa));
      setNichos(data.nichos || nichos);
      setConfirmandoNicho(false);
      setSucesso(data.message || "Configurações salvas com sucesso.");
      router.refresh();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar as configurações.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Header title="Configurações" subtitle="Gerencie sua empresa e as integrações externas." />
      <main className={styles.page}>
        <FeedbackToast success={sucesso} error={erro} onSuccessDismiss={() => setSucesso("")} onErrorDismiss={() => setErro("")} />

        <div className={styles.tabs} role="tablist" aria-label="Seções de configurações">
          <button type="button" role="tab" aria-selected={aba === "empresa"} className={`${styles.tabButton} ${aba === "empresa" ? styles.tabButtonActive : ""}`} onClick={() => setAba("empresa")}>
            <Building2 size={18} /> Empresa
          </button>
          <button type="button" role="tab" aria-selected={aba === "integracoes"} className={`${styles.tabButton} ${aba === "integracoes" ? styles.tabButtonActive : ""}`} onClick={() => setAba("integracoes")}>
            <Cable size={18} /> Integrações API
          </button>
        </div>

        {aba === "integracoes" ? (
          integracaoImobiliariaAtiva ? (
            <IntegracaoEntradaImoveisSection />
          ) : (
            <section className={styles.loadingCard}>Nenhuma integração API específica está disponível para o nicho atual.</section>
          )
        ) : carregando ? (
          <section className={styles.loadingCard}>Carregando configurações...</section>
        ) : empresa ? (
          <section className={styles.configCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.companyHeading}>
                <span className={styles.companyIcon}><Building2 size={24} /></span>
                <div>
                  <span className={styles.eyebrow}>Dados cadastrais</span>
                  <h2>Empresa</h2>
                  <p>Atualize os dados institucionais, localização, identidade visual e nicho.</p>
                </div>
              </div>
            </div>

            <div className={styles.companyFormGrid}>
              <label className={styles.companyField}><span>Nome da empresa *</span><input value={form.nome_fantasia} maxLength={120} onChange={(e) => atualizar("nome_fantasia", e.target.value)} /></label>
              <label className={styles.companyField}><span>CNPJ/CPF</span><input value={form.documento} maxLength={20} onChange={(e) => atualizar("documento", e.target.value)} /></label>
              <label className={styles.companyField}><span>E-mail comercial *</span><input type="email" value={form.email} maxLength={160} onChange={(e) => atualizar("email", e.target.value)} /></label>
              <label className={styles.companyField}><span>Telefone comercial</span><input value={form.telefone} maxLength={30} onChange={(e) => atualizar("telefone", e.target.value)} /></label>
              <label className={styles.companyField}><span>Site</span><input type="url" value={form.site} maxLength={240} placeholder="https://" onChange={(e) => atualizar("site", e.target.value)} /></label>
              <label className={styles.companyField}><span>Estado</span><input value={form.estado} maxLength={2} placeholder="SP" onChange={(e) => atualizar("estado", e.target.value.toUpperCase())} /></label>
              <label className={`${styles.companyField} ${styles.fieldWide}`}><span>Endereço</span><input value={form.endereco} maxLength={240} onChange={(e) => atualizar("endereco", e.target.value)} /></label>
              <label className={styles.companyField}><span>Cidade</span><input value={form.cidade} maxLength={120} onChange={(e) => atualizar("cidade", e.target.value)} /></label>
              <label className={`${styles.companyField} ${styles.fieldWide}`}><span>Logo da empresa (URL)</span><div className={styles.logoField}><span className={styles.logoPreview}>{form.logo_url ? <img src={form.logo_url} alt="Logo da empresa" /> : <ImageIcon size={22} />}</span><input type="url" value={form.logo_url} maxLength={500} placeholder="https://..." onChange={(e) => atualizar("logo_url", e.target.value)} /></div><small>Informe uma URL pública da imagem. O upload direto poderá ser adicionado depois.</small></label>
            </div>

            <div className={styles.nicheDivider} />
            <div className={styles.sectionHeader}>
              <div><span className={styles.eyebrow}>Nicho e módulos</span><h2>Nicho da empresa</h2><p>Escolha o segmento que adapta cadastros e módulos do CRM.</p></div>
            </div>
            <div className={styles.nicheGrid}>
              {nichos.map((nicho) => {
                const selecionado = nicho.id === form.nicho_id;
                return <button key={nicho.id} type="button" className={`${styles.nicheOption} ${selecionado ? styles.nicheOptionSelected : ""}`} onClick={() => atualizar("nicho_id", nicho.id)} aria-pressed={selecionado}>
                  <span className={styles.optionIcon}><IconeNicho codigo={nicho.codigo} /></span>
                  <span className={styles.optionContent}><strong>{nicho.nome}</strong><small>{nicho.grupo === "saude" ? "Saúde" : "Comercial"} · {nicho.rotulo_cadastro_plural}</small></span>
                  <span className={`${styles.radio} ${selecionado ? styles.radioSelected : ""}`} />
                </button>;
              })}
            </div>
            {nichoSelecionado && <div className={styles.preview}><div><span className={styles.previewLabel}>O sistema será exibido como</span><strong>{configSelecionada.cadastroPlural}</strong></div><div className={styles.moduleList}>{configSelecionada.modulos.map((modulo) => <span key={modulo}><CheckCircle2 size={14} />{MODULOS_LABEL[modulo] ?? modulo}</span>)}</div></div>}

            {confirmandoNicho && alterouNicho && <div className={styles.confirmBox}><CircleAlert size={22} /><div className={styles.confirmContent}><strong>Confirmar mudança para {nichoSelecionado?.nome}?</strong><p>Os dados existentes não serão apagados. Módulos fora do novo nicho deixarão de aparecer.</p>{trocaDeGrupo && <p className={styles.groupWarning}>Esta mudança troca o grupo de módulos da empresa, preservando os cadastros existentes.</p>}</div></div>}

            <div className={styles.footer}>
              <p>Todos os dados e o nicho serão salvos juntos.</p>
              <button type="button" className={styles.primaryButton} onClick={salvar} disabled={salvando || !alterouFormulario || form.nome_fantasia.trim().length < 2 || !form.email.trim()}><Save size={17} />{salvando ? "Salvando..." : confirmandoNicho ? "Confirmar e salvar" : "Salvar alterações"}</button>
            </div>
          </section>
        ) : <section className={styles.loadingCard}>Não foi possível identificar a empresa.</section>}
      </main>
    </>
  );
}
