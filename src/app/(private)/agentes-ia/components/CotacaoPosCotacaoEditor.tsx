"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MidiaOpcao } from "../../fluxos/types";
import styles from "../page.module.css";

type Props = {
  config: Record<string, unknown>;
  onChange: (chave: string, valor: unknown) => void;
  onError: (erro: string) => void;
  onSuccess: (mensagem: string) => void;
};

export default function CotacaoPosCotacaoEditor({
  config,
  onChange,
  onError,
  onSuccess,
}: Props) {
  const [midias, setMidias] = useState<MidiaOpcao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroBiblioteca, setErroBiblioteca] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroBiblioteca("");
    try {
      const resposta = await fetch("/api/automacoes/midias", { cache: "no-store" });
      const data = await resposta.json();
      if (!resposta.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível carregar as mídias.");
      }
      setMidias(Array.isArray(data.midias) ? data.midias : []);
    } catch (error) {
      setErroBiblioteca(
        error instanceof Error ? error.message : "Não foi possível carregar a biblioteca.",
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (config.pos_cotacao_ativo === true) void carregar();
  }, [carregar, config.pos_cotacao_ativo]);

  async function enviarArquivo(arquivo: File) {
    setEnviando(true);
    try {
      const mimeType = arquivo.type || "application/octet-stream";
      const dados = {
        nome: arquivo.name,
        mimeType,
        tamanhoBytes: arquivo.size,
      };
      const inicio = await fetch("/api/automacoes/midias/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "preparar_upload", ...dados }),
      });
      const preparacao = await inicio.json();
      if (!inicio.ok || !preparacao.ok) {
        throw new Error(preparacao.error || "Não foi possível preparar o arquivo.");
      }
      const upload = preparacao.upload;
      if (!upload?.bucket || !upload?.path || !upload?.token) {
        throw new Error("Dados do upload inválidos.");
      }

      const cliente = createSupabaseBrowserClient();
      const { error: erroUpload } = await cliente.storage
        .from(upload.bucket)
        .uploadToSignedUrl(upload.path, upload.token, arquivo, {
          contentType: mimeType,
          upsert: false,
        });
      if (erroUpload) throw new Error(erroUpload.message);

      const fim = await fetch("/api/automacoes/midias/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "concluir_upload",
          ...dados,
          storagePath: upload.path,
        }),
      });
      const resultado = await fim.json();
      if (!fim.ok || !resultado.ok || !resultado.midia?.id) {
        throw new Error(resultado.error || "Não foi possível registrar o arquivo.");
      }
      const midia = resultado.midia as MidiaOpcao;
      setMidias((atuais) => [midia, ...atuais.filter((item) => item.id !== midia.id)]);
      onChange("pos_cotacao_midia_id", midia.id);
      onSuccess("Arquivo enviado. Salve o agente para aplicar a nova configuração.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível enviar o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  const ativo = config.pos_cotacao_ativo === true;
  const midiaId = String(config.pos_cotacao_midia_id || "");
  const selecionada = midias.find((item) => item.id === midiaId);

  return (
    <div className={styles.cotacaoPosEnvio}>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={ativo}
          onChange={(event) => onChange("pos_cotacao_ativo", event.target.checked)}
        />
        <span>
          <strong>Enviar conteúdo após a cotação</strong>
          <small>
            Enviado automaticamente após a proposta, antes de o agente continuar
            a conversa. Opcional: mensagem, arquivo ou ambos.
          </small>
        </span>
      </label>

      {ativo && (
        <div className={styles.cotacaoPosEnvioConteudo}>
          <label className={styles.field}>
            <span>Mensagem complementar · opcional</span>
            <textarea
              rows={4}
              maxLength={2400}
              value={String(config.pos_cotacao_texto || "")}
              onChange={(event) => onChange("pos_cotacao_texto", event.target.value)}
              placeholder="Ex.: Confira também nosso material com os benefícios dos planos."
            />
          </label>
          <label className={styles.field}>
            <span>Arquivo de mídia · opcional</span>
            <select
              value={midiaId}
              disabled={carregando || enviando}
              onChange={(event) => onChange("pos_cotacao_midia_id", event.target.value || null)}
            >
              <option value="">
                {carregando ? "Carregando mídias..." : "Nenhum arquivo selecionado"}
              </option>
              {midias.map((midia) => (
                <option key={midia.id} value={midia.id}>
                  {midia.nome} · {midia.tipo === "arquivo" ? "documento" : midia.tipo}
                </option>
              ))}
              {midiaId && !selecionada && !carregando && (
                <option value={midiaId}>Arquivo selecionado (não disponível na lista)</option>
              )}
            </select>
            <small>
              Selecione um arquivo existente da biblioteca ou envie um novo.
              Formatos: imagem, vídeo, áudio e documentos compatíveis com o WhatsApp.
            </small>
          </label>
          <label className={styles.cotacaoPosEnvioUpload}>
            <input
              type="file"
              accept="image/*,video/mp4,audio/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx"
              disabled={enviando}
              onChange={(event) => {
                const arquivo = event.target.files?.[0];
                event.target.value = "";
                if (arquivo) void enviarArquivo(arquivo);
              }}
            />
            {enviando ? "Enviando arquivo..." : "Enviar novo arquivo"}
          </label>
          {erroBiblioteca && (
            <small className={styles.cotacaoPosEnvioErro} role="alert">
              {erroBiblioteca} Para utilizar a biblioteca é necessário acesso às mídias da empresa.
            </small>
          )}
          <small className={styles.fieldHint}>
            O agente não recebe uma pergunta fixa: depois do envio continua a
            negociação naturalmente, conforme o prompt. Se o cliente escolher um
            plano, a contratação será encaminhada para atendimento humano.
          </small>
        </div>
      )}
    </div>
  );
}
