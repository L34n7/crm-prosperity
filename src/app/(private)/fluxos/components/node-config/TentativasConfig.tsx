"use client";

import type {
  AtendenteOpcao,
  EscopoFilaNode,
  EstrategiaTransferenciaNode,
  SetorOpcao,
} from "../../types";
import styles from "../../fluxos.module.css";

type TentativasConfigProps = {
  maxInvalidas: string;
  maxSemResposta: string;
  acao: string;
  escopoFila: EscopoFilaNode;
  setor: string;
  incluirAdministradores: boolean;
  estrategia: EstrategiaTransferenciaNode;
  atendente: string;
  mensagem: string;
  notificarSistema: boolean;
  notificarEmail: boolean;
  carregandoSetores: boolean;
  possuiAdministradorAtivo: boolean;
  distribuicaoAutomaticaPermitida: boolean;
  setores: SetorOpcao[];
  atendentesElegiveis: AtendenteOpcao[];
  onMaxInvalidasChange: (valor: string) => void;
  onMaxSemRespostaChange: (valor: string) => void;
  onAcaoChange: (valor: string) => void;
  onEscopoFilaChange: (valor: EscopoFilaNode) => void;
  onSetorChange: (valor: string) => void;
  onIncluirAdministradoresChange: (valor: boolean) => void;
  onEstrategiaChange: (valor: EstrategiaTransferenciaNode) => void;
  onAtendenteChange: (valor: string) => void;
  onMensagemChange: (valor: string) => void;
  onNotificarSistemaChange: (valor: boolean) => void;
  onNotificarEmailChange: (valor: boolean) => void;
};

export default function TentativasConfig({
  maxInvalidas,
  maxSemResposta,
  acao,
  escopoFila,
  setor,
  incluirAdministradores,
  estrategia,
  atendente,
  mensagem,
  notificarSistema,
  notificarEmail,
  carregandoSetores,
  possuiAdministradorAtivo,
  distribuicaoAutomaticaPermitida,
  setores,
  atendentesElegiveis,
  onMaxInvalidasChange,
  onMaxSemRespostaChange,
  onAcaoChange,
  onEscopoFilaChange,
  onSetorChange,
  onIncluirAdministradoresChange,
  onEstrategiaChange,
  onAtendenteChange,
  onMensagemChange,
  onNotificarSistemaChange,
  onNotificarEmailChange,
}: TentativasConfigProps) {
  return (
    <div className={styles.tentativasBox}>
      <div>
        <span className={styles.label}>Controle de tentativas</span>
        <p className={styles.help}>
          Evita que o fluxo fique repetindo este bloco em loop.
        </p>
      </div>

      <div className={styles.optionRow}>
        <label className={styles.field}>
          <span className={styles.label}>Respostas inválidas</span>
          <input
            type="number"
            min={1}
            className={styles.input}
            value={maxInvalidas}
            onChange={(e) => onMaxInvalidasChange(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Sem resposta</span>
          <input
            type="number"
            min={1}
            className={styles.input}
            value={maxSemResposta}
            onChange={(e) => onMaxSemRespostaChange(e.target.value)}
          />
        </label>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Quando exceder</span>
        <select
          className={styles.input}
          value={acao}
          onChange={(e) => onAcaoChange(e.target.value)}
        >
          <option value="transferir_atendimento">Transferir para atendimento</option>
          <option value="encerrar_fluxo">Encerrar fluxo</option>
          <option value="reiniciar_fluxo">Reiniciar fluxo</option>
        </select>
      </div>

      {acao === "transferir_atendimento" && (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Escopo da fila</span>
            <select
              className={styles.input}
              value={escopoFila}
              onChange={(e) =>
                onEscopoFilaChange(e.target.value === "geral" ? "geral" : "setor")
              }
            >
              <option value="geral">Fila geral — todos os setores</option>
              <option value="setor">Fila de um setor específico</option>
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Setor do atendimento</span>
            <select
              className={styles.input}
              value={setor}
              onChange={(e) => onSetorChange(e.target.value)}
              disabled={escopoFila === "geral" || carregandoSetores}
            >
              <option value="">Selecione um setor</option>
              {setores.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.switchField}>
            <input
              type="checkbox"
              checked={incluirAdministradores}
              disabled={!setor || !possuiAdministradorAtivo}
              onChange={(e) => onIncluirAdministradoresChange(e.target.checked)}
            />
            <div>
              <strong>Incluir administradores na distribuição</strong>
              <p>
                Quando marcado, administradores participam do rodízio e da distribuição por menor carga mesmo sem vínculo com o setor.
              </p>
            </div>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Distribuição do atendimento</span>
            <select
              className={styles.input}
              value={estrategia}
              onChange={(e) =>
                onEstrategiaChange(e.target.value as EstrategiaTransferenciaNode)
              }
              disabled={escopoFila === "geral" || !setor}
            >
              <option value="fila_setor">Somente fila do setor</option>
              <option value="atendente_especifico">Atendente específico</option>
              {distribuicaoAutomaticaPermitida && (
                <>
                  <option value="rodizio_aleatorio">Rodízio aleatório</option>
                  <option value="menos_conversas">Atendente com menos conversas</option>
                </>
              )}
            </select>
            {setor && !distribuicaoAutomaticaPermitida && (
              <span className={styles.help}>
                O setor não possui usuário comum ativo para distribuição automática. Marque “Incluir administradores” para liberar rodízio e menor carga quando houver administrador ativo.
              </span>
            )}
          </label>

          {estrategia === "atendente_especifico" && (
            <label className={styles.field}>
              <span className={styles.label}>Atendente destino</span>
              <select
                className={styles.input}
                value={atendente}
                onChange={(e) => onAtendenteChange(e.target.value)}
                disabled={!setor || carregandoSetores}
              >
                <option value="">Selecione um atendente</option>
                {atendentesElegiveis.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                    {item.is_administrador ? " — Administrador" : ""}
                    {item.email ? ` — ${item.email}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Mensagem ao exceder</span>
        <textarea
          className={styles.textarea}
          value={mensagem}
          onChange={(e) => onMensagemChange(e.target.value)}
        />
      </label>

      <label className={styles.switchField}>
        <input
          type="checkbox"
          checked={notificarSistema}
          onChange={(e) => onNotificarSistemaChange(e.target.checked)}
        />
        <div>
          <strong>Notificar no sistema</strong>
          <p>
            Cria uma notificação quando este bloco exceder o limite de tentativas.
          </p>
        </div>
      </label>

      <label className={styles.switchField}>
        <input
          type="checkbox"
          checked={notificarEmail}
          onChange={(e) => onNotificarEmailChange(e.target.checked)}
        />
        <div>
          <strong>Enviar email</strong>
          <p>
            Envia um alerta por email quando o limite de tentativas for excedido.
          </p>
        </div>
      </label>
    </div>
  );
}
