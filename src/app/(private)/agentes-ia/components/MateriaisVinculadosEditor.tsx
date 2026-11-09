"use client";

import { useCallback, useEffect, useState } from "react";
import { FilePlus2, Loader2, Plus, Trash2 } from "lucide-react";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  MAX_MATERIAIS_POR_VINCULO,
  type MaterialVinculado,
} from "@/lib/agentes-ia/materiais-config";
import type { MidiaOpcao } from "../../fluxos/types";
import styles from "../page.module.css";

type Props = {
  value: MaterialVinculado[];
  onChange: (proximos: MaterialVinculado[]) => void;
  onError: (mensagem: string) => void;
  onSuccess?: (mensagem: string) => void;
  titulo?: string;
};

export default function MateriaisVinculadosEditor({
  value,
  onChange,
  onError,
  onSuccess,
  titulo = "Materiais vinculados",
}: Props) {
  const [midias, setMidias] = useState<MidiaOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erroBiblioteca, setErroBiblioteca] = useState("");
  const itens = Array.isArray(value) ? value : [];

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroBiblioteca("");
    try {
      const resposta = await fetch("/api/automacoes/midias", { cache: "no-store" });
      const json = await resposta.json();
      if (!resposta.ok || !json?.ok) {
        throw new Error(json?.error || "Não foi possível carregar a biblioteca.");
      }
      setMidias(Array.isArray(json.midias) ? json.midias : []);
    } catch (error) {
      setErroBiblioteca(error instanceof Error ? error.message : "Erro ao carregar mídias.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  function atualizar(indice: number, patch: Partial<MaterialVinculado>) {
    onChange(itens.map((item, posicao) => posicao === indice ? { ...item, ...patch } : item));
  }

  async function enviarArquivo(arquivo: File) {
    setEnviando(true);
    try {
      const mimeType = arquivo.type || "application/octet-stream";
      const metadados = { nome: arquivo.name, mimeType, tamanhoBytes: arquivo.size };
      const preparar = await fetch("/api/automacoes/midias/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "preparar_upload", ...metadados }),
      });
      const preparacao = await preparar.json();
      if (!preparar.ok || !preparacao?.ok) {
        throw new Error(preparacao.error || "Não foi possível preparar o upload.");
      }
      const upload = preparacao.upload;
      if (!upload?.bucket || !upload?.path || !upload?.token) {
        throw new Error("Dados de upload inválidos.");
      }
      const cliente = createSupabaseBrowserClient();
      const { error: erroUpload } = await cliente.storage
        .from(upload.bucket)
        .uploadToSignedUrl(upload.path, upload.token, arquivo, {
          contentType: mimeType,
          upsert: false,
        });
      if (erroUpload) throw new Error(erroUpload.message);
      const finalizar = await fetch("/api/automacoes/midias/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "concluir_upload", ...metadados, storagePath: upload.path,
        }),
      });
      const conclusao = await finalizar.json();
      if (!finalizar.ok || !conclusao?.ok || !conclusao.midia?.id) {
        throw new Error(conclusao.error || "Falha ao registrar o arquivo.");
      }
      const nova = conclusao.midia as MidiaOpcao;
      setMidias((atuais) => [nova, ...atuais.filter((item) => item.id !== nova.id)]);
      const vazio = itens.findIndex((item) => !item.midia_id);
      if (vazio >= 0) atualizar(vazio, { midia_id: nova.id });
      else if (itens.length < MAX_MATERIAIS_POR_VINCULO) {
        onChange([...itens, { midia_id: nova.id, quando_enviar: "" }]);
      }
      onSuccess?.("Arquivo incluído na biblioteca. Defina quando enviá-lo e salve.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Erro ao enviar arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.cotacaoPosEnvio}>
      <strong>{titulo}</strong>
      <p className={styles.fieldHint}>
        Escolha arquivos da biblioteca da empresa e explique em que situação a IA
        pode enviá-los. O envio não é automático: o agente decide conforme a conversa.
      </p>
      {itens.map((item, indice) => (
        <div className={styles.cotacaoPosEnvioConteudo} key={indice}>
          <label className={styles.field}>
            <span>Arquivo {indice + 1}</span>
            <select
              value={item.midia_id}
              disabled={carregando || enviando}
              onChange={(event) => atualizar(indice, { midia_id: event.target.value })}
            >
              <option value="">Selecione um arquivo</option>
              {midias.map((midia) => (
                <option key={midia.id} value={midia.id}>
                  {midia.nome} · {midia.tipo === "arquivo" ? "documento" : midia.tipo}
                </option>
              ))}
              {item.midia_id && !midias.some((midia) => midia.id === item.midia_id) && (
                <option value={item.midia_id}>Arquivo indisponível ou removido</option>
              )}
            </select>
          </label>
          <label className={styles.field}>
            <span>Quando enviar</span>
            <textarea
              rows={2}
              maxLength={240}
              value={item.quando_enviar}
              onChange={(event) => atualizar(indice, { quando_enviar: event.target.value })}
              placeholder="Ex.: Quando o cliente pedir demonstração ou quiser ver o sistema funcionando."
            />
          </label>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => onChange(itens.filter((_, posicao) => posicao !== indice))}
          >
            <Trash2 size={15} /> Remover vínculo
          </button>
        </div>
      ))}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={itens.length >= MAX_MATERIAIS_POR_VINCULO}
          onClick={() => onChange([...itens, { midia_id: "", quando_enviar: "" }])}
        >
          <Plus size={15} /> Adicionar material
        </button>
        <label className={styles.cotacaoPosEnvioUpload}>
          <input
            type="file"
            accept="image/*,video/mp4,audio/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx"
            disabled={enviando || itens.length >= MAX_MATERIAIS_POR_VINCULO}
            onChange={(event) => {
              const arquivo = event.target.files?.[0];
              event.target.value = "";
              if (arquivo) void enviarArquivo(arquivo);
            }}
          />
          {enviando ? <Loader2 size={14} /> : <FilePlus2 size={14} />}
          {enviando ? "Enviando..." : "Enviar novo arquivo"}
        </label>
      </div>
      {erroBiblioteca && <small role="alert">{erroBiblioteca}</small>}
      <small className={styles.fieldHint}>
        Até {MAX_MATERIAIS_POR_VINCULO} materiais. O agente usa apenas os arquivos autorizados;
        arquivos removidos ou de outras empresas não podem ser enviados.
      </small>
    </div>
  );
}
