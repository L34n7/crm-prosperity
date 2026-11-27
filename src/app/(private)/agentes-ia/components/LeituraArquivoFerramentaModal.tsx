"use client";

import { useEffect, useState } from "react";
import { BookOpen, Check, X } from "lucide-react";
import styles from "./LeituraArquivoFerramentaModal.module.css";

type Campo = "avaliar" | "calcular" | "interpretar" | "quando_nao_encontrar";
export type InstrucoesLeitura = Record<Campo, string>;
const VAZIO: InstrucoesLeitura = {
  avaliar: "", calcular: "", interpretar: "", quando_nao_encontrar: "",
};
const CAMPOS: { chave: Campo; titulo: string; descricao: string; exemplo: string }[] = [
  {
    chave: "avaliar",
    titulo: "O que avaliar no arquivo?",
    descricao: "Defina os dados, campos ou critérios que o agente deve procurar.",
    exemplo: "Ex.: no extrato de consignações, identificar bancos, parcelas, saldos e margem disponível.",
  },
  {
    chave: "calcular",
    titulo: "Quais cálculos realizar?",
    descricao: "Oriente as fórmulas e os valores necessários para o cálculo.",
    exemplo: "Ex.: somar parcelas por contrato e calcular diferença de valores somente se todos os dados estiverem disponíveis.",
  },
  {
    chave: "interpretar",
    titulo: "Como interpretar o resultado?",
    descricao: "Explique o significado comercial desejado, sem extrapolar o documento.",
    exemplo: "Ex.: destacar contratos que podem merecer avaliação de portabilidade, sujeitos à conferência humana.",
  },
  {
    chave: "quando_nao_encontrar",
    titulo: "O que dizer quando faltar algo?",
    descricao: "Indique como agir caso falte informação, a leitura seja parcial ou o arquivo esteja ilegível.",
    exemplo: "Ex.: pedir as páginas ou campos necessários em uma foto nítida, ou oferecer encaminhamento ao consultor.",
  },
];

export default function LeituraArquivoFerramentaModal({
  value, onClose, onApply,
}: {
  value?: unknown;
  onClose: () => void;
  onApply: (instrucoes: InstrucoesLeitura) => void;
}) {
  const [instrucoes, setInstrucoes] = useState<InstrucoesLeitura>(() => {
    const v = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
    return {
      avaliar: String(v.avaliar || "").slice(0, 1800),
      calcular: String(v.calcular || "").slice(0, 1800),
      interpretar: String(v.interpretar || "").slice(0, 1800),
      quando_nao_encontrar: String(v.quando_nao_encontrar || "").slice(0, 1800),
    };
  });
  const personalizadas = Object.values(instrucoes).filter((v) => v.trim().length > 0).length;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay} role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}>
      <section className={styles.modal} role="dialog" aria-modal="true"
        aria-labelledby="leitura-arquivo-title">
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <div className={styles.icon}><BookOpen size={22} /></div>
            <div>
              <h2 id="leitura-arquivo-title">Instruções de leitura de arquivos</h2>
              <p>PDF, Excel e Word recebidos pelo WhatsApp</p>
            </div>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose}
            aria-label="Fechar modal"><X size={20} /></button>
        </header>
        <div className={styles.body}>
          <p className={styles.hint}>
            Todos os campos são opcionais. Se você não definir instruções, o agente
            identificará dados relevantes, fará cálculos com valores comprovados,
            interpretará resultados e informará o que estiver ausente ou ilegível.
          </p>
          {CAMPOS.map((campo) => (
            <label className={styles.field} key={campo.chave}>
              <span className={styles.fieldTitle}>{campo.titulo} <span>Opcional</span></span>
              <small>{campo.descricao}</small>
              <textarea rows={3} maxLength={1800} placeholder={campo.exemplo}
                value={instrucoes[campo.chave]}
                onChange={(event) => setInstrucoes((atual) => ({
                  ...atual, [campo.chave]: event.target.value,
                }))} />
              <span className={styles.count}>{instrucoes[campo.chave].length}/1800</span>
            </label>
          ))}
          <div className={styles.defaultHint}>
            {personalizadas
              ? String(personalizadas) + " orientação(ões) personalizada(s). Os campos em branco usarão a regra padrão."
              : "Modo padrão: todas as quatro orientações serão aplicadas automaticamente."}
          </div>
        </div>
        <footer className={styles.footer}>
          <span>Após aplicar, clique em <strong>Salvar alterações</strong> no agente.</span>
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>Cancelar</button>
            <button type="button" className={styles.apply}
              onClick={() => onApply(Object.fromEntries(
                Object.entries(instrucoes).map(([chave, valor]) => [chave, valor.trim()])
              ) as InstrucoesLeitura)}>
              <Check size={16} /> Aplicar instruções
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
