"use client";

import type {
  EscopoIntegracoesModo,
  IntegracaoWhatsappOpcao,
} from "../../types";
import styles from "../../fluxos.module.css";

type IntegrationScopeFieldsProps = {
  modo: EscopoIntegracoesModo;
  idsSelecionados: string[];
  integracoes: IntegracaoWhatsappOpcao[];
  carregando: boolean;
  rotuloIntegracao: (integracao: IntegracaoWhatsappOpcao) => string;
  onModoChange: (modo: EscopoIntegracoesModo) => void;
  onAlternarIntegracao: (integracaoId: string) => void;
};

export default function IntegrationScopeFields({
  modo,
  idsSelecionados,
  integracoes,
  carregando,
  rotuloIntegracao,
  onModoChange,
  onAlternarIntegracao,
}: IntegrationScopeFieldsProps) {
  return (
    <div className={styles.sectionBlock}>
      <div>
        <p className={styles.modalSectionTitle}>Integrações WhatsApp</p>
        <p className={styles.helperText}>
          Defina em quais números este fluxo poderá iniciar.
        </p>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Escopo do fluxo</span>
        <select
          className={styles.input}
          value={modo}
          onChange={(event) =>
            onModoChange(
              event.target.value === "selecionadas"
                ? "selecionadas"
                : "todas"
            )
          }
        >
          <option value="todas">Todas as integrações</option>
          <option value="selecionadas">Integrações selecionadas</option>
        </select>
      </label>

      {modo === "selecionadas" && (
        <div className={styles.integrationCheckboxList}>
          {integracoes.map((integracao) => (
            <label
              key={integracao.id}
              className={styles.integrationCheckboxItem}
            >
              <input
                type="checkbox"
                checked={idsSelecionados.includes(integracao.id)}
                onChange={() => onAlternarIntegracao(integracao.id)}
              />
              <span>{rotuloIntegracao(integracao)}</span>
            </label>
          ))}

          {integracoes.length === 0 && (
            <p className={styles.helperText}>
              {carregando
                ? "Carregando integrações..."
                : "Nenhuma integração disponível para este usuário."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
