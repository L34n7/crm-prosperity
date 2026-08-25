"use client";

import type {
  AtendenteOpcao,
  EscopoFilaNode,
  EstrategiaTransferenciaNode,
  SetorOpcao,
} from "../../types";
import styles from "../../fluxos.module.css";

type TransferenciaConfigProps = {
  escopoFila: EscopoFilaNode;
  setorDestino: string;
  incluirAdministradores: boolean;
  estrategia: EstrategiaTransferenciaNode;
  atendenteDestino: string;
  carregandoSetores: boolean;
  possuiAdministradorAtivo: boolean;
  distribuicaoAutomaticaPermitida: boolean;
  setores: SetorOpcao[];
  atendentesElegiveis: AtendenteOpcao[];
  onEscopoFilaChange: (valor: EscopoFilaNode) => void;
  onSetorDestinoChange: (valor: string) => void;
  onIncluirAdministradoresChange: (valor: boolean) => void;
  onEstrategiaChange: (valor: EstrategiaTransferenciaNode) => void;
  onAtendenteDestinoChange: (valor: string) => void;
};

export default function TransferenciaConfig({
  escopoFila,
  setorDestino,
  incluirAdministradores,
  estrategia,
  atendenteDestino,
  carregandoSetores,
  possuiAdministradorAtivo,
  distribuicaoAutomaticaPermitida,
  setores,
  atendentesElegiveis,
  onEscopoFilaChange,
  onSetorDestinoChange,
  onIncluirAdministradoresChange,
  onEstrategiaChange,
  onAtendenteDestinoChange,
}: TransferenciaConfigProps) {
  return (
    <div className={styles.optionsBox}>
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
        <span className={styles.help}>
          Na fila geral, qualquer equipe com acesso aos atendimentos pode assumir a conversa.
        </span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Setor destino</span>
        <select
          className={styles.input}
          value={setorDestino}
          onChange={(e) => onSetorDestinoChange(e.target.value)}
          disabled={escopoFila === "geral" || carregandoSetores}
        >
          <option value="">
            {carregandoSetores ? "Carregando setores..." : "Selecione um setor"}
          </option>
          {setores.map((setor) => (
            <option key={setor.id} value={setor.id}>
              {setor.nome}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.switchField}>
        <input
          type="checkbox"
          checked={incluirAdministradores}
          disabled={!setorDestino || !possuiAdministradorAtivo}
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
          disabled={escopoFila === "geral" || !setorDestino}
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
        {setorDestino && !distribuicaoAutomaticaPermitida && (
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
            value={atendenteDestino}
            onChange={(e) => onAtendenteDestinoChange(e.target.value)}
            disabled={!setorDestino || carregandoSetores}
          >
            <option value="">Selecione um atendente</option>
            {atendentesElegiveis.map((atendente) => (
              <option key={atendente.id} value={atendente.id}>
                {atendente.nome}
                {atendente.is_administrador ? " — Administrador" : ""}
                {atendente.email ? ` — ${atendente.email}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className={styles.help}>
        No rodízio aleatório o sistema escolhe entre os usuários elegíveis. Em menos conversas, considera os atendimentos ainda abertos atribuídos a cada usuário. Administradores só entram na distribuição automática quando a opção acima estiver marcada.
      </p>
    </div>
  );
}
