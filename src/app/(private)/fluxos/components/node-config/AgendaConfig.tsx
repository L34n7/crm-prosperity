"use client";

import TemplateVariableCombobox, {
  type TemplateVariableOption,
} from "@/components/TemplateVariableCombobox";
import type {
  AgendaOpcao,
  PreviewTemplateWhatsapp,
  TemplateWhatsappOpcao,
} from "../../types";
import styles from "../../fluxos.module.css";

type CustoPreview = {
  categoria: string;
  totalCobrados: number;
  valorTotalUsd: number;
  valorTotalBrlMin: number;
  valorTotalBrlMax: number;
};

type AgendaConfigProps = {
  tipoNode: string;
  fluxoSistemaCalendario: boolean;
  fluxoTemBuscaQualquerCalendario: boolean;
  agendas: AgendaOpcao[];
  carregandoAgendas: boolean;
  agendaId: string;
  usarContexto: boolean;
  listarAgendamentos: boolean;
  quantidadeOpcoes: string;
  janelaDias: string;
  mensagemSemHorarios: string;
  mensagemSemExpediente: string;
  mensagemDataInvalida: string;
  mensagemListarAgendamentos: string;
  mensagemListarHorarios: string;
  mensagemPreferenciaIndisponivel: string;
  mensagemConflito: string;
  statusAgendamento: string;
  enviarEmail: boolean;
  emailOrigem: "contato" | "variavel";
  emailVariavel: string;
  lembreteAtivo: boolean;
  lembreteQuantidade: string;
  lembreteUnidade: "minutos" | "horas" | "dias";
  lembreteWhatsapp: boolean;
  lembreteEmail: boolean;
  lembreteTemplateId: string;
  lembreteVariaveis: string;
  motivoCancelamento: string;
  templates: TemplateWhatsappOpcao[];
  carregandoTemplates: boolean;
  templateLembreteSelecionado: TemplateWhatsappOpcao | null;
  indicesVariaveisLembrete: number[];
  opcoesVariaveisFluxo: TemplateVariableOption[];
  opcoesVariaveisAgendamento: TemplateVariableOption[];
  loadingVariaveis: boolean;
  previewLembrete: PreviewTemplateWhatsapp | null;
  loadingCusto: boolean;
  custo: CustoPreview | null;
  onAgendaIdChange: (valor: string) => void;
  onUsarContextoChange: (valor: boolean) => void;
  onListarAgendamentosChange: (valor: boolean) => void;
  onQuantidadeOpcoesChange: (valor: string) => void;
  onJanelaDiasChange: (valor: string) => void;
  onMensagemSemHorariosChange: (valor: string) => void;
  onMensagemSemExpedienteChange: (valor: string) => void;
  onMensagemDataInvalidaChange: (valor: string) => void;
  onMensagemListarAgendamentosChange: (valor: string) => void;
  onMensagemListarHorariosChange: (valor: string) => void;
  onMensagemPreferenciaIndisponivelChange: (valor: string) => void;
  onMensagemConflitoChange: (valor: string) => void;
  onStatusAgendamentoChange: (valor: string) => void;
  onEnviarEmailChange: (valor: boolean) => void;
  onEmailOrigemChange: (valor: "contato" | "variavel") => void;
  onEmailVariavelChange: (valor: string) => void;
  onLembreteAtivoChange: (valor: boolean) => void;
  onLembreteQuantidadeChange: (valor: string) => void;
  onLembreteUnidadeChange: (valor: "minutos" | "horas" | "dias") => void;
  onLembreteWhatsappChange: (valor: boolean) => void;
  onLembreteEmailChange: (valor: boolean) => void;
  onLembreteTemplateIdChange: (valor: string) => void;
  onLembreteVariavelChange: (index: number, chave: string) => void;
  onMotivoCancelamentoChange: (valor: string) => void;
  onGerenciarVariaveisLembrete: () => void;
};

function linhasVariaveis(valor: string) {
  const linhas = String(valor || "").split("\n");
  return [linhas[0] || "", linhas[1] || "", linhas[2] || ""];
}

export default function AgendaConfig(props: AgendaConfigProps) {
  const {
    tipoNode,
    fluxoSistemaCalendario,
    fluxoTemBuscaQualquerCalendario,
    agendas,
    carregandoAgendas,
    agendaId,
    usarContexto,
    listarAgendamentos,
    quantidadeOpcoes,
    janelaDias,
    mensagemSemHorarios,
    mensagemSemExpediente,
    mensagemDataInvalida,
    mensagemListarAgendamentos,
    mensagemListarHorarios,
    mensagemPreferenciaIndisponivel,
    mensagemConflito,
    statusAgendamento,
    enviarEmail,
    emailOrigem,
    emailVariavel,
    lembreteAtivo,
    lembreteQuantidade,
    lembreteUnidade,
    lembreteWhatsapp,
    lembreteEmail,
    lembreteTemplateId,
    lembreteVariaveis,
    motivoCancelamento,
    templates,
    carregandoTemplates,
    templateLembreteSelecionado,
    indicesVariaveisLembrete,
    opcoesVariaveisFluxo,
    opcoesVariaveisAgendamento,
    loadingVariaveis,
    previewLembrete,
    loadingCusto,
    custo,
  } = props;

  return (
    <div className={styles.optionsBox}>
      <div>
        <span className={styles.label}>Bloco de agenda</span>
        <p className={styles.help}>
          Use junto com Pergunta, Condições e Mensagens para montar agendamento, remarcacao ou cancelamento.
        </p>
      </div>

      {[
        "agenda_buscar_agendamento",
        "agenda_escolher_horario",
        "agenda_criar_agendamento",
      ].includes(tipoNode) &&
        (fluxoSistemaCalendario &&
        ["agenda_buscar_agendamento", "agenda_escolher_horario"].includes(
          tipoNode
        ) ? (
          <div className={styles.field}>
            <span className={styles.label}>
              {tipoNode === "agenda_buscar_agendamento"
                ? "Origem dos agendamentos"
                : "Calendário"}
            </span>
            <select
              className={styles.input}
              value="automatico_contexto"
              disabled
              aria-label="Configuração automática do calendário"
            >
              <option value="automatico_contexto">
                {tipoNode === "agenda_buscar_agendamento"
                  ? "Automático — botão ou todos os calendários"
                  : "Automático — calendário do agendamento atual"}
              </option>
            </select>
            <span className={styles.help}>
              {tipoNode === "agenda_buscar_agendamento"
                ? "Quando iniciado por um botão, utiliza somente o agendamento correspondente. Quando iniciado por mensagem, pesquisa os compromissos futuros do contato em todos os calendários."
                : "Os horários são consultados no mesmo calendário do agendamento recebido pelo botão ou selecionado durante o fluxo."}
            </span>
          </div>
        ) : (
          <label className={styles.field}>
            <span className={styles.label}>
              {tipoNode === "agenda_criar_agendamento"
                ? "Selecione o calendário"
                : "Calendário"}
            </span>
            <select
              className={styles.input}
              value={
                tipoNode === "agenda_escolher_horario" && usarContexto
                  ? "__calendario_contexto__"
                  : agendaId
              }
              onChange={(e) => {
                const valor = e.target.value;
                if (
                  tipoNode === "agenda_escolher_horario" &&
                  valor === "__calendario_contexto__"
                ) {
                  props.onAgendaIdChange("");
                  props.onUsarContextoChange(true);
                  return;
                }
                props.onUsarContextoChange(false);
                props.onAgendaIdChange(valor);
              }}
              disabled={carregandoAgendas}
            >
              <option value="">
                {tipoNode === "agenda_buscar_agendamento"
                  ? "Qualquer calendário"
                  : carregandoAgendas
                  ? "Carregando calendários..."
                  : "Selecione um calendário ativo"}
              </option>
              {tipoNode === "agenda_escolher_horario" &&
                fluxoTemBuscaQualquerCalendario && (
                  <option value="__calendario_contexto__">
                    Calendário do contexto
                  </option>
                )}
              {agendas.map((agenda) => (
                <option key={agenda.id} value={agenda.id}>
                  {agenda.nome} - {agenda.duracao_minutos}min
                </option>
              ))}
            </select>
          </label>
        ))}

      {tipoNode === "agenda_escolher_horario" && (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Mensagem ao listar horários</span>
            <textarea
              className={styles.textarea}
              value={mensagemListarHorarios}
              onChange={(e) => props.onMensagemListarHorariosChange(e.target.value)}
            />
            <span className={styles.help}>
              Variaveis: {"{{agenda_data_nova}}"} e {"{{calendario_nome_novo}}"}.
            </span>
          </label>

          <div className={styles.optionRow}>
            <label className={styles.field}>
              <span className={styles.label}>Opcoes enviadas</span>
              <input
                type="number"
                min={1}
                max={10}
                className={styles.input}
                value={quantidadeOpcoes}
                onChange={(e) => props.onQuantidadeOpcoesChange(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Buscar por dias</span>
              <input
                type="number"
                min={1}
                max={60}
                className={styles.input}
                value={janelaDias}
                onChange={(e) => props.onJanelaDiasChange(e.target.value)}
              />
            </label>
          </div>

          <label className={styles.field}>
            <span className={styles.label}>
              Mensagem se o horário pedido estiver ocupado
            </span>
            <textarea
              className={styles.textarea}
              value={mensagemPreferenciaIndisponivel}
              onChange={(e) =>
                props.onMensagemPreferenciaIndisponivelChange(e.target.value)
              }
            />
            <span className={styles.help}>
              Variaveis: {"{{agenda_data_nova}}"}, {"{{agenda_hora_solicitada}}"} e {"{{agenda_preferencia_solicitada}}"}.
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Mensagem para data passada</span>
            <textarea
              className={styles.textarea}
              value={mensagemDataInvalida}
              onChange={(e) => props.onMensagemDataInvalidaChange(e.target.value)}
            />
            <span className={styles.help}>
              Variaveis: {"{{agenda_data_informada}}"} e {"{{agenda_data_sugestao_ano}}"}.
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Mensagem sem horários</span>
            <textarea
              className={styles.textarea}
              value={mensagemSemHorarios}
              onChange={(e) => props.onMensagemSemHorariosChange(e.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Mensagem sem expediente</span>
            <textarea
              className={styles.textarea}
              value={mensagemSemExpediente}
              onChange={(e) => props.onMensagemSemExpedienteChange(e.target.value)}
            />
            <span className={styles.help}>
              Use quando o dia pedido nao tem horario configurado na agenda. Variavel: {"{{agenda_data_nova}}"}.
            </span>
          </label>
        </>
      )}

      {tipoNode === "agenda_buscar_agendamento" && (
        <>
          <label className={styles.switchField}>
            <input
              type="checkbox"
              checked={listarAgendamentos}
              onChange={(e) => props.onListarAgendamentosChange(e.target.checked)}
            />
            <div>
              <strong>Listar quando houver vários agendamentos</strong>
              <p>
                Quando houver mais de um agendamento futuro, envia as opções e aguarda o contato responder o número.
              </p>
            </div>
          </label>

          {listarAgendamentos && (
            <>
              <label className={styles.field}>
                <span className={styles.label}>Mensagem para vários agendamentos</span>
                <textarea
                  className={styles.textarea}
                  value={mensagemListarAgendamentos}
                  onChange={(e) =>
                    props.onMensagemListarAgendamentosChange(e.target.value)
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Agendamentos enviados</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className={styles.input}
                  value={quantidadeOpcoes}
                  onChange={(e) => props.onQuantidadeOpcoesChange(e.target.value)}
                />
              </label>
            </>
          )}

          <label className={styles.field}>
            <span className={styles.label}>Mensagem quando não encontrar</span>
            <textarea
              className={styles.textarea}
              value={mensagemSemHorarios}
              onChange={(e) => props.onMensagemSemHorariosChange(e.target.value)}
            />
          </label>
          <p className={styles.help}>
            Este bloco escolhe a proxima conexao usando respostas internas. Crie conexoes do tipo Exata com os valores: encontrado, nao_encontrado e, se quiser tratar falhas, erro. Exemplo: encontrado continua o fluxo; nao_encontrado vai para Transferir.
          </p>
        </>
      )}

      {["agenda_criar_agendamento", "agenda_remarcar_agendamento"].includes(
        tipoNode
      ) && (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Status do agendamento</span>
            <select
              className={styles.input}
              value={statusAgendamento}
              onChange={(e) => props.onStatusAgendamentoChange(e.target.value)}
            >
              <option value="agendado">Agendado</option>
              <option value="confirmado">Confirmado</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>
              Mensagem se o horário ficar indisponível
            </span>
            <textarea
              className={styles.textarea}
              value={mensagemConflito}
              onChange={(e) => props.onMensagemConflitoChange(e.target.value)}
            />
          </label>
        </>
      )}

      <span className={styles.help}>
        Variaveis principais: {"{{agenda_data}}"}, {"{{agenda_hora}}"}, {"{{agenda_data_nova}}"}, {"{{agenda_hora_nova}}"} e {"{{agenda_agendamento_id}}"}.
      </span>

      {tipoNode === "agenda_remarcar_agendamento" && (
        <>
          <label className={styles.switchField}>
            <input
              type="checkbox"
              checked={enviarEmail}
              onChange={(e) => props.onEnviarEmailChange(e.target.checked)}
            />
            <div>
              <strong>Enviar email de confirmacao</strong>
              <p>
                O email sera enviado assim que o agendamento for remarcado, usando o mesmo formato do bloco Criar agendamento.
              </p>
            </div>
          </label>
          {enviarEmail && (
            <>
              <label className={styles.field}>
                <span className={styles.label}>Origem do email</span>
                <select
                  className={styles.input}
                  value={emailOrigem}
                  onChange={(e) =>
                    props.onEmailOrigemChange(
                      e.target.value === "variavel" ? "variavel" : "contato"
                    )
                  }
                >
                  <option value="contato">Email cadastrado no contato</option>
                  <option value="variavel">Email salvo em uma variável</option>
                </select>
                <span className={styles.help}>
                  Informe qual email o sistema vai usar, email do Contato ou uma variavel do bloco Capturar resposta.
                </span>
              </label>
              {emailOrigem === "variavel" && (
                <label className={styles.field}>
                  <span className={styles.label}>Variavel do email</span>
                  <input
                    className={styles.input}
                    value={emailVariavel}
                    onChange={(e) => props.onEmailVariavelChange(e.target.value)}
                    placeholder="email"
                  />
                  <span className={styles.help}>
                    Use o nome da variavel criada em Capturar resposta. Exemplo: email.
                  </span>
                </label>
              )}
            </>
          )}
        </>
      )}

      {tipoNode === "agenda_criar_agendamento" && (
        <>
          <label className={styles.switchField}>
            <input
              type="checkbox"
              checked={enviarEmail}
              onChange={(e) => props.onEnviarEmailChange(e.target.checked)}
            />
            <div>
              <strong>Enviar email de confirmacao</strong>
              <p>
                O email será enviado para o contato que está agendando. Selecione a origem do email abaixo.
              </p>
            </div>
          </label>

          {(enviarEmail || (lembreteAtivo && lembreteEmail)) && (
            <>
              <label className={styles.field}>
                <span className={styles.label}>Origem do email</span>
                <select
                  className={styles.input}
                  value={emailOrigem}
                  onChange={(e) =>
                    props.onEmailOrigemChange(
                      e.target.value === "variavel" ? "variavel" : "contato"
                    )
                  }
                >
                  <option value="contato">Email cadastrado no contato</option>
                  <option value="variavel">Email salvo em uma variavel</option>
                </select>
                <span className={styles.help}>
                  Informe qual email o sistema vai usar, email do Contato ou uma variável do bloco Capturar resposta.
                </span>
              </label>
              {emailOrigem === "variavel" && (
                <TemplateVariableCombobox
                  label="Variável do email"
                  value={emailVariavel}
                  onChange={props.onEmailVariavelChange}
                  options={opcoesVariaveisFluxo}
                  loading={loadingVariaveis}
                />
              )}
            </>
          )}

          <label className={styles.switchField}>
            <input
              type="checkbox"
              checked={lembreteAtivo}
              onChange={(e) => props.onLembreteAtivoChange(e.target.checked)}
            />
            <div>
              <strong>Enviar lembrete antes do agendamento</strong>
              <p>
                Agenda um template WhatsApp, email ou ambos antes do horario marcado.
              </p>
            </div>
          </label>

          {lembreteAtivo && (
            <>
              <div className={styles.optionRow}>
                <label className={styles.field}>
                  <span className={styles.label}>Enviar antes</span>
                  <input
                    type="number"
                    min={1}
                    className={styles.input}
                    value={lembreteQuantidade}
                    onChange={(e) =>
                      props.onLembreteQuantidadeChange(e.target.value)
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Unidade</span>
                  <select
                    className={styles.input}
                    value={lembreteUnidade}
                    onChange={(e) =>
                      props.onLembreteUnidadeChange(
                        e.target.value === "minutos"
                          ? "minutos"
                          : e.target.value === "dias"
                          ? "dias"
                          : "horas"
                      )
                    }
                  >
                    <option value="minutos">Minutos</option>
                    <option value="horas">Horas</option>
                    <option value="dias">Dias</option>
                  </select>
                </label>
              </div>

              <label className={styles.switchField}>
                <input
                  type="checkbox"
                  checked={lembreteWhatsapp}
                  onChange={(e) =>
                    props.onLembreteWhatsappChange(e.target.checked)
                  }
                />
                <div>
                  <strong>Lembrete por WhatsApp</strong>
                  <p>
                    Usa um template aprovado. Templates com botoes podem capturar confirmar, remarcar ou cancelar.
                  </p>
                </div>
              </label>

              {lembreteWhatsapp && (
                <>
                  <div className={styles.agendarDisparoCostAlert}>
                    <div className={styles.agendarDisparoCostAlertIcon}>⚠</div>
                    <div className={styles.agendarDisparoCostAlertContent}>
                      <strong>
                        Este lembrete gera um disparo oficial do WhatsApp
                      </strong>
                      <p>
                        O envio usara template aprovado e podera gerar cobranca da Meta quando o lembrete ocorrer.
                      </p>
                    </div>
                  </div>

                  <label className={styles.field}>
                    <span className={styles.label}>Template WhatsApp</span>
                    <select
                      className={styles.input}
                      value={lembreteTemplateId}
                      onChange={(e) =>
                        props.onLembreteTemplateIdChange(e.target.value)
                      }
                      disabled={carregandoTemplates}
                    >
                      <option value="">
                        {carregandoTemplates
                          ? "Carregando templates..."
                          : "Selecione um template aprovado"}
                      </option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.nome} - {template.idioma}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className={styles.field}>
                    {indicesVariaveisLembrete.length > 0 && (
                      <>
                        <span className={styles.label}>Variaveis do template</span>
                        <div
                          className={`${styles.templateVariableGrid} ${styles.templateVariableStack}`}
                        >
                          {indicesVariaveisLembrete.map((index) => (
                            <TemplateVariableCombobox
                              key={index}
                              label={`Variável ${index + 1}`}
                              value={linhasVariaveis(lembreteVariaveis)[index]}
                              onChange={(chave) =>
                                props.onLembreteVariavelChange(index, chave)
                              }
                              options={opcoesVariaveisAgendamento}
                              loading={loadingVariaveis}
                            />
                          ))}
                        </div>
                        <span className={styles.help}>
                          Variavel 1 substitui {"{{1}}"}, Variavel 2 substitui {"{{2}}"} e Variavel 3 substitui {"{{3}}"}.
                        </span>
                        <button
                          type="button"
                          className={styles.inlineVariablesButton}
                          onClick={props.onGerenciarVariaveisLembrete}
                        >
                          Gerenciar variáveis
                        </button>
                      </>
                    )}

                    <div className={styles.templatePreviewCard}>
                      <div className={styles.templatePreviewTop}>
                        <strong>Previa WhatsApp</strong>
                        <span>
                          {templateLembreteSelecionado?.nome || "Template"}
                        </span>
                      </div>
                      {previewLembrete ? (
                        <div className={styles.whatsappPreviewArea}>
                          <div className={styles.whatsappBubble}>
                            <strong className={styles.whatsappPreviewTitle}>
                              {previewLembrete.titulo}
                            </strong>
                            <p className={styles.whatsappPreviewText}>
                              {previewLembrete.corpo}
                            </p>
                            <div className={styles.whatsappPreviewMeta}>
                              <span className={styles.whatsappPreviewFooter}>
                                {previewLembrete.rodape}
                              </span>
                              <span className={styles.whatsappPreviewTime}>
                                {new Date().toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            {previewLembrete.botoes.map((texto, index) => (
                              <div
                                key={`${texto}-${index}`}
                                className={styles.whatsappPreviewButton}
                              >
                                ↩ {texto}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className={styles.previewEmptyState}>
                          Selecione um template aprovado para visualizar a mensagem.
                        </div>
                      )}
                    </div>

                    <div className={styles.agendarDisparoCostPreviewCard}>
                      <div className={styles.costPreviewTop}>
                        <span className={styles.costPreviewLabel}>
                          Estimativa de custo Meta
                        </span>
                        <span className={styles.costPreviewCategory}>
                          {templateLembreteSelecionado?.categoria || "Categoria"}
                        </span>
                      </div>
                      {loadingCusto ? (
                        <p className={styles.costPreviewMuted}>
                          Calculando estimativa...
                        </p>
                      ) : custo ? (
                        <>
                          <strong className={styles.costPreviewValue}>
                            R$ {custo.valorTotalBrlMin.toFixed(2)} ~ R$ {custo.valorTotalBrlMax.toFixed(2)}
                          </strong>
                          <p className={styles.costPreviewMeta}>
                            USD: US$ {custo.valorTotalUsd.toFixed(4)} · Cobrado: {custo.totalCobrados} contato
                          </p>
                          <p className={styles.costPreviewHelp}>
                            Esta é uma estimativa para 1 contato. A cobrança real pode variar conforme categoria do template, país do contato, cotação, impostos e regras da Meta.
                          </p>
                        </>
                      ) : (
                        <p className={styles.costPreviewMuted}>
                          Selecione um template aprovado para visualizar a estimativa.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              <label className={styles.switchField}>
                <input
                  type="checkbox"
                  checked={lembreteEmail}
                  onChange={(e) => props.onLembreteEmailChange(e.target.checked)}
                />
                <div>
                  <strong>Lembrete por email</strong>
                  <p>
                    Envia um email simples de lembrete usando a mesma origem de email configurada acima.
                  </p>
                </div>
              </label>
            </>
          )}
        </>
      )}

      {tipoNode === "agenda_cancelar_agendamento" && (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Status final</span>
            <select
              className={styles.input}
              value={statusAgendamento}
              onChange={(e) => props.onStatusAgendamentoChange(e.target.value)}
            >
              <option value="cancelado">Cancelado</option>
              <option value="faltou">Faltou</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Motivo</span>
            <input
              className={styles.input}
              value={motivoCancelamento}
              onChange={(e) =>
                props.onMotivoCancelamentoChange(e.target.value)
              }
            />
          </label>
          <label className={styles.switchField}>
            <input
              type="checkbox"
              checked={enviarEmail}
              onChange={(e) => props.onEnviarEmailChange(e.target.checked)}
            />
            <div>
              <strong>Enviar email de cancelamento</strong>
              <p>
                O email sera enviado assim que o agendamento for cancelado, usando o mesmo formato dos emails de agendamento.
              </p>
            </div>
          </label>
          {enviarEmail && (
            <>
              <label className={styles.field}>
                <span className={styles.label}>Origem do email</span>
                <select
                  className={styles.input}
                  value={emailOrigem}
                  onChange={(e) =>
                    props.onEmailOrigemChange(
                      e.target.value === "variavel" ? "variavel" : "contato"
                    )
                  }
                >
                  <option value="contato">Email cadastrado no contato</option>
                  <option value="variavel">Email salvo em uma variavel</option>
                </select>
                <span className={styles.help}>
                  Informe qual email o sistema vai usar, email do Contato ou uma variavel do bloco Capturar resposta.
                </span>
              </label>
              {emailOrigem === "variavel" && (
                <label className={styles.field}>
                  <span className={styles.label}>Variavel do email</span>
                  <input
                    className={styles.input}
                    value={emailVariavel}
                    onChange={(e) => props.onEmailVariavelChange(e.target.value)}
                    placeholder="email"
                  />
                  <span className={styles.help}>
                    Use o nome da variavel criada em Capturar resposta. Exemplo: email.
                  </span>
                </label>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
