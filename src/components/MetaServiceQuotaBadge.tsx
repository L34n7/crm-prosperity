"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  MessageCircle,
  PauseCircle,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  type HeaderSummaryFranquiaServiceMeta,
  useHeaderSummary,
} from "@/components/header-summary-context";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./MetaServiceQuotaBadge.module.css";

type IntegracaoService =
  HeaderSummaryFranquiaServiceMeta["integracoes"][number];

type DraftConfig = {
  pausar: boolean;
  usarExtra: boolean;
  limiteExtra: number;
};

function formatar(valor: number) {
  return new Intl.NumberFormat("pt-BR").format(Math.max(0, Number(valor || 0)));
}

function formatarMoeda(valor: number | null) {
  if (valor === null || !Number.isFinite(valor)) return null;

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

function normalizarLimiteExtra(valor: unknown) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Math.max(0, Math.min(1_000_000, Math.floor(numero)));
}

function estimarFaixaCusto(
  limiteExtra: number,
  tarifaServiceBrl: number | null
) {
  if (limiteExtra <= 0 || !tarifaServiceBrl || tarifaServiceBrl <= 0) {
    return null;
  }

  const centro = limiteExtra * tarifaServiceBrl;

  return {
    minimo: Math.max(0, centro * 0.95),
    maximo: Math.max(0, centro * 1.05),
  };
}

export default function MetaServiceQuotaBadge() {
  const { franquiaServiceMeta, refreshResumo } = useHeaderSummary();
  const headerUser = useHeaderUser();
  const [mounted, setMounted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [expandidaId, setExpandidaId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftConfig>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [erroId, setErroId] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState("");

  useEffect(() => setMounted(true), []);

  const alerta = franquiaServiceMeta?.alerta_pendente || null;
  const alertaIntegracao = useMemo(
    () =>
      franquiaServiceMeta?.integracoes.find(
        (item) => item.id === alerta?.integracao_whatsapp_id
      ) || null,
    [alerta?.integracao_whatsapp_id, franquiaServiceMeta]
  );

  useEffect(() => {
    if (headerUser.isAdmin && alerta) {
      setModalOpen(true);
    }
  }, [alerta?.id, headerUser.isAdmin]);

  const nivel = franquiaServiceMeta?.nivel_percentual_maximo || 0;
  const statusClass =
    nivel >= 95
      ? styles.badgeCritical
      : nivel >= 80
        ? styles.badgeWarning
        : "";

  const percentualGeral = Math.min(
    100,
    Math.max(0, franquiaServiceMeta?.percentual || 0)
  );

  const descricao = useMemo(() => {
    if (!franquiaServiceMeta) return "";
    return `Meta Service: ${formatar(
      franquiaServiceMeta.total_usado
    )} de ${formatar(franquiaServiceMeta.total_limite)} gratuitas usadas`;
  }, [franquiaServiceMeta]);

  if (!franquiaServiceMeta || franquiaServiceMeta.total_limite <= 0) {
    return null;
  }

  async function fecharModal() {
    if (confirmando || salvandoId) return;

    if (!alerta || !headerUser.isAdmin) {
      setModalOpen(false);
      return;
    }

    try {
      setConfirmando(true);
      await fetch("/api/whatsapp/service-franquia/alertas/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerta_id: alerta.id }),
      });
      setModalOpen(false);
      await refreshResumo(true);
    } finally {
      setConfirmando(false);
    }
  }

  function abrirConfiguracao(integracao: IntegracaoService) {
    setErroId(null);
    setMensagemErro("");
    setDrafts((atual) => ({
      ...atual,
      [integracao.id]: {
        pausar: integracao.pausar_automacoes,
        usarExtra: integracao.limite_extra > 0,
        limiteExtra: integracao.limite_extra,
      },
    }));
    setExpandidaId((atual) =>
      atual === integracao.id ? null : integracao.id
    );
  }

  function atualizarDraft(
    integracao: IntegracaoService,
    patch: Partial<DraftConfig>
  ) {
    setDrafts((atual) => {
      const base = atual[integracao.id] || {
        pausar: integracao.pausar_automacoes,
        usarExtra: integracao.limite_extra > 0,
        limiteExtra: integracao.limite_extra,
      };

      return {
        ...atual,
        [integracao.id]: {
          ...base,
          ...patch,
        },
      };
    });
  }

  async function salvarConfiguracao(integracao: IntegracaoService) {
    if (!headerUser.isAdmin || salvandoId) return;

    const draft = drafts[integracao.id] || {
      pausar: integracao.pausar_automacoes,
      usarExtra: integracao.limite_extra > 0,
      limiteExtra: integracao.limite_extra,
    };

    try {
      setSalvandoId(integracao.id);
      setErroId(null);
      setMensagemErro("");

      const response = await fetch(
        "/api/whatsapp/service-franquia/configuracao",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            integracao_whatsapp_id: integracao.id,
            pausar_automacoes: draft.pausar,
            usar_limite_extra: draft.pausar && draft.usarExtra,
            limite_extra:
              draft.pausar && draft.usarExtra
                ? normalizarLimiteExtra(draft.limiteExtra)
                : 0,
          }),
        }
      );

      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json.ok) {
        throw new Error(
          json.error || "Não foi possível salvar a configuração."
        );
      }

      await refreshResumo(true);
    } catch (error) {
      setErroId(integracao.id);
      setMensagemErro(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a configuração."
      );
    } finally {
      setSalvandoId(null);
    }
  }

  const tituloModal = alerta
    ? alerta.percentual >= 100
      ? "Franquia gratuita atingida"
      : `Atenção: ${alerta.percentual}% da franquia utilizada`
    : "Consumo Meta Service";

  return (
    <>
      <button
        type="button"
        className={`${styles.badge} ${statusClass}`}
        title={descricao}
        onClick={() => setModalOpen(true)}
        aria-label={descricao}
      >
        <span className={styles.iconWrap}>
          <MessageCircle size={15} strokeWidth={2.4} />
        </span>

        <span className={styles.copy}>
          <span className={styles.label}>Meta Service</span>
          <strong>
            {formatar(franquiaServiceMeta.total_usado)}
            <span>/</span>
            {formatar(franquiaServiceMeta.total_limite)}
          </strong>
        </span>

        <span className={styles.progress} aria-hidden="true">
          <span style={{ width: `${percentualGeral}%` }} />
        </span>
      </button>

      {mounted &&
        modalOpen &&
        createPortal(
          <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            onClick={() => void fecharModal()}
          >
            <div
              className={styles.modal}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={styles.close}
                onClick={() => void fecharModal()}
                aria-label="Fechar"
                disabled={confirmando || Boolean(salvandoId)}
              >
                ×
              </button>

              <div className={styles.hero}>
                <span className={styles.heroIcon}>
                  {alerta && alerta.percentual >= 95 ? (
                    <AlertTriangle size={25} />
                  ) : (
                    <CheckCircle2 size={25} />
                  )}
                </span>
                <div>
                  <span className={styles.eyebrow}>Meta · Service</span>
                  <h2>{tituloModal}</h2>
                  <p>
                    {alerta
                      ? `O número ${alerta.numero || alerta.nome} consumiu ${formatar(
                          alerta.service_usado
                        )} de ${formatar(
                          alerta.service_limite
                        )} mensagens Service gratuitas neste mês.`
                      : "Acompanhe o consumo mensal por número e configure, individualmente, quando os fluxos e agentes de IA devem ser pausados."}
                  </p>
                  {alerta &&
                    alerta.percentual >= 100 &&
                    alertaIntegracao?.pausar_automacoes &&
                    alertaIntegracao.limite_extra > 0 && (
                      <p className={styles.heroContinuation}>
                        As automações continuam ativas até{" "}
                        <strong>
                          {formatar(
                            alertaIntegracao.limite_total_automacoes
                          )}
                        </strong>{" "}
                        mensagens Service, conforme o limite extra configurado.
                      </p>
                    )}
                </div>
              </div>

              <div className={styles.totalCard}>
                <div>
                  <span>Consumo gratuito consolidado</span>
                  <strong>
                    {formatar(franquiaServiceMeta.total_usado)} /{" "}
                    {formatar(franquiaServiceMeta.total_limite)}
                  </strong>
                </div>
                <div className={styles.totalRight}>
                  <strong>{franquiaServiceMeta.percentual.toFixed(1)}%</strong>
                  <span>
                    {formatar(franquiaServiceMeta.total_restante)} gratuitas
                    restantes
                  </span>
                </div>
                <div className={styles.totalProgress}>
                  <span style={{ width: `${percentualGeral}%` }} />
                </div>
              </div>

              <div className={styles.list}>
                {franquiaServiceMeta.integracoes.map((integracao) => {
                  const expandida = expandidaId === integracao.id;
                  const draft = drafts[integracao.id] || {
                    pausar: integracao.pausar_automacoes,
                    usarExtra: integracao.limite_extra > 0,
                    limiteExtra: integracao.limite_extra,
                  };
                  const limiteExtraDraft =
                    draft.pausar && draft.usarExtra
                      ? normalizarLimiteExtra(draft.limiteExtra)
                      : 0;
                  const limiteFinalDraft = 1000 + limiteExtraDraft;
                  const estimativaDraft = estimarFaixaCusto(
                    limiteExtraDraft,
                    integracao.tarifa_service_brl_estimada
                  );
                  const custoMin = estimativaDraft
                    ? formatarMoeda(estimativaDraft.minimo)
                    : null;
                  const custoMax = estimativaDraft
                    ? formatarMoeda(estimativaDraft.maximo)
                    : null;
                  const statusConsumo =
                    integracao.bloqueado_por_limite
                      ? "Pausado"
                      : integracao.percentual >= 85
                        ? "Crítico"
                        : integracao.percentual >= 50
                          ? "Atenção"
                          : "Normal";
                  const statusConsumoClass =
                    integracao.bloqueado_por_limite
                      ? styles.itemStatusPaused
                      : integracao.percentual >= 85
                        ? styles.itemStatusCritical
                        : integracao.percentual >= 50
                          ? styles.itemStatusWarning
                          : styles.itemStatusSafe;

                  return (
                    <div
                      key={integracao.id}
                      className={`${styles.item} ${statusConsumoClass} ${
                        expandida ? styles.itemExpanded : ""
                      } ${
                        integracao.bloqueado_por_limite
                          ? styles.itemBlocked
                          : ""
                      }`}
                    >
                      <div className={styles.itemTop}>
                        <div className={styles.itemIdentity}>
                          <div className={styles.itemNumberLine}>
                            <strong>{integracao.numero || integracao.nome}</strong>
                            <span className={styles.itemStatus}>
                              {statusConsumo}
                            </span>
                          </div>
                          <span>{integracao.nome}</span>
                        </div>
                        <div className={styles.itemValue}>
                          <strong>
                            {formatar(integracao.usados)} /{" "}
                            {formatar(integracao.limite)}
                          </strong>
                          <span>{integracao.percentual.toFixed(1)}%</span>
                        </div>
                      </div>

                      <div className={styles.itemProgress}>
                        <span
                          style={{
                            width: `${Math.min(
                              100,
                              integracao.percentual
                            )}%`,
                          }}
                        />
                      </div>

                      <div className={styles.itemMeta}>
                        <span>
                          {formatar(integracao.restantes)} gratuitas restantes
                        </span>
                        {integracao.service_cobrado > 0 && (
                          <span className={styles.itemMetaCharged}>
                            {formatar(integracao.service_cobrado)} Service
                            cobradas
                          </span>
                        )}
                        {integracao.free_entry_point > 0 && (
                          <span>
                            {formatar(integracao.free_entry_point)} Free Entry
                            Point
                          </span>
                        )}
                      </div>

                      {integracao.pausar_automacoes && (
                        <div
                          className={`${styles.protectionStatus} ${
                            integracao.bloqueado_por_limite
                              ? styles.protectionBlocked
                              : ""
                          }`}
                        >
                          <span className={styles.protectionIcon}>
                            {integracao.bloqueado_por_limite ? (
                              <PauseCircle size={16} />
                            ) : (
                              <ShieldCheck size={16} />
                            )}
                          </span>
                          <div>
                            <strong>
                              {integracao.bloqueado_por_limite
                                ? "Automações pausadas pelo limite"
                                : `Teto das automações: ${formatar(
                                    integracao.limite_total_automacoes
                                  )}`}
                            </strong>
                            <span>
                              {integracao.bloqueado_por_limite
                                ? "Fluxos e agentes de IA deste número estão pausados até o próximo ciclo ou alteração do limite."
                                : `${formatar(
                                    integracao.restante_ate_pausa || 0
                                  )} mensagens Service até a pausa automática.`}
                            </span>
                          </div>
                        </div>
                      )}

                      {headerUser.isAdmin && (
                        <button
                          type="button"
                          className={styles.expandButton}
                          onClick={() => abrirConfiguracao(integracao)}
                          aria-expanded={expandida}
                        >
                          <span>
                            {integracao.pausar_automacoes ? (
                              <ShieldCheck size={16} />
                            ) : (
                              <PauseCircle size={16} />
                            )}
                            Pausar automações quando atingir o limite
                          </span>
                          <ChevronDown
                            size={18}
                            className={expandida ? styles.chevronOpen : ""}
                          />
                        </button>
                      )}

                      {headerUser.isAdmin && expandida && (
                        <div className={styles.configPanel}>
                          <label className={styles.toggleRow}>
                            <span>
                              <strong>
                                Pausar quando atingir o limite Meta Service
                              </strong>
                              <small>
                                Vale para todos os fluxos e todos os agentes de
                                IA vinculados a esta integração.
                              </small>
                            </span>
                            <input
                              type="checkbox"
                              checked={draft.pausar}
                              onChange={(event) =>
                                atualizarDraft(integracao, {
                                  pausar: event.target.checked,
                                })
                              }
                            />
                            <span className={styles.switch} aria-hidden="true" />
                          </label>

                          <div className={styles.configInfo}>
                            O atendimento humano e o recebimento de mensagens
                            continuam funcionando. A proteção interrompe somente
                            as automações deste número.
                          </div>

                          {draft.pausar && (
                            <>
                              <label className={styles.toggleRow}>
                                <span>
                                  <strong>
                                    Personalizar um limite além das 1.000 grátis
                                  </strong>
                                  <small>
                                    Permite continuar as automações por uma
                                    quantidade adicional de mensagens Service
                                    cobradas antes da pausa.
                                  </small>
                                </span>
                                <input
                                  type="checkbox"
                                  checked={draft.usarExtra}
                                  onChange={(event) =>
                                    atualizarDraft(integracao, {
                                      usarExtra: event.target.checked,
                                    })
                                  }
                                />
                                <span
                                  className={styles.switch}
                                  aria-hidden="true"
                                />
                              </label>

                              {draft.usarExtra && (
                                <div className={styles.limitEditor}>
                                  <label>
                                    <span>Mensagens extras permitidas</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="1000000"
                                      step="50"
                                      value={draft.limiteExtra}
                                      onChange={(event) =>
                                        atualizarDraft(integracao, {
                                          limiteExtra:
                                            normalizarLimiteExtra(
                                              event.target.value
                                            ),
                                        })
                                      }
                                    />
                                  </label>

                                  <div className={styles.estimateCard}>
                                    <div>
                                      <span>Limite final</span>
                                      <strong>
                                        {formatar(limiteFinalDraft)} Service
                                      </strong>
                                    </div>
                                    <div>
                                      <span>Custo estimado do adicional</span>
                                      <strong>
                                        {custoMin && custoMax
                                          ? `${custoMin} a ${custoMax}`
                                          : "Estimativa indisponível"}
                                      </strong>
                                    </div>
                                  </div>

                                  <p className={styles.estimateNote}>
                                    Estimativa baseada na tarifa Service vigente
                                    cadastrada no CRM e com margem de ±5% para
                                    variação cambial. A cobrança efetiva é
                                    determinada pela Meta.
                                  </p>
                                </div>
                              )}

                              {!draft.usarExtra && (
                                <div className={styles.noExtraNote}>
                                  Com esta opção, todos os fluxos e agentes de IA
                                  deste número serão pausados ao atingir{" "}
                                  <strong>1.000 mensagens Service</strong> no mês.
                                </div>
                              )}

                              {integracao.service_total_mes >= limiteFinalDraft && (
                                <div className={styles.immediateWarning}>
                                  <AlertTriangle size={17} />
                                  <span>
                                    O consumo atual já atingiu este teto. Ao salvar,
                                    os fluxos e agentes de IA desta integração serão
                                    pausados imediatamente.
                                  </span>
                                </div>
                              )}
                            </>
                          )}

                          {erroId === integracao.id && (
                            <div className={styles.errorBox}>
                              {mensagemErro}
                            </div>
                          )}

                          <button
                            type="button"
                            className={styles.saveButton}
                            disabled={salvandoId === integracao.id}
                            onClick={() =>
                              void salvarConfiguracao(integracao)
                            }
                          >
                            <Save size={17} />
                            {salvandoId === integracao.id
                              ? "Salvando..."
                              : "Salvar configuração"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className={styles.footerNote}>
                A franquia gratuita reinicia mensalmente por número,
                considerando o fuso da empresa. Mensagens Service cobradas após
                as 1.000 gratuitas entram no limite extra quando ele estiver
                configurado. Free Entry Point é contabilizado separadamente e
                não reduz este saldo.
              </div>

              <button
                type="button"
                className={styles.primary}
                onClick={() => void fecharModal()}
                disabled={confirmando || Boolean(salvandoId)}
              >
                {confirmando
                  ? "Confirmando..."
                  : alerta
                    ? "Entendi"
                    : "Fechar"}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
