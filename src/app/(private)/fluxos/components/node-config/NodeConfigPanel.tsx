"use client";

import type { ReactNode } from "react";
import {
  TIPO_NO_PERGUNTA_LIVRE_IA,
  VARIAVEIS_FIXAS_CONTATO_HELP,
} from "../../constants";
import { TIPO_NO_CONSULTAR_ESTOQUE } from "../../consultar-estoque-editor";
import styles from "../../fluxos.module.css";

type NodeConfigPanelProps = {
  tipoNode: string;
  titulo: string;
  mensagem: string;
  children: ReactNode;
  onTipoChange: (tipo: string) => void;
  onTituloChange: (titulo: string) => void;
  onMensagemChange: (mensagem: string) => void;
  onGerenciarVariaveis: () => void;
};

const TIPOS_COM_MENSAGEM = new Set([
  "enviar_texto",
  "pergunta_opcoes",
  TIPO_NO_PERGUNTA_LIVRE_IA,
  "enviar_botoes",
  "botao_redirect",
  "enviar_imagem",
  "enviar_video",
  "enviar_audio",
  "enviar_arquivo",
  "transferir_setor",
  "encerrar",
  "avaliacao",
  "capturar_resposta",
  "agenda_buscar_agendamento",
  "agenda_escolher_horario",
  "agenda_criar_agendamento",
  "agenda_remarcar_agendamento",
  "agenda_cancelar_agendamento",
  "interpretar_arquivo_ia",
]);

function labelMensagem(tipoNode: string) {
  if (tipoNode === "pergunta_opcoes") return "Pergunta";
  if (tipoNode === TIPO_NO_PERGUNTA_LIVRE_IA) return "Pergunta aberta";
  if (tipoNode === "enviar_botoes") return "Pergunta dos botões";
  if (tipoNode === "botao_redirect") return "Mensagem do botão";
  if (tipoNode === "enviar_imagem") return "Legenda da imagem";
  if (tipoNode === "enviar_video") return "Legenda do vídeo";
  if (tipoNode === "enviar_audio") return "Legenda do áudio";
  if (tipoNode === "enviar_arquivo") return "Legenda do arquivo";
  if (tipoNode === "transferir_setor") return "Mensagem antes de transferir";
  if (tipoNode === "encerrar") return "Mensagem de encerramento (opcional)";
  if (tipoNode === "avaliacao") return "Pergunta de avaliação";
  if (tipoNode === "agenda_buscar_agendamento") return "Mensagem para 1 agendamento";
  if (tipoNode === "agenda_escolher_horario") return "Mensagem para pedir o dia";
  if (tipoNode === "agenda_criar_agendamento") return "Mensagem depois de criar";
  if (tipoNode === "agenda_remarcar_agendamento") {
    return "Mensagem após remarcar com sucesso";
  }
  if (tipoNode === "agenda_cancelar_agendamento") {
    return "Mensagem depois de cancelar";
  }
  if (tipoNode === "interpretar_arquivo_ia") {
    return "Mensagem solicitando o arquivo";
  }
  return "Mensagem";
}

export default function NodeConfigPanel({
  tipoNode,
  titulo,
  mensagem,
  children,
  onTipoChange,
  onTituloChange,
  onMensagemChange,
  onGerenciarVariaveis,
}: NodeConfigPanelProps) {
  return (
    <div className={styles.propertiesForm}>
      {tipoNode !== "inicio" && (
        <label className={styles.field}>
          <span className={styles.label}>Tipo do bloco</span>
          <select
            className={styles.input}
            value={tipoNode}
            onChange={(e) => onTipoChange(e.target.value)}
          >
            <option value="enviar_texto">Mensagem</option>
            <option value="pergunta_opcoes">Pergunta</option>
            <option value={TIPO_NO_PERGUNTA_LIVRE_IA}>Pergunta aberta IA</option>
            <option value="capturar_resposta">Capturar resposta</option>
            <option value="transferir_setor">Transferir</option>
            <option value="encerrar">Encerrar</option>
            <option value="enviar_imagem">Imagem</option>
            <option value="enviar_video">Vídeo</option>
            <option value="enviar_audio">Áudio</option>
            <option value="enviar_arquivo">Arquivo</option>
            <option value="enviar_botoes">Pergunta com Botões</option>
            <option value="botao_redirect">Botão redirect</option>
            <option value={TIPO_NO_CONSULTAR_ESTOQUE}>Consultar estoque</option>
            <option value="agendar_disparo">Agendar disparo</option>
            <option value="agenda_buscar_agendamento">
              Agenda: Buscar agendamento
            </option>
            <option value="agenda_escolher_horario">
              Agenda: Escolher horário
            </option>
            <option value="agenda_criar_agendamento">
              Agenda: Criar agendamento
            </option>
            <option value="agenda_remarcar_agendamento">
              Agenda: Remarcar agendamento
            </option>
            <option value="agenda_cancelar_agendamento">
              Agenda: Cancelar agendamento
            </option>
            <option value="avaliacao">Avaliação</option>
            <option value="interpretar_arquivo_ia">Interpretar arquivo IA</option>
          </select>
        </label>
      )}

      <label className={styles.field}>
        <span className={styles.label}>Título</span>
        <span className={styles.help}>
          Esse título é interno e não aparece na conversa.
        </span>
        <input
          className={styles.input}
          value={titulo}
          onChange={(e) => onTituloChange(e.target.value)}
        />
      </label>

      {TIPOS_COM_MENSAGEM.has(tipoNode) && (
        <div className={styles.field}>
          <span className={styles.label}>{labelMensagem(tipoNode)}</span>
          <textarea
            className={styles.textarea}
            value={mensagem}
            onChange={(e) => onMensagemChange(e.target.value)}
            placeholder="Digite o conteúdo"
          />
          <p className={styles.help}>
            Use variaveis com duas chaves de cada lado. Exemplo: {"{{variavel}}"} ou {"{{teste}}"}.
          </p>
          <p className={styles.help}>{VARIAVEIS_FIXAS_CONTATO_HELP}</p>
          <button
            type="button"
            className={styles.inlineVariablesButton}
            onClick={onGerenciarVariaveis}
          >
            Gerenciar variáveis
          </button>
        </div>
      )}

      {children}
    </div>
  );
}
