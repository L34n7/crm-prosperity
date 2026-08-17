"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  Database,
  Filter,
  GitBranch,
  Loader2,
  Mail,
  Plus,
  Send,
  Tag,
  Trash2,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import styles from "./automacoes-api.module.css";
import {
  acaoLabel,
  acoesDisponiveis,
  camposPorCategoria,
  categorias,
  configuracaoPadraoAcao,
  gatilhoLabel,
  gatilhosPorCategoria,
  multiplicadorUnidade,
  operadores,
  quantidadeOffset,
  unidadeOffset,
  valorComoTexto,
  variaveisWhatsappSugeridas,
  type Acao,
  type Categoria,
  type Condicao,
  type FormRotina,
  type Opcoes,
  type Operador,
  type Template,
} from "./automation-catalog";

type Props = {
  form: FormRotina;
  opcoes: Opcoes;
  salvando: boolean;
  onChange: (form: FormRotina) => void;
  onClose: () => void;
  onSave: () => void;
};

const VARIAVEIS_PADRAO = ["nome_contato", "campanha", "numero_contato"];

function AcaoIcon({ tipo }: { tipo: string }) {
  if (tipo === "fluxo.iniciar") return <Workflow size={18} />;
  if (tipo === "whatsapp.enviar_mensagem") return <Send size={18} />;
  if (tipo === "whatsapp.enviar_template") return <Send size={18} />;
  if (tipo === "email.enviar") return <Mail size={18} />;
  if (tipo === "contato.adicionar_etiqueta") return <Tag size={18} />;
  if (tipo === "conversa.transferir_setor") return <GitBranch size={18} />;
  if (tipo === "agenda.atualizar_status") return <CalendarClock size={18} />;
  if (tipo === "integracao.consultar_api") return <Database size={18} />;
  return <Zap size={18} />;
}

function componentesTemplate(template?: Template | null) {
  const payload = template?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const components = (payload as { components?: unknown }).components;
  return Array.isArray(components) ? (components as Array<Record<string, any>>) : [];
}

function contarVariaveisNoTexto(texto: unknown) {
  const matches = String(texto || "").match(/\{\{\d+\}\}/g) || [];
  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((numero) => Number.isFinite(numero));
  return numeros.length ? Math.max(...numeros) : 0;
}

function contarVariaveisTemplate(template?: Template | null) {
  const componentes = componentesTemplate(template);
  const header = componentes.find((item) => String(item.type || "").toUpperCase() === "HEADER");
  const body = componentes.find((item) => String(item.type || "").toUpperCase() === "BODY");
  const buttons = componentes.find((item) => String(item.type || "").toUpperCase() === "BUTTONS");

  let total = contarVariaveisNoTexto(header?.text) + contarVariaveisNoTexto(body?.text);
  for (const button of Array.isArray(buttons?.buttons) ? buttons.buttons : []) {
    if (String(button?.type || "").toUpperCase() === "URL") {
      total += contarVariaveisNoTexto(button?.url);
    }
  }
  return total;
}

function variaveisPadrao(total: number) {
  return Array.from({ length: total }, (_, index) => VARIAVEIS_PADRAO[index] || "");
}

function substituirPreviewSequencial(texto: unknown, variaveis: string[], offset: number) {
  return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
    const index = offset + Number(numero) - 1;
    const variavel = String(variaveis[index] || "").trim();
    return variavel ? `{{${variavel}}}` : `{{${numero}}}`;
  });
}

function montarPreviewTemplate(template: Template | null | undefined, variaveis: string[]) {
  if (!template) return "Selecione um template para visualizar a prévia.";
  const componentes = componentesTemplate(template);
  if (!componentes.length) return template.nome;

  const header = componentes.find((item) => String(item.type || "").toUpperCase() === "HEADER");
  const body = componentes.find((item) => String(item.type || "").toUpperCase() === "BODY");
  const footer = componentes.find((item) => String(item.type || "").toUpperCase() === "FOOTER");
  const buttons = componentes.find((item) => String(item.type || "").toUpperCase() === "BUTTONS");
  const partes: string[] = [];
  let offset = 0;

  if (header?.text) {
    partes.push(substituirPreviewSequencial(header.text, variaveis, offset));
    offset += contarVariaveisNoTexto(header.text);
  }
  if (body?.text) {
    partes.push(substituirPreviewSequencial(body.text, variaveis, offset));
    offset += contarVariaveisNoTexto(body.text);
  }
  if (footer?.text) partes.push(String(footer.text));

  const botoes = (Array.isArray(buttons?.buttons) ? buttons.buttons : [])
    .map((button: any) => String(button?.text || "").trim())
    .filter(Boolean);
  if (botoes.length) partes.push(botoes.map((item: string) => `▢ ${item}`).join("\n"));

  return partes.join("\n\n").trim() || template.nome;
}

export default function AutomationBuilderModal({
  form,
  opcoes,
  salvando,
  onChange,
  onClose,
  onSave,
}: Props) {
  const [etapa, setEtapa] = useState(1);
  const [interrupcaoSugerida, setInterrupcaoSugerida] = useState(false);
  const gatilhos = gatilhosPorCategoria[form.categoria];
  const campos = camposPorCategoria[form.categoria];
  const permiteValor = (operador: Operador) => !["existe", "nao_existe"].includes(operador);
  const integracoesAtivas = opcoes.integracoes_whatsapp.filter((item) => item.status === "ativa");
  const integracaoAutomacaoId = String(form.gatilho.configuracao_json.integracao_whatsapp_id || "");

  const resumo = useMemo(
    () =>
      `${gatilhoLabel(form.gatilho)} → ${
        form.condicoes.length ? `${form.condicoes.length} condição(ões)` : "sem condição"
      } → ${form.acoes.map((item) => acaoLabel(item.tipo_acao)).join(" + ")}`,
    [form.acoes, form.condicoes.length, form.gatilho],
  );

  const alertaDisparosMultiIntegracao = useMemo(() => {
    if (integracaoAutomacaoId || integracoesAtivas.length < 2) return null;
    const acoesDisparo = form.acoes.filter((acao) => acao.tipo_acao === "whatsapp.enviar_template");
    if (!acoesDisparo.length) return null;
    const configuradas = new Set(
      acoesDisparo
        .map((acao) => String(acao.configuracao_json.integracao_whatsapp_id || "").trim())
        .filter(Boolean),
    );
    const faltantes = integracoesAtivas.filter((item) => !configuradas.has(item.id));
    if (!faltantes.length) return null;
    return faltantes;
  }, [form.acoes, integracaoAutomacaoId, integracoesAtivas]);

  function configuracaoIntegracaoBase() {
    const id = String(form.gatilho.configuracao_json.integracao_whatsapp_id || "").trim();
    return id ? { integracao_whatsapp_id: id } : {};
  }

  function mudarEtapa(proximaEtapa: number) {
    if (
      proximaEtapa === 4 &&
      !interrupcaoSugerida &&
      form.condicoes.some((condicao) => condicao.campo === "mensagem.texto")
    ) {
      setInterrupcaoSugerida(true);

      if (!form.acoes.some((acao) => acao.tipo_acao === "fluxo.interromper")) {
        const acaoInterromper: Acao = {
          ordem: 0,
          tipo_acao: "fluxo.interromper",
          configuracao_json: {},
          ativo: true,
        };

        onChange({
          ...form,
          acoes: [acaoInterromper, ...form.acoes].map((acao, ordem) => ({
            ...acao,
            ordem,
          })),
        });
      }
    }

    setEtapa(proximaEtapa);
  }

  function selecionarIntegracaoAutomacao(integracaoId: string) {
    const configuracaoAtual = form.gatilho.configuracao_json || {};
    const acoes = form.acoes.map((acao) => {
      if (acao.tipo_acao !== "whatsapp.enviar_template" || !integracaoId) return acao;
      if (String(acao.configuracao_json.integracao_whatsapp_id || "") === integracaoId) return acao;
      return {
        ...acao,
        configuracao_json: {
          ...acao.configuracao_json,
          integracao_whatsapp_id: integracaoId,
          template_id: "",
          variaveis: [],
        },
      };
    });

    onChange({
      ...form,
      gatilho: {
        ...form.gatilho,
        configuracao_json: {
          ...configuracaoAtual,
          integracao_whatsapp_id: integracaoId || null,
        },
      },
      acoes,
    });
  }

  function selecionarCategoria(categoria: Categoria) {
    const primeiro = gatilhosPorCategoria[categoria][0];
    onChange({
      ...form,
      categoria,
      gatilho: {
        tipo: primeiro.tipo,
        evento: primeiro.evento,
        entidade_tipo: categoria === "agenda" ? "agenda_agendamento" : categoria,
        configuracao_json: configuracaoIntegracaoBase(),
        ativo: true,
      },
      condicoes: [],
    });
  }

  function selecionarEvento(evento: string) {
    const item = gatilhos.find((gatilho) => gatilho.evento === evento);
    const relativa = item?.tipo === "data_relativa";
    onChange({
      ...form,
      gatilho: {
        ...form.gatilho,
        evento,
        tipo: item?.tipo || "evento",
        offset_minutos: relativa ? form.gatilho.offset_minutos || 60 : null,
        offset_referencia:
          evento === "agenda.depois_fim" ? "fim" : evento === "agenda.antes_inicio" ? "inicio" : null,
        configuracao_json: relativa
          ? {
              ...configuracaoIntegracaoBase(),
              offset_unidade: form.gatilho.configuracao_json.offset_unidade || "horas",
            }
          : configuracaoIntegracaoBase(),
      },
    });
  }

  function alterarOffset(quantidade: number, unidade = unidadeOffset(form.gatilho)) {
    onChange({
      ...form,
      gatilho: {
        ...form.gatilho,
        offset_minutos: Math.max(1, quantidade) * multiplicadorUnidade(unidade),
        configuracao_json: { ...form.gatilho.configuracao_json, offset_unidade: unidade },
      },
    });
  }

  function adicionarCondicao() {
    const nova: Condicao = {
      grupo: 0,
      ordem: form.condicoes.length,
      conjuncao: "and",
      campo: campos[0]?.value || "",
      operador: "igual",
      valor_json: "",
      configuracao_json: {},
    };
    onChange({ ...form, condicoes: [...form.condicoes, nova] });
  }

  function atualizarCondicao(index: number, patch: Partial<Condicao>) {
    onChange({
      ...form,
      condicoes: form.condicoes.map((item, posicao) =>
        posicao === index ? { ...item, ...patch } : item,
      ),
    });
  }

  function removerCondicao(index: number) {
    onChange({
      ...form,
      condicoes: form.condicoes
        .filter((_, posicao) => posicao !== index)
        .map((item, ordem) => ({ ...item, ordem })),
    });
  }

  function adicionarAcao() {
    onChange({
      ...form,
      acoes: [
        ...form.acoes,
        {
          ordem: form.acoes.length,
          tipo_acao: "notificacao.responsavel",
          configuracao_json: {},
          ativo: true,
        },
      ],
    });
  }

  function atualizarAcao(index: number, patch: Partial<Acao>) {
    onChange({
      ...form,
      acoes: form.acoes.map((item, posicao) =>
        posicao === index ? { ...item, ...patch } : item,
      ),
    });
  }

  function configAcao(index: number, chave: string, valor: unknown) {
    atualizarAcao(index, {
      configuracao_json: { ...form.acoes[index].configuracao_json, [chave]: valor },
    });
  }

  function configuracaoAoSelecionarAcao(tipo: string) {
    const base = configuracaoPadraoAcao(tipo);
    if (tipo === "whatsapp.enviar_template" && integracaoAutomacaoId) {
      return { ...base, integracao_whatsapp_id: integracaoAutomacaoId };
    }
    return base;
  }

  function removerAcao(index: number) {
    if (form.acoes.length === 1) return;
    onChange({
      ...form,
      acoes: form.acoes
        .filter((_, posicao) => posicao !== index)
        .map((item, ordem) => ({ ...item, ordem })),
    });
  }

  function renderConfigAcao(acao: Acao, index: number) {
    const config = acao.configuracao_json;

    if (acao.tipo_acao === "fluxo.iniciar") {
      return (
        <label className={styles.formField} style={{ marginTop: 8 }}>
          <span>Fluxo</span>
          <select value={String(config.fluxo_id || "")} onChange={(event) => configAcao(index, "fluxo_id", event.target.value)}>
            <option value="">Selecione</option>
            {opcoes.fluxos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
          </select>
        </label>
      );
    }

    if (acao.tipo_acao === "whatsapp.enviar_mensagem") {
      return (
        <label className={styles.formField} style={{ marginTop: 8 }}>
          <span>Mensagem</span>
          <input
            value={String(config.mensagem || "")}
            onChange={(event) => configAcao(index, "mensagem", event.target.value)}
            placeholder="Digite a mensagem que será enviada"
          />
        </label>
      );
    }

    if (acao.tipo_acao === "whatsapp.enviar_template") {
      const integracaoId = String(config.integracao_whatsapp_id || "");
      const integracoesDisponiveis = integracaoAutomacaoId
        ? integracoesAtivas.filter((item) => item.id === integracaoAutomacaoId)
        : integracoesAtivas;
      const templates = opcoes.templates.filter(
        (item) => integracaoId && item.integracao_whatsapp_id === integracaoId,
      );
      const templateId = String(config.template_id || "");
      const template = opcoes.templates.find((item) => item.id === templateId) || null;
      const totalVariaveis = contarVariaveisTemplate(template);
      const variaveis = Array.isArray(config.variaveis)
        ? config.variaveis.map((item) => String(item || ""))
        : [];
      const preview = montarPreviewTemplate(template, variaveis);

      return (
        <>
          <label className={styles.formField} style={{ marginTop: 8 }}>
            <span>Integração WhatsApp</span>
            <select
              value={integracaoId}
              onChange={(event) => atualizarAcao(index, {
                configuracao_json: {
                  ...config,
                  integracao_whatsapp_id: event.target.value,
                  template_id: "",
                  variaveis: [],
                },
              })}
            >
              <option value="">Selecione</option>
              {integracoesDisponiveis.map((item) => <option key={item.id} value={item.id}>{item.nome_conexao}{item.numero ? ` · ${item.numero}` : ""}</option>)}
            </select>
          </label>
          <label className={styles.formField} style={{ marginTop: 8 }}>
            <span>Template</span>
            <select
              value={templateId}
              disabled={!integracaoId}
              onChange={(event) => {
                const novoTemplateId = event.target.value;
                const novoTemplate = opcoes.templates.find((item) => item.id === novoTemplateId) || null;
                atualizarAcao(index, {
                  configuracao_json: {
                    ...config,
                    template_id: novoTemplateId,
                    variaveis: variaveisPadrao(contarVariaveisTemplate(novoTemplate)),
                  },
                });
              }}
            >
              <option value="">{integracaoId ? "Selecione" : "Selecione primeiro a integração"}</option>
              {templates.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </select>
          </label>

          {template && totalVariaveis > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "var(--crm-text-muted)", marginBottom: 8 }}>
                Este template usa <strong>{totalVariaveis}</strong> variável(is). Informe qual dado substituirá cada marcador.
              </div>
              {Array.from({ length: totalVariaveis }, (_, posicao) => (
                <label className={styles.formField} style={{ marginTop: posicao ? 8 : 0 }} key={`${template.id}-variavel-${posicao}`}>
                  <span>Variável {posicao + 1} · {`{{${posicao + 1}}}`}</span>
                  <input
                    list="rotina-automacao-variaveis-whatsapp"
                    value={variaveis[posicao] || ""}
                    onChange={(event) => {
                      const novas = Array.from({ length: totalVariaveis }, (_, itemIndex) => variaveis[itemIndex] || "");
                      novas[posicao] = event.target.value;
                      configAcao(index, "variaveis", novas);
                    }}
                    placeholder={VARIAVEIS_PADRAO[posicao] || "nome_da_variavel"}
                  />
                </label>
              ))}
              <datalist id="rotina-automacao-variaveis-whatsapp">
                {variaveisWhatsappSugeridas.map((variavel) => <option value={variavel} key={variavel} />)}
              </datalist>
            </div>
          ) : null}

          {template ? (
            <div
              style={{
                marginTop: 12,
                border: "1px solid var(--crm-border)",
                borderRadius: 16,
                padding: 12,
                background: "var(--crm-surface-soft, rgba(15, 23, 42, 0.03))",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crm-text-muted)", marginBottom: 8 }}>
                Prévia do disparo
              </div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5,
                  borderRadius: "14px 14px 4px 14px",
                  padding: "12px 14px",
                  background: "rgba(34, 197, 94, 0.12)",
                  border: "1px solid rgba(34, 197, 94, 0.22)",
                  fontSize: 13,
                }}
              >
                <strong style={{ display: "block", marginBottom: 6 }}>{template.nome}</strong>
                {preview}
              </div>
            </div>
          ) : null}
        </>
      );
    }

    if (acao.tipo_acao === "email.enviar") {
      return (
        <>
          <label className={styles.formField} style={{ marginTop: 8 }}><span>Assunto</span><input value={String(config.assunto || "")} onChange={(event) => configAcao(index, "assunto", event.target.value)} placeholder="Assunto do e-mail" /></label>
          <label className={styles.formField} style={{ marginTop: 8 }}><span>Mensagem</span><input value={String(config.mensagem || "")} onChange={(event) => configAcao(index, "mensagem", event.target.value)} placeholder="Mensagem" /></label>
        </>
      );
    }

    if (acao.tipo_acao === "contato.adicionar_etiqueta") {
      return (
        <label className={styles.formField} style={{ marginTop: 8 }}>
          <span>Etiqueta</span>
          <select value={String(config.etiqueta_id || "")} onChange={(event) => configAcao(index, "etiqueta_id", event.target.value)}>
            <option value="">Selecione</option>
            {opcoes.etiquetas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
          </select>
        </label>
      );
    }

    if (acao.tipo_acao === "conversa.transferir_setor") {
      const filaGeral = String(config.escopo_fila || "") === "geral";
      const setorId = filaGeral ? "" : String(config.setor_id || "");
      const estrategia = String(config.estrategia_transferencia || "fila_setor");
      const usuariosElegiveis = setorId
        ? opcoes.usuarios.filter(
            (usuario) => usuario.is_administrador || usuario.setor_ids.includes(setorId),
          )
        : [];

      return (
        <>
          <label className={styles.formField} style={{ marginTop: 8 }}>
            <span>Escopo da fila</span>
            <select
              value={filaGeral ? "geral" : "setor"}
              onChange={(event) => {
                const geral = event.target.value === "geral";
                atualizarAcao(index, {
                  configuracao_json: geral
                    ? {
                        ...config,
                        escopo_fila: "geral",
                        setor_id: "__fila_geral__",
                        estrategia_transferencia: "fila_setor",
                        atendente_id: "",
                      }
                    : {
                        ...config,
                        escopo_fila: "setor",
                        setor_id: "",
                        estrategia_transferencia: "fila_setor",
                        atendente_id: "",
                      },
                });
              }}
            >
              <option value="setor">Fila de um setor</option>
              <option value="geral">Fila geral</option>
            </select>
          </label>

          {!filaGeral ? (
            <>
              <label className={styles.formField} style={{ marginTop: 8 }}>
                <span>Setor</span>
                <select
                  value={setorId}
                  onChange={(event) => atualizarAcao(index, {
                    configuracao_json: {
                      ...config,
                      escopo_fila: "setor",
                      setor_id: event.target.value,
                      estrategia_transferencia: "fila_setor",
                      atendente_id: "",
                    },
                  })}
                >
                  <option value="">Selecione</option>
                  {opcoes.setores.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                </select>
              </label>

              <label className={styles.formField} style={{ marginTop: 8 }}>
                <span>Distribuição</span>
                <select
                  value={estrategia}
                  disabled={!setorId}
                  onChange={(event) => {
                    const novaEstrategia = event.target.value;
                    atualizarAcao(index, {
                      configuracao_json: {
                        ...config,
                        estrategia_transferencia: novaEstrategia,
                        atendente_id:
                          novaEstrategia === "atendente_especifico"
                            ? usuariosElegiveis[0]?.id || ""
                            : "",
                      },
                    });
                  }}
                >
                  <option value="fila_setor">Somente fila do setor</option>
                  <option value="atendente_especifico">Atendente específico</option>
                  <option value="rodizio_aleatorio">Rodízio aleatório</option>
                  <option value="menos_conversas">Atendente com menos conversas</option>
                </select>
              </label>

              {estrategia === "atendente_especifico" ? (
                <label className={styles.formField} style={{ marginTop: 8 }}>
                  <span>Atendente</span>
                  <select
                    value={String(config.atendente_id || "")}
                    disabled={!setorId}
                    onChange={(event) => configAcao(index, "atendente_id", event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {usuariosElegiveis.map((usuario) => (
                      <option key={usuario.id} value={usuario.id}>
                        {usuario.nome || "Usuário"}{usuario.is_administrador ? " · Administrador" : ""}
                      </option>
                    ))}
                  </select>
                  {setorId && !usuariosElegiveis.length ? (
                    <small style={{ marginTop: 5, color: "var(--crm-text-muted)" }}>Nenhum atendente ativo disponível para este setor.</small>
                  ) : null}
                </label>
              ) : null}
            </>
          ) : (
            <div className={styles.infoBox} style={{ marginTop: 10 }}>
              <GitBranch size={18} />
              <div><b>Fila geral</b><p>A conversa ficará disponível na fila geral sem ser vinculada a um setor específico.</p></div>
            </div>
          )}
        </>
      );
    }

    if (acao.tipo_acao === "agenda.atualizar_status") {
      return (
        <label className={styles.formField} style={{ marginTop: 8 }}><span>Novo status</span><select value={String(config.status || "confirmado")} onChange={(event) => configAcao(index, "status", event.target.value)}><option value="agendado">Agendado</option><option value="confirmado">Confirmado</option><option value="realizado">Realizado</option><option value="cancelado">Cancelado</option><option value="faltou">Faltou</option></select></label>
      );
    }

    if (acao.tipo_acao === "integracao.consultar_api") {
      return (
        <>
          <label className={styles.formField} style={{ marginTop: 8 }}><span>Conexão</span><select value={String(config.integracao_id || "")} onChange={(event) => configAcao(index, "integracao_id", event.target.value)}><option value="">Selecione</option>{opcoes.integracoes_api.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
          <label className={styles.formField} style={{ marginTop: 8 }}><span>Endpoint</span><input value={String(config.endpoint || "")} onChange={(event) => configAcao(index, "endpoint", event.target.value)} placeholder="/clientes" /></label>
        </>
      );
    }

    return null;
  }

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label={form.id ? "Editar automação" : "Criar automação"}>
        <header className={styles.modalHeader}>
          <div><span className={styles.modalBadge}><Zap size={14} /> {form.id ? "Editar automação" : "Nova automação"}</span><h2>{form.id ? form.nome : "Monte sua rotina automática"}</h2><p>Configure origem, gatilho, condições e ações sem misturar com o editor de Fluxos.</p></div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </header>

        <div className={styles.steps}>
          {[{ n: 1, titulo: "Origem", sub: "O que será observado" }, { n: 2, titulo: "Quando", sub: "Gatilho da rotina" }, { n: 3, titulo: "Se", sub: "Condições opcionais" }, { n: 4, titulo: "Então", sub: "Ações do CRM" }].map((item) => (
            <button key={item.n} className={`${styles.step} ${etapa === item.n ? styles.stepActive : ""} ${etapa > item.n ? styles.stepDone : ""}`} onClick={() => mudarEtapa(item.n)}><span>{etapa > item.n ? <Check size={13} /> : item.n}</span><div><b>{item.titulo}</b><small>{item.sub}</small></div></button>
          ))}
        </div>

        <div className={styles.modalBody}>
          {etapa === 1 ? (
            <div className={styles.stepContent}>
              <div className={styles.stepHeading}><span>ETAPA 1 DE 4</span><h3>O que você quer automatizar?</h3><p>A origem organiza os gatilhos e campos disponíveis, sem limitar as ações que podem ser combinadas.</p></div>
              <label className={styles.formField}><span>Nome da automação *</span><input value={form.nome} onChange={(event) => onChange({ ...form, nome: event.target.value })} placeholder="Ex.: Cobrar confirmação 6h antes" /></label>
              <label className={styles.formField} style={{ marginTop: 12 }}><span>Descrição</span><input value={form.descricao} onChange={(event) => onChange({ ...form, descricao: event.target.value })} placeholder="Explique de forma curta o objetivo da rotina" /></label>
              <label className={styles.formField} style={{ marginTop: 12 }}>
                <span>Integração WhatsApp</span>
                <select value={integracaoAutomacaoId} onChange={(event) => selecionarIntegracaoAutomacao(event.target.value)}>
                  <option value="">Todas as integrações</option>
                  {integracoesAtivas.map((item) => <option key={item.id} value={item.id}>{item.nome_conexao}{item.numero ? ` · ${item.numero}` : ""}</option>)}
                </select>
                <small style={{ marginTop: 5, color: "var(--crm-text-muted)" }}>
                  {integracaoAutomacaoId
                    ? "A rotina só será avaliada para eventos desta integração."
                    : "A rotina poderá ser avaliada para qualquer integração WhatsApp da empresa."}
                </small>
              </label>
              <div className={styles.querySelection}>{categorias.map((item) => <button key={item.id} className={form.categoria === item.id ? styles.queryOptionActive : ""} onClick={() => selecionarCategoria(item.id)}><div className={styles.queryOptionIcon}><Database size={18} /></div><div><b>{item.nome}</b><small>{item.descricao}</small></div><span className={styles.radio}>{form.categoria === item.id ? <Check size={12} /> : null}</span></button>)}</div>
            </div>
          ) : null}

          {etapa === 2 ? (
            <div className={styles.stepContent}>
              <div className={styles.stepHeading}><span>ETAPA 2 DE 4</span><h3>Quando a automação deve começar?</h3><p>Selecione um evento do CRM ou uma referência de tempo.</p></div>
              <label className={styles.formField}><span>Gatilho *</span><select value={form.gatilho.evento} onChange={(event) => selecionarEvento(event.target.value)}>{gatilhos.map((item) => <option key={item.evento} value={item.evento}>{item.nome}</option>)}</select></label>
              {form.categoria === "agenda" ? <label className={styles.formField} style={{ marginTop: 12 }}><span>Calendário</span><select value={String(form.gatilho.configuracao_json.calendario_id || "")} onChange={(event) => onChange({ ...form, gatilho: { ...form.gatilho, configuracao_json: { ...form.gatilho.configuracao_json, calendario_id: event.target.value || null } } })}><option value="">Todos os calendários</option>{opcoes.calendarios.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label> : null}
              {form.gatilho.tipo === "data_relativa" ? <div className={styles.scheduleGrid}><label className={styles.formField}><span>Antecedência / intervalo</span><input type="number" min="1" value={quantidadeOffset(form.gatilho)} onChange={(event) => alterarOffset(Number(event.target.value || 1))} /></label><label className={styles.formField}><span>Unidade</span><select value={unidadeOffset(form.gatilho)} onChange={(event) => alterarOffset(quantidadeOffset(form.gatilho), event.target.value)}><option value="minutos">Minutos</option><option value="horas">Horas</option><option value="dias">Dias</option></select></label></div> : null}
              <div className={styles.infoBox}><CalendarClock size={19} /><div><b>{gatilhoLabel(form.gatilho)}</b><p>O motor usará esse gatilho como ponto de entrada da rotina.</p></div></div>
            </div>
          ) : null}

          {etapa === 3 ? (
            <div className={styles.stepContent}>
              <div className={styles.stepHeading}><span>ETAPA 3 DE 4</span><h3>Existe alguma condição?</h3><p>Sem condições, todo evento que atender ao gatilho poderá iniciar a rotina.</p></div>
              <div className={styles.reviewGrid}>{form.condicoes.map((condicao, index) => <div key={`${condicao.campo}-${index}`}><span>CONDIÇÃO {index + 1}</span><label className={styles.formField}><span>Campo</span><select value={condicao.campo} onChange={(event) => atualizarCondicao(index, { campo: event.target.value })}>{campos.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className={styles.formField} style={{ marginTop: 8 }}><span>Operador</span><select value={condicao.operador} onChange={(event) => atualizarCondicao(index, { operador: event.target.value as Operador })}>{operadores.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{permiteValor(condicao.operador) ? <label className={styles.formField} style={{ marginTop: 8 }}><span>Valor</span><input value={valorComoTexto(condicao.valor_json)} onChange={(event) => atualizarCondicao(index, { valor_json: event.target.value })} placeholder="Valor esperado" /></label> : null}<button className={styles.ghostButton} style={{ marginTop: 10 }} onClick={() => removerCondicao(index)}><Trash2 size={15} /> Remover</button></div>)}</div>
              <button className={styles.secondaryButton} style={{ marginTop: 15 }} onClick={adicionarCondicao}><Plus size={16} /> Adicionar condição</button>
            </div>
          ) : null}

          {etapa === 4 ? (
            <div className={styles.stepContent}>
              <div className={styles.stepHeading}><span>ETAPA 4 DE 4</span><h3>O que o CRM deve fazer?</h3><p>Combine uma ou mais ações. A ordem será preservada pelo motor.</p></div>
              {alertaDisparosMultiIntegracao ? (
                <div className={styles.infoBox} style={{ marginBottom: 14, borderColor: "rgba(245, 158, 11, .45)", background: "rgba(245, 158, 11, .08)" }}>
                  <AlertTriangle size={19} />
                  <div>
                    <b>Configure um disparo para cada integração</b>
                    <p>
                      Esta automação funciona em todas as integrações. Adicione uma ação “Enviar disparo WhatsApp” para cada número ativo. Falta configurar: {alertaDisparosMultiIntegracao.map((item) => item.nome_conexao).join(", ")}.
                    </p>
                  </div>
                </div>
              ) : null}
              <div className={styles.reviewGrid}>{form.acoes.map((acao, index) => <div key={`${acao.tipo_acao}-${index}`}><span>AÇÃO {index + 1}</span><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><AcaoIcon tipo={acao.tipo_acao} /><strong>{acaoLabel(acao.tipo_acao)}</strong></div><label className={styles.formField}><span>Tipo de ação</span><select value={acao.tipo_acao} onChange={(event) => atualizarAcao(index, { tipo_acao: event.target.value, configuracao_json: configuracaoAoSelecionarAcao(event.target.value) })}>{acoesDisponiveis.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{renderConfigAcao(acao, index)}<button className={styles.ghostButton} style={{ marginTop: 10 }} onClick={() => removerAcao(index)} disabled={form.acoes.length === 1}><Trash2 size={15} /> Remover</button></div>)}</div>
              <button className={styles.secondaryButton} style={{ marginTop: 15 }} onClick={adicionarAcao}><Plus size={16} /> Adicionar ação</button>
              <div className={styles.scheduleSummary}><Zap size={19} /><div><b>Resumo</b><p>{resumo}.</p></div></div>
            </div>
          ) : null}
        </div>

        <footer className={styles.modalFooter}>
          <button className={styles.ghostButton} onClick={() => etapa === 1 ? onClose() : mudarEtapa(etapa - 1)}>{etapa === 1 ? "Cancelar" : "Voltar"}</button>
          {etapa < 4 ? <button className={styles.primaryButton} onClick={() => mudarEtapa(etapa + 1)} disabled={etapa === 1 && !form.nome.trim()}>Continuar <ArrowRight size={17} /></button> : <button className={styles.primaryButton} onClick={onSave} disabled={salvando || !form.nome.trim() || !form.acoes.length}>{salvando ? <Loader2 size={17} className={styles.spinning} /> : <Zap size={17} />} Salvar automação</button>}
        </footer>
      </section>
    </div>
  );
}
