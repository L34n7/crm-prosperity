"use client";

import { Handle, Position } from "@xyflow/react";
import styles from "../fluxos.module.css";
import {
  AVISO_BLOCO_CONEXAO_ERRO_ARQUIVO_IA,
  AVISO_BLOCO_TEMPLATE_WABA_AGENDAR_DISPARO,
  TIPO_NO_PERGUNTA_LIVRE_IA,
} from "../constants";
import {
  SAIDAS_CONSULTA_ESTOQUE,
  TIPO_NO_CONSULTAR_ESTOQUE,
} from "../consultar-estoque-editor";
import { labelTipoNo, tituloVisivelCard } from "../utils";

function corTipoNo(tipo: string) {
  if (tipo === "inicio") return styles.nodeInicio;
  if (tipo === "enviar_texto") return styles.nodeMensagem;
  if (tipo === "pergunta_opcoes") return styles.nodePergunta;
  if (tipo === TIPO_NO_PERGUNTA_LIVRE_IA) return styles.nodePerguntaIA;
  if (tipo === "transferir_setor") return styles.nodeTransferir;
  if (tipo === "encerrar") return styles.nodeEncerrar;
  if (tipo === "enviar_imagem") return styles.nodeImagem;
  if (tipo === "enviar_video") return styles.nodeVideo;
  if (tipo === "enviar_audio") return styles.nodeAudio;
  if (tipo === "enviar_arquivo") return styles.nodeArquivo;
  if (tipo === "enviar_botoes") return styles.nodeBotoes;
  if (tipo === "botao_redirect") return styles.nodeRedirect;
  if (tipo === "avaliacao") return styles.nodeAvaliacao;
  if (tipo === "capturar_resposta") return styles.nodeCaptura;
  if (tipo === "agendar_disparo") return styles.nodeAgendarDisparo;
  if (tipo === TIPO_NO_CONSULTAR_ESTOQUE) return styles.nodeEstoque;
  if (tipo === "agenda_buscar_agendamento") return styles.nodeAgendaBuscar;
  if (tipo === "agenda_escolher_horario") return styles.nodeAgendaEscolher;
  if (tipo === "agenda_criar_agendamento") return styles.nodeAgendaCriar;
  if (tipo === "agenda_remarcar_agendamento") return styles.nodeAgendaRemarcar;
  if (tipo === "agenda_cancelar_agendamento") return styles.nodeAgendaCancelar;
  if (tipo === "interpretar_arquivo_ia") return styles.nodeArquivoIA;
  return styles.nodePadrao;
}

export default function NodeCustom({ data, dragging }: any) {
  const temAlertaConexaoErro = data?.arquivo_ia_sem_conexao_erro === true;
  const temAlertaTemplateWaba =
    data?.agendar_disparo_template_waba_alerta === true;
  const consultaEstoque = data?.tipo_no === TIPO_NO_CONSULTAR_ESTOQUE;

  return (
    <div
      className={`${styles.nodeBox} ${corTipoNo(data.tipo_no)} ${
        !dragging && data.isSelecionado ? styles.nodeSelecionado : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={styles.nodeHandle}
        isConnectable={true}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      />

      <div className={styles.nodeHeader}>
        <div className={styles.nodeTypeRow}>
          <span className={styles.nodeType}>{labelTipoNo(data.tipo_no)}</span>

          {data?.delay_segundos != null && Number(data.delay_segundos) > 0 && (
            <span className={styles.nodeDelayBadge}>
              ⏱ {data.delay_segundos}s
            </span>
          )}
        </div>
      </div>

      <div className={styles.nodeContent}>
        <div className={styles.nodeTitleRow}>
          <strong className={styles.nodeTitle}>{tituloVisivelCard(data)}</strong>

          {consultaEstoque && (
            <span
              title="Disponível · Sem estoque · Não encontrado · Vários encontrados"
              style={{ fontSize: 9, opacity: 0.72, whiteSpace: "nowrap" }}
            >
              4 saídas
            </span>
          )}

          {temAlertaConexaoErro && (
            <span
              className={`${styles.infoAlertIcon} ${styles.infoAlertIconNode}`}
              data-tooltip={AVISO_BLOCO_CONEXAO_ERRO_ARQUIVO_IA}
              title={AVISO_BLOCO_CONEXAO_ERRO_ARQUIVO_IA}
              aria-label={AVISO_BLOCO_CONEXAO_ERRO_ARQUIVO_IA}
              role="img"
            >
              i
            </span>
          )}

          {temAlertaTemplateWaba && (
            <span
              className={`${styles.infoAlertIcon} ${styles.infoAlertIconNode} ${styles.infoAlertIconWarning}`}
              data-tooltip={AVISO_BLOCO_TEMPLATE_WABA_AGENDAR_DISPARO}
              title={AVISO_BLOCO_TEMPLATE_WABA_AGENDAR_DISPARO}
              aria-label={AVISO_BLOCO_TEMPLATE_WABA_AGENDAR_DISPARO}
              role="img"
            >
              i
            </span>
          )}
        </div>
      </div>

      {consultaEstoque ? (
        <>
          {SAIDAS_CONSULTA_ESTOQUE.map((saida, index) => (
            <Handle
              key={saida.valor}
              id={saida.valor}
              type="source"
              position={Position.Right}
              className={styles.nodeHandle}
              isConnectable={true}
              title={saida.titulo}
              style={{ top: `${22 + index * 19}%` }}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            />
          ))}
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className={styles.nodeHandle}
          isConnectable={true}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        />
      )}
    </div>
  );
}
