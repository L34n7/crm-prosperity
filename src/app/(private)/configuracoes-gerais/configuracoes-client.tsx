"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  HeartPulse,
  Home,
  Save,
  ShoppingBag,
  Stethoscope,
} from "lucide-react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { getNichoConfig } from "@/lib/nichos/config";
import styles from "./configuracoes.module.css";

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
  nicho_id: string;
  nicho: Nicho | null;
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

export default function ConfiguracoesClient() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [nichos, setNichos] = useState<Nicho[]>([]);
  const [nichoSelecionadoId, setNichoSelecionadoId] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const nichoSelecionado = useMemo(
    () => nichos.find((nicho) => nicho.id === nichoSelecionadoId) ?? null,
    [nichoSelecionadoId, nichos]
  );

  const configSelecionada = getNichoConfig(nichoSelecionado?.codigo);
  const alterouNicho =
    Boolean(empresa && nichoSelecionadoId) &&
    empresa?.nicho_id !== nichoSelecionadoId;
  const alterouEmpresa =
    Boolean(empresa) && nomeEmpresa.trim() !== empresa?.nome_fantasia;
  const trocaDeGrupo =
    Boolean(empresa?.nicho && nichoSelecionado) &&
    empresa?.nicho?.grupo !== nichoSelecionado?.grupo;

  useEffect(() => {
    async function carregar() {
      try {
        setCarregando(true);
        setErro("");

        const response = await fetch("/api/configuracoes/nicho", {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          setErro(data.error || "Erro ao carregar as configurações da empresa.");
          return;
        }

        setEmpresa(data.empresa);
        setNomeEmpresa(data.empresa?.nome_fantasia || "");
        setNichos(data.nichos || []);
        setNichoSelecionadoId(data.empresa?.nicho_id || "");
      } catch {
        setErro("Erro ao carregar as configurações da empresa.");
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, []);

  function selecionarNicho(nichoId: string) {
    setNichoSelecionadoId(nichoId);
    setConfirmando(false);
    setErro("");
    setSucesso("");
  }

  async function salvarEmpresa() {
    const nomeNormalizado = nomeEmpresa.trim().replace(/\s+/g, " ");
    if (!empresa || nomeNormalizado.length < 2 || !alterouEmpresa) return;

    try {
      setSalvandoEmpresa(true);
      setErro("");
      setSucesso("");

      const response = await fetch("/api/configuracoes/empresa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome_fantasia: nomeNormalizado }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Erro ao atualizar os dados da empresa.");
        return;
      }

      setEmpresa((atual) =>
        atual ? { ...atual, nome_fantasia: data.empresa.nome_fantasia } : atual
      );
      setNomeEmpresa(data.empresa.nome_fantasia);
      setSucesso(data.message || "Dados da empresa atualizados com sucesso.");
      router.refresh();
    } catch {
      setErro("Erro ao atualizar os dados da empresa.");
    } finally {
      setSalvandoEmpresa(false);
    }
  }

  async function salvarNicho() {
    if (!nichoSelecionado || !alterouNicho) return;

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const response = await fetch("/api/configuracoes/nicho", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicho_id: nichoSelecionado.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Erro ao alterar o nicho da empresa.");
        return;
      }

      setEmpresa(data.empresa);
      setNomeEmpresa(data.empresa.nome_fantasia);
      setNichoSelecionadoId(data.empresa.nicho_id);
      setConfirmando(false);
      setSucesso(data.message || "Nicho alterado com sucesso.");
      router.refresh();
    } catch {
      setErro("Erro ao alterar o nicho da empresa.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Header
        title="Configurações"
        subtitle="Gerencie os dados e personalize o funcionamento da sua empresa."
      />

      <main className={styles.page}>
        <FeedbackToast
          success={sucesso}
          error={erro}
          onSuccessDismiss={() => setSucesso("")}
          onErrorDismiss={() => setErro("")}
        />

        {carregando ? (
          <section className={styles.loadingCard}>Carregando configurações...</section>
        ) : empresa ? (
          <>
            <section className={`${styles.configCard} ${styles.companyCard}`}>
              <div className={styles.sectionHeader}>
                <div className={styles.companyHeading}>
                  <span className={styles.companyIcon}>
                    <Building2 size={24} />
                  </span>
                  <div>
                    <span className={styles.eyebrow}>Empresa</span>
                    <h2>Dados da empresa</h2>
                    <p>
                      Atualize as informações institucionais utilizadas dentro do CRM.
                    </p>
                  </div>
                </div>
              </div>

              <div className={styles.companyForm}>
                <label className={styles.companyField}>
                  <span>Nome da empresa</span>
                  <input
                    type="text"
                    value={nomeEmpresa}
                    maxLength={120}
                    placeholder="Digite o nome da empresa"
                    onChange={(event) => {
                      setNomeEmpresa(event.target.value);
                      setErro("");
                      setSucesso("");
                    }}
                  />
                  <small>
                    Este nome identifica a empresa no CRM. Os nomes das integrações
                    continuam sendo configurados separadamente.
                  </small>
                </label>
              </div>

              <div className={styles.footer}>
                <p>Somente administradores podem modificar estes dados.</p>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={salvarEmpresa}
                  disabled={
                    salvandoEmpresa ||
                    !alterouEmpresa ||
                    nomeEmpresa.trim().length < 2
                  }
                >
                  <Save size={17} />
                  {salvandoEmpresa ? "Salvando..." : "Salvar empresa"}
                </button>
              </div>
            </section>

            <section className={styles.currentCard}>
              <div className={styles.currentIcon}>
                <IconeNicho codigo={empresa.nicho?.codigo ?? ""} />
              </div>
              <div>
                <span className={styles.eyebrow}>Nicho atual</span>
                <h2>{empresa.nicho?.nome ?? "Não definido"}</h2>
                <p>
                  {empresa.nome_fantasia} está configurada no grupo{" "}
                  <strong>
                    {empresa.nicho?.grupo === "saude" ? "Saúde" : "Comercial"}
                  </strong>
                  .
                </p>
              </div>
              <span className={styles.activeBadge}>
                <CheckCircle2 size={15} />
                Ativo
              </span>
            </section>

            <section className={styles.configCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Nicho e módulos</span>
                  <h2>Nicho da empresa</h2>
                  <p>
                    Escolha o segmento da operação. A alteração adapta os nomes
                    dos cadastros e os módulos disponíveis no sistema.
                  </p>
                </div>
              </div>

              <div className={styles.nicheGrid}>
                {nichos.map((nicho) => {
                  const selecionado = nicho.id === nichoSelecionadoId;
                  const atual = nicho.id === empresa.nicho_id;

                  return (
                    <button
                      key={nicho.id}
                      type="button"
                      className={`${styles.nicheOption} ${
                        selecionado ? styles.nicheOptionSelected : ""
                      }`}
                      onClick={() => selecionarNicho(nicho.id)}
                      aria-pressed={selecionado}
                    >
                      <span className={styles.optionIcon}>
                        <IconeNicho codigo={nicho.codigo} />
                      </span>
                      <span className={styles.optionContent}>
                        <strong>{nicho.nome}</strong>
                        <small>
                          {nicho.grupo === "saude" ? "Saúde" : "Comercial"} ·{" "}
                          {nicho.rotulo_cadastro_plural}
                        </small>
                      </span>
                      <span
                        className={`${styles.radio} ${
                          selecionado ? styles.radioSelected : ""
                        }`}
                        aria-hidden="true"
                      />
                      {atual ? (
                        <span className={styles.currentLabel}>Atual</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {nichoSelecionado ? (
                <div className={styles.preview}>
                  <div>
                    <span className={styles.previewLabel}>
                      O sistema será exibido como
                    </span>
                    <strong>{configSelecionada.cadastroPlural}</strong>
                  </div>
                  <div className={styles.moduleList}>
                    {configSelecionada.modulos.map((modulo) => (
                      <span key={modulo}>
                        <CheckCircle2 size={14} />
                        {MODULOS_LABEL[modulo] ?? modulo}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {confirmando && alterouNicho ? (
                <div className={styles.confirmBox} role="alert">
                  <CircleAlert size={22} />
                  <div className={styles.confirmContent}>
                    <strong>
                      Confirmar mudança para {nichoSelecionado?.nome}?
                    </strong>
                    <p>
                      Os dados existentes não serão apagados. Módulos que não
                      pertencem ao novo nicho deixarão de aparecer.
                    </p>
                    {trocaDeGrupo ? (
                      <p className={styles.groupWarning}>
                        Esta mudança troca os módulos da empresa. Os cadastros de
                        pessoas serão preservados e os campos serão preparados
                        automaticamente de acordo com o novo nicho.
                      </p>
                    ) : null}
                    <div className={styles.confirmActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => setConfirmando(false)}
                        disabled={salvando}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={salvarNicho}
                        disabled={salvando}
                      >
                        {salvando ? "Alterando..." : "Confirmar alteração"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.footer}>
                  <p>Somente administradores podem modificar esta configuração.</p>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => setConfirmando(true)}
                    disabled={!alterouNicho}
                  >
                    {alterouNicho ? "Alterar nicho" : "Nicho atual selecionado"}
                  </button>
                </div>
              )}
            </section>

            <section className={styles.infoCard}>
              <CircleAlert size={20} />
              <div>
                <strong>O que muda?</strong>
                <p>
                  Ao mudar o nicho, o sistema adapta a experiência para o segmento
                  escolhido, exibindo apenas os recursos mais relevantes para sua
                  operação.
                </p>
              </div>
            </section>
          </>
        ) : (
          <section className={styles.loadingCard}>
            Não foi possível identificar a empresa.
          </section>
        )}
      </main>
    </>
  );
}
