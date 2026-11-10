"use client";

import { Clock3 } from "lucide-react";
import {
  calcularDelayDinamicoMs,
  normalizarDelayDinamico,
  type ConfigDelayDinamico,
} from "@/lib/agentes-ia/delay-dinamico";
import styles from "./DelayDinamicoEditor.module.css";

type Props = {
  value: ConfigDelayDinamico;
  onChange: (valor: ConfigDelayDinamico) => void;
};

export default function DelayDinamicoEditor({ value, onChange }: Props) {
  const config = normalizarDelayDinamico(value);
  const atualizar = (patch: Partial<ConfigDelayDinamico>) =>
    onChange(normalizarDelayDinamico({ ...config, ...patch }));
  const amostra = config.unidade === "palavras"
    ? "Olá, posso te mostrar como o sistema funciona na prática e como ele ajuda sua equipe a atender os clientes."
    : "O CRM organiza os atendimentos e automatiza as respostas.";
  const totalExemplo = config.unidade === "palavras"
    ? amostra.trim().split(/\s+/u).length
    : Array.from(amostra).length;
  const segundosExemplo = (calcularDelayDinamicoMs(amostra, { ...config, ativo: true }) / 1000)
    .toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  return (
    <div className={styles.card}>
      <div className={styles.topo}>
        <div className={styles.titulo}>
          <Clock3 size={18} aria-hidden="true" />
          <div>
            <strong>Delay dinâmico</strong>
            <span>Aguarda um pouco antes de enviar cada mensagem, simulando o tempo de digitação.</span>
          </div>
        </div>
        <label className={styles.ativar}>
          <input
            type="checkbox"
            checked={config.ativo}
            onChange={(event) => atualizar({ ativo: event.target.checked })}
          />
          <span>{config.ativo ? "Ativado" : "Desativado"}</span>
        </label>
      </div>
      {config.ativo && (
        <>
          <div className={styles.campos}>
            <label className={styles.campo}>
              <span>Calcular por</span>
              <select
                value={config.unidade}
                onChange={(event) => {
                  const unidade = event.target.value === "caracteres" ? "caracteres" : "palavras";
                  atualizar({ unidade, quantidade: unidade === "caracteres" ? 60 : 12 });
                }}
              >
                <option value="palavras">Palavras</option>
                <option value="caracteres">Caracteres</option>
              </select>
            </label>
            <label className={styles.campo}>
              <span>A cada quantas {config.unidade}?</span>
              <input
                type="number" min={1} max={500} step={1}
                value={config.quantidade}
                onChange={(event) => atualizar({ quantidade: Number(event.target.value) })}
              />
            </label>
            <label className={styles.campo}>
              <span>Esperar (segundos)</span>
              <input
                type="number" min={0.1} max={5} step={0.1}
                value={config.segundos_por_bloco}
                onChange={(event) => atualizar({ segundos_por_bloco: Number(event.target.value) })}
              />
            </label>
            <label className={styles.campo}>
              <span>Mínimo (segundos)</span>
              <input
                type="number" min={0} max={5} step={0.1}
                value={config.minimo_segundos}
                onChange={(event) => atualizar({ minimo_segundos: Number(event.target.value) })}
              />
            </label>
            <label className={styles.campo}>
              <span>Máximo (segundos)</span>
              <input
                type="number" min={0.5} max={8} step={0.1}
                value={config.maximo_segundos}
                onChange={(event) => atualizar({ maximo_segundos: Number(event.target.value) })}
              />
            </label>
          </div>
          <p className={styles.previa}>
            Exemplo: uma mensagem de {totalExemplo} {config.unidade} aguarda aproximadamente <strong>{segundosExemplo}s</strong>.
            O limite máximo evita esperas exageradas.
          </p>
        </>
      )}
    </div>
  );
}
