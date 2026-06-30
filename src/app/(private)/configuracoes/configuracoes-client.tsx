"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  HeartPulse,
  Home,
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
  const [nichos, setNichos] = useState<Nicho[]>([]);
  const [nichoSelecionadoId, setNichoSelecionadoId] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const nichoSelecionado = useMemo(
    () =>
      nichos.find((nicho) => nicho.id === nichoSelecionadoId) ?? null,
    [nichoSelecionadoId, nichos]
  );

  const configSelecionada = getNichoConfig(nichoSelecionado?.codigo);
  const alterouNicho =
    Boolean(empresa && nichoSelecionadoId) &&
    empresa?.nicho_id !== nichoSelecionadoId;
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
          setErro(data.error || "Erro ao carregar a configuração de nicho.");
          return;
        }

        setEmpresa(data.empresa);
        setNichos(data.nichos || []);
        setNichoSelecionadoId(data.empresa?.nicho_id || "");
      } catch {
        setErro("Erro ao carregar a configuração de nicho.");
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
        subtitle="Personalize o funcionamento do sistema para a sua empresa."
      />

      <main className={styles.page}>
        <FeedbackToast
          success={sucesso}
          error={erro}
          onSuccessDismiss={() => setSucesso("")}
          onErrorDismiss={() => setErro("")}
        />

        {carregando ? (
          <section className={styles.loadingCard}>Carregando nicho...</section>
        ) : empresa ? (
          <>
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
                    {empresa.nicho?.grupo === "saude"
                      ? "Saúde"
                      : "Comercial"}
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
                        Esta mudança troca o grupo da empresa. Os cadastros de
                        pessoas serão preservados e, ao entrar em Saúde,
                        preparados automaticamente como pacientes.
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
                  <p>
                    Somente administradores podem modificar esta configuração.
                  </p>
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
                  Comércio e imobiliária usam “Clientes”. Medicina e
                  odontologia usam “Pacientes”. Prontuário, odontograma e
                  imóveis aparecem somente nos nichos correspondentes.
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
