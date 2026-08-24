"use client";

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Node } from "@xyflow/react";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  CHAVES_REFERENCIA_MIDIA_NODE,
  LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES,
  TIPOS_NO_MIDIA,
} from "../constants";
import type {
  Fluxo,
  ImpactoExclusaoMidia,
  MidiaOpcao,
} from "../types";

export type AbaMidias =
  | "todas"
  | "imagem"
  | "video"
  | "audio"
  | "arquivo";

type UseFluxoMidiasOptions = {
  podeGerenciarMidias: boolean;
  midiaUrlNode: string;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setFluxos: Dispatch<SetStateAction<Fluxo[]>>;
  setFluxoSelecionado: Dispatch<SetStateAction<Fluxo | null>>;
  onSelecionarMidia: (url: string, nome: string) => void;
  onLimparMidiaSelecionada: () => void;
  onError: (message: string) => void;
  onClearError: () => void;
  onSuccess: (message: string) => void;
  onClearSuccess: () => void;
};

function configuracaoNodeComoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function nodeUsaMidia(node: Node, midia: MidiaOpcao) {
  if (!TIPOS_NO_MIDIA.has(String(node.data?.tipo_no || ""))) return false;

  const config = configuracaoNodeComoObjeto(node.data?.configuracao_json);

  return (
    String(config.midia_url || "").trim() === midia.url ||
    String(config.media_url || "").trim() === midia.url ||
    String(config.arquivo_url || "").trim() === midia.url ||
    String(config.midia_id || "").trim() === midia.id ||
    String(config.media_id || "").trim() === midia.id ||
    String(config.arquivo_id || "").trim() === midia.id
  );
}

function limparMidiaDoNode(node: Node, midia: MidiaOpcao) {
  if (!nodeUsaMidia(node, midia)) return node;

  const configuracao = {
    ...configuracaoNodeComoObjeto(node.data?.configuracao_json),
  };

  for (const chave of CHAVES_REFERENCIA_MIDIA_NODE) {
    delete configuracao[chave];
  }

  configuracao.midia_removida = {
    id: midia.id,
    nome: midia.nome,
    removida_em: new Date().toISOString(),
    motivo: "midia_excluida_biblioteca",
  };

  return {
    ...node,
    data: {
      ...node.data,
      configuracao_json: configuracao,
    },
  };
}

function mensagemExclusaoMidia(impacto?: ImpactoExclusaoMidia | null) {
  const totalBlocos = Number(impacto?.total_blocos_afetados || 0);
  const totalFluxos = Number(impacto?.total_fluxos_afetados || 0);
  const totalPausados = Number(impacto?.total_fluxos_pausados || 0);

  if (totalBlocos <= 0) {
    return "Midia excluida definitivamente.";
  }

  const partes = [
    `Midia excluida e removida de ${totalBlocos} bloco(s) em ${totalFluxos} fluxo(s).`,
  ];

  if (totalPausados > 0) {
    partes.push(
      `${totalPausados} fluxo(s) ativo(s) foram pausados ate selecionar outra midia.`
    );
  }

  partes.push(
    "Os blocos afetados precisam de uma nova midia antes de salvar/ativar."
  );

  return partes.join(" ");
}

function formatarTamanhoArquivo(bytes?: number | null) {
  const valor = Number(bytes || 0);

  if (!Number.isFinite(valor) || valor <= 0) {
    return "Tamanho não informado";
  }

  if (valor < 1024) {
    return `${valor} B`;
  }

  if (valor < 1024 * 1024) {
    return `${(valor / 1024).toFixed(1)} KB`;
  }

  return `${(valor / 1024 / 1024).toFixed(1)} MB`;
}

function mimeTypeParaUpload(arquivo: File) {
  const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "";
  const mimePorExtensao: Record<string, string> = {
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };

  return (
    mimePorExtensao[extensao] ||
    arquivo.type ||
    "application/octet-stream"
  );
}

async function lerRespostaApi(res: Response, mensagemPadrao: string) {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (contentType.includes("application/json")) {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw new Error(mensagemPadrao);
    }
  }

  if (!res.ok) {
    if (
      res.status === 413 ||
      /request entity too large|payload too large|function_payload_too_large/i.test(
        text
      )
    ) {
      throw new Error(
        "O arquivo excede o limite de upload aceito pelo servidor. Tente reduzir o tamanho e envie novamente."
      );
    }

    throw new Error(text || mensagemPadrao);
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export default function useFluxoMidias({
  podeGerenciarMidias,
  midiaUrlNode,
  setNodes,
  setFluxos,
  setFluxoSelecionado,
  onSelecionarMidia,
  onLimparMidiaSelecionada,
  onError,
  onClearError,
  onSuccess,
  onClearSuccess,
}: UseFluxoMidiasOptions) {
  const [midias, setMidias] = useState<MidiaOpcao[]>([]);
  const [carregandoMidias, setCarregandoMidias] = useState(false);
  const [enviandoMidia, setEnviandoMidia] = useState(false);
  const [modalMidiasAberto, setModalMidiasAberto] = useState(false);
  const [abaMidias, setAbaMidias] = useState<AbaMidias>("todas");
  const [midiaExcluindoId, setMidiaExcluindoId] = useState<string | null>(null);
  const [confirmandoExclusaoMidiaId, setConfirmandoExclusaoMidiaId] = useState<
    string | null
  >(null);

  const resumoMidias = useMemo(() => {
    const imagens = midias.filter((midia) => midia.tipo === "imagem");
    const videos = midias.filter((midia) => midia.tipo === "video");
    const audios = midias.filter((midia) => midia.tipo === "audio");
    const arquivos = midias.filter((midia) => midia.tipo === "arquivo");

    const tamanhoTotal = midias.reduce(
      (total, midia) => total + Number(midia.tamanho_bytes || 0),
      0
    );

    return {
      total: midias.length,
      imagens: imagens.length,
      videos: videos.length,
      audios: audios.length,
      arquivos: arquivos.length,
      tamanhoTotal,
    };
  }, [midias]);

  const limiteStorageMidiasAtingido =
    resumoMidias.tamanhoTotal >= LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES;

  const excedeLimiteStorageMidias = useCallback(
    (tamanhoArquivoBytes: number) => {
      return (
        resumoMidias.tamanhoTotal + Number(tamanhoArquivoBytes || 0) >
        LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES
      );
    },
    [resumoMidias.tamanhoTotal]
  );

  const carregarMidias = useCallback(
    async (tipo?: "imagem" | "video" | "audio") => {
      try {
        setCarregandoMidias(true);

        const params = tipo ? `?tipo=${tipo}` : "";

        const res = await fetch(`/api/automacoes/midias${params}`, {
          cache: "no-store",
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao carregar mídias.");
        }

        setMidias(json.midias || []);
      } catch (error: unknown) {
        onError(
          error instanceof Error ? error.message : "Erro ao carregar mídias."
        );
      } finally {
        setCarregandoMidias(false);
      }
    },
    [onError]
  );

  const enviarNovaMidia = useCallback(
    async (arquivo: File) => {
      if (!podeGerenciarMidias) {
        onError("Você não tem permissão para enviar mídias de fluxos.");
        return;
      }

      try {
        setEnviandoMidia(true);
        onClearError();
        onClearSuccess();

        const mimeTypeUpload = mimeTypeParaUpload(arquivo);

        if (excedeLimiteStorageMidias(arquivo.size)) {
          throw new Error(
            `Limite de ${formatarTamanhoArquivo(
              LIMITE_STORAGE_MIDIAS_EMPRESA_BYTES
            )} de mídias atingido. Exclua uma mídia antes de enviar outra.`
          );
        }

        const preparacaoRes = await fetch("/api/automacoes/midias/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            acao: "preparar_upload",
            nome: arquivo.name,
            mimeType: mimeTypeUpload,
            tamanhoBytes: arquivo.size,
          }),
        });

        const preparacaoJson = await lerRespostaApi(
          preparacaoRes,
          "Erro ao preparar envio da mídia."
        );

        if (!preparacaoRes.ok || !preparacaoJson.ok) {
          throw new Error(
            preparacaoJson.error || "Erro ao preparar envio da mídia."
          );
        }

        const upload = preparacaoJson.upload;

        if (!upload?.bucket || !upload?.path || !upload?.token) {
          throw new Error("Dados de upload inválidos.");
        }

        const supabase = createSupabaseBrowserClient();

        const { error: uploadError } = await supabase.storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.path, upload.token, arquivo, {
            contentType: mimeTypeUpload,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(
            uploadError.message || "Erro ao enviar mídia para o Storage."
          );
        }

        const conclusaoRes = await fetch("/api/automacoes/midias/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            acao: "concluir_upload",
            nome: arquivo.name,
            mimeType: mimeTypeUpload,
            tamanhoBytes: arquivo.size,
            storagePath: upload.path,
          }),
        });

        const conclusaoJson = await lerRespostaApi(
          conclusaoRes,
          "Erro ao concluir envio da mídia."
        );

        if (!conclusaoRes.ok || !conclusaoJson.ok) {
          throw new Error(
            conclusaoJson.error || "Erro ao concluir envio da mídia."
          );
        }

        const midiaEnviada: MidiaOpcao = conclusaoJson.midia;

        if (!midiaEnviada?.id || !midiaEnviada?.url) {
          throw new Error("A API não retornou os dados da mídia enviada.");
        }

        onSelecionarMidia(midiaEnviada.url, midiaEnviada.nome);

        setMidias((atuais) => {
          const jaExiste = atuais.some((midia) => midia.id === midiaEnviada.id);

          if (jaExiste) {
            return atuais;
          }

          return [midiaEnviada, ...atuais];
        });

        onSuccess(
          arquivo.type.startsWith("video/")
            ? "Vídeo enviado com sucesso."
            : "Mídia enviada com sucesso."
        );

        await carregarMidias();
      } catch (error: unknown) {
        onError(
          error instanceof Error ? error.message : "Erro ao enviar mídia."
        );
      } finally {
        setEnviandoMidia(false);
      }
    },
    [
      carregarMidias,
      excedeLimiteStorageMidias,
      onClearError,
      onClearSuccess,
      onError,
      onSelecionarMidia,
      onSuccess,
      podeGerenciarMidias,
    ]
  );

  const excluirMidiaDefinitivamente = useCallback(
    async (midia: MidiaOpcao) => {
      if (!podeGerenciarMidias) {
        onError("Você não tem permissão para excluir mídias de fluxos.");
        return;
      }

      try {
        onClearError();
        onClearSuccess();
        setMidiaExcluindoId(midia.id);

        const res = await fetch("/api/automacoes/midias", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: midia.id,
          }),
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao excluir mídia.");
        }

        const impacto = (json.impacto || null) as ImpactoExclusaoMidia | null;
        const fluxosAfetados = impacto?.fluxos_afetados || [];

        setMidias((atuais) => atuais.filter((item) => item.id !== midia.id));
        setNodes((atuais) =>
          atuais.map((node) => limparMidiaDoNode(node, midia))
        );

        if (midiaUrlNode === midia.url) {
          onLimparMidiaSelecionada();
        }

        if (fluxosAfetados.length > 0) {
          setFluxos((atuais) =>
            atuais.map((fluxo) => {
              const fluxoAfetado = fluxosAfetados.find(
                (item) => item.id === fluxo.id
              );

              if (!fluxoAfetado?.status_atual) return fluxo;

              return {
                ...fluxo,
                status: fluxoAfetado.status_atual as Fluxo["status"],
              };
            })
          );

          setFluxoSelecionado((atual) => {
            if (!atual) return atual;

            const fluxoAfetado = fluxosAfetados.find(
              (item) => item.id === atual.id
            );

            if (!fluxoAfetado?.status_atual) return atual;

            return {
              ...atual,
              status: fluxoAfetado.status_atual as Fluxo["status"],
            };
          });
        }

        setConfirmandoExclusaoMidiaId(null);
        onSuccess(
          json.storage_removido === false && json.storage_erro
            ? `${mensagemExclusaoMidia(
                impacto
              )} Aviso: o arquivo no Storage nao foi removido automaticamente.`
            : mensagemExclusaoMidia(impacto)
        );
      } catch (error: unknown) {
        onError(
          error instanceof Error ? error.message : "Erro ao excluir mídia."
        );
      } finally {
        setMidiaExcluindoId(null);
      }
    },
    [
      midiaUrlNode,
      onClearError,
      onClearSuccess,
      onError,
      onLimparMidiaSelecionada,
      onSuccess,
      podeGerenciarMidias,
      setFluxoSelecionado,
      setFluxos,
      setNodes,
    ]
  );

  const abrirGerenciadorMidias = useCallback((aba: AbaMidias) => {
    setAbaMidias(aba);
    setModalMidiasAberto(true);
  }, []);

  const fecharGerenciadorMidias = useCallback(() => {
    setModalMidiasAberto(false);
    setConfirmandoExclusaoMidiaId(null);
  }, []);

  return {
    midias,
    carregandoMidias,
    enviandoMidia,
    modalMidiasAberto,
    abaMidias,
    setAbaMidias,
    midiaExcluindoId,
    confirmandoExclusaoMidiaId,
    setConfirmandoExclusaoMidiaId,
    resumoMidias,
    limiteStorageMidiasAtingido,
    carregarMidias,
    enviarNovaMidia,
    excluirMidiaDefinitivamente,
    abrirGerenciadorMidias,
    fecharGerenciadorMidias,
  };
}
