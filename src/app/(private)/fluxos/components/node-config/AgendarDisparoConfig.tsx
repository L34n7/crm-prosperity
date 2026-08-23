"use client";

import TemplateVariableCombobox, {
  type TemplateVariableOption,
} from "@/components/TemplateVariableCombobox";
import type {
  IntegracaoWhatsappOpcao,
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

type AgendarDisparoConfigProps = {
  usaTemplatesPorIntegracao: boolean;
  templateId: string;
  templatesPorIntegracao: Record<string, string>;
  quantidade: string;
  unidade: "horas" | "dias";
  variaveis: string;
  indicesVariaveis: number[];
  templates: TemplateWhatsappOpcao[];
  integracoes: IntegracaoWhatsappOpcao[];
  carregandoTemplates: boolean;
  opcoesVariaveis: TemplateVariableOption[];
  loadingVariaveis: boolean;
  templatePreviewSelecionado: TemplateWhatsappOpcao | null;
  preview: PreviewTemplateWhatsapp | null;
  loadingCusto: boolean;
  custo: CustoPreview | null;
  rotuloIntegracao: (integracao: IntegracaoWhatsappOpcao) => string;
  templatesCompativeis: (
    integracao: IntegracaoWhatsappOpcao
  ) => TemplateWhatsappOpcao[];
  onTemplateIdChange: (id: string) => void;
  onTemplateIntegracaoChange: (integracaoId: string, templateId: string) => void;
  onQuantidadeChange: (valor: string) => void;
  onUnidadeChange: (valor: "horas" | "dias") => void;
  onVariavelChange: (index: number, chave: string) => void;
  onGerenciarVariaveis: () => void;
};

function linhasVariaveis(valor: string) {
  const linhas = String(valor || "").split("\n");
  return [linhas[0] || "", linhas[1] || "", linhas[2] || ""];
}

export default function AgendarDisparoConfig({
  usaTemplatesPorIntegracao,
  templateId,
  templatesPorIntegracao,
  quantidade,
  unidade,
  variaveis,
  indicesVariaveis,
  templates,
  integracoes,
  carregandoTemplates,
  opcoesVariaveis,
  loadingVariaveis,
  templatePreviewSelecionado,
  preview,
  loadingCusto,
  custo,
  rotuloIntegracao,
  templatesCompativeis,
  onTemplateIdChange,
  onTemplateIntegracaoChange,
  onQuantidadeChange,
  onUnidadeChange,
  onVariavelChange,
  onGerenciarVariaveis,
}: AgendarDisparoConfigProps) {
  return (
    <div className={styles.optionsBox}>
      <div className={styles.agendarDisparoCostAlert}>
        <div className={styles.agendarDisparoCostAlertIcon}>⚠</div>
        <div className={styles.agendarDisparoCostAlertContent}>
          <strong>Este disparo gera custos</strong>
          <p>
            O envio será feito usando template oficial do WhatsApp e poderá gerar cobrança da Meta quando o disparo ocorrer.
          </p>
        </div>
      </div>

      <div>
        <span className={styles.label}>Configuração do disparo</span>
        <p className={styles.help}>
          Este bloco não envia mensagem comum. Ele agenda um template WhatsApp para ser enviado depois.
        </p>
      </div>

      <label
        className={`${styles.field} ${
          usaTemplatesPorIntegracao ? styles.hiddenField : ""
        }`}
      >
        <span className={styles.label}>Template WhatsApp</span>
        <select
          className={styles.input}
          value={templateId}
          onChange={(e) => onTemplateIdChange(e.target.value)}
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
        <span className={styles.help}>
          Apenas templates aprovados devem ser usados para disparos após 24h.
        </span>
      </label>

      {usaTemplatesPorIntegracao && (
        <div className={styles.field}>
          <span className={styles.label}>Templates por numero</span>
          <span className={styles.help}>
            Este fluxo atende numeros de WABAs diferentes. Selecione um template aprovado para cada numero.
          </span>

          <div className={styles.integrationTemplateList}>
            {integracoes.map((integracao) => (
              <label
                key={integracao.id}
                className={styles.integrationTemplateItem}
              >
                <span>
                  <strong>{rotuloIntegracao(integracao)}</strong>
                  <small>WABA {integracao.waba_id || "nao informada"}</small>
                </span>

                <select
                  className={styles.input}
                  value={templatesPorIntegracao[integracao.id] || ""}
                  onChange={(e) =>
                    onTemplateIntegracaoChange(integracao.id, e.target.value)
                  }
                  disabled={carregandoTemplates}
                >
                  <option value="">
                    {carregandoTemplates
                      ? "Carregando templates..."
                      : "Selecione um template"}
                  </option>
                  {templatesCompativeis(integracao).map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.nome} - {template.idioma}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className={styles.optionRow}>
        <label className={styles.field}>
          <span className={styles.label}>Enviar após</span>
          <input
            type="number"
            min={1}
            className={styles.input}
            value={quantidade}
            onChange={(e) => onQuantidadeChange(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Unidade</span>
          <select
            className={styles.input}
            value={unidade}
            onChange={(e) =>
              onUnidadeChange(e.target.value as "horas" | "dias")
            }
          >
            <option value="horas">Horas</option>
            <option value="dias">Dias</option>
          </select>
        </label>
      </div>

      <div className={styles.field}>
        {indicesVariaveis.length > 0 && (
          <>
            <span className={styles.label}>Variáveis do template</span>
            <div className={styles.templateVariableGrid}>
              {indicesVariaveis.map((index) => (
                <TemplateVariableCombobox
                  key={index}
                  label={`Variável ${index + 1}`}
                  value={linhasVariaveis(variaveis)[index]}
                  onChange={(chave) => onVariavelChange(index, chave)}
                  options={opcoesVariaveis}
                  loading={loadingVariaveis}
                />
              ))}
            </div>
            <span className={styles.help}>
              Variável 1 substitui {"{{1}}"}, Variável 2 substitui {"{{2}}"} e Variável 3 substitui {"{{3}}"}.
            </span>
            <button
              type="button"
              className={styles.inlineVariablesButton}
              onClick={onGerenciarVariaveis}
            >
              Gerenciar variáveis
            </button>
          </>
        )}

        <div className={styles.templatePreviewCard}>
          <div className={styles.templatePreviewTop}>
            <strong>Prévia WhatsApp</strong>
            <span>{templatePreviewSelecionado?.nome || "Template"}</span>
          </div>

          {preview ? (
            <div className={styles.whatsappPreviewArea}>
              <div className={styles.whatsappBubble}>
                <strong className={styles.whatsappPreviewTitle}>
                  {preview.titulo}
                </strong>
                <p className={styles.whatsappPreviewText}>{preview.corpo}</p>
                <div className={styles.whatsappPreviewMeta}>
                  <span className={styles.whatsappPreviewFooter}>
                    {preview.rodape}
                  </span>
                  <span className={styles.whatsappPreviewTime}>
                    {new Date().toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {preview.botoes.map((texto, index) => (
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
            <span className={styles.costPreviewLabel}>Estimativa de custo Meta</span>
            <span className={styles.costPreviewCategory}>
              {templatePreviewSelecionado?.categoria || "Categoria"}
            </span>
          </div>

          {loadingCusto ? (
            <p className={styles.costPreviewMuted}>Calculando estimativa...</p>
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
    </div>
  );
}
