import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { podeEnviarMidia, podeEnviarMensagens } from "@/lib/auth/authorization";
import { usuarioPodeVisualizarConversa as usuarioPodeAcessarConversa } from "@/lib/conversas/visibilidade";
import {
  CONVERSA_HISTORICO_IMPORTADO_MENSAGEM,
  isConversaHistoricoImportado,
} from "@/lib/conversas/historico-importado";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { canSendFreeformWhatsAppMessage } from "@/lib/whatsapp/can-send-message";
import { normalizarAssinaturaWhatsapp } from "@/lib/whatsapp/message-signature";
import {
  BUCKET_MENSAGENS_AGENDADAS,
  LIMITE_SEGURO_JANELA_MS,
  TIPO_AGENDAMENTO_MENSAGEM_MANUAL,
  type ItemMensagemAgendada,
} from "@/lib/whatsapp/mensagem-agendada";
import { publicarMensagemAgendadaQstash } from "@/lib/whatsapp/mensagem-agendada-qstash";

export const runtime = "nodejs";

const supabaseAdmin = getSupabaseAdmin();
const LIMITE_TOTAL_ARQUIVOS = 50 * 1024 * 1024;

type ConversaAcesso = {
  id: string;
  empresa_id: string;
  setor_id: string | null;
  escopo_fila?: string | null;
  responsavel_id: string | null;
  status?: string | null;
  historico_importado?: boolean | null;
  contato_id?: string | null;
  integracao_whatsapp_id?: string | null;
};

type ItemEntrada =
  | { tipo: "texto"; conteudo?: string }
  | { tipo: "arquivo"; file_index?: number; legenda?: string | null };

function detectarTipoMensagem(mimeType: string) {
  if (mimeType.startsWith("image/")) return "imagem" as const;
  if (mimeType.startsWith("audio/")) return "audio" as const;
  if (mimeType.startsWith("video/")) return "video" as const;
  return "documento" as const;
}

function validarTamanhoArquivo(file: File) {
  const tipo = detectarTipoMensagem(file.type || "application/octet-stream");
  const limite =
    tipo === "imagem"
      ? 5 * 1024 * 1024
      : tipo === "audio" || tipo === "video"
        ? 16 * 1024 * 1024
        : 50 * 1024 * 1024;

  if (file.size > limite) {
    const limiteMb = Math.round(limite / 1024 / 1024);
    throw new Error(`${file.name}: limite de ${limiteMb} MB excedido.`);
  }

  return tipo;
}

function sanitizarNomeArquivo(nome: string) {
  const limpo = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return limpo.slice(-140) || "arquivo";
}

async function limparUploads(paths: string[]) {
  if (!paths.length) return;

  try {
    await supabaseAdmin.storage
      .from(BUCKET_MENSAGENS_AGENDADAS)
      .remove(paths);
  } catch {
    // O agendamento não deve falhar novamente apenas porque a limpeza falhou.
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!(await podeEnviarMensagens(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para enviar mensagens" },
      { status: 403 }
    );
  }

  const { id: conversaId } = await params;
  const pathsEnviados: string[] = [];

  try {
    const formData = await request.formData();
    const executarEmRaw = String(formData.get("executar_em") || "").trim();
    const itensRaw = String(formData.get("itens_json") || "").trim();
    const files = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File);

    const executarEm = new Date(executarEmRaw);

    if (!executarEmRaw || !Number.isFinite(executarEm.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Horário de envio inválido." },
        { status: 400 }
      );
    }

    if (executarEm.getTime() <= Date.now() + 15_000) {
      return NextResponse.json(
        { ok: false, error: "Escolha um horário futuro para o envio." },
        { status: 400 }
      );
    }

    let itensEntrada: ItemEntrada[] = [];

    try {
      const parsed = JSON.parse(itensRaw);
      itensEntrada = Array.isArray(parsed) ? parsed : [];
    } catch {
      return NextResponse.json(
        { ok: false, error: "Conteúdo do agendamento inválido." },
        { status: 400 }
      );
    }

    if (!itensEntrada.length || itensEntrada.length > 20) {
      return NextResponse.json(
        {
          ok: false,
          error: "O agendamento deve ter entre 1 e 20 mensagens.",
        },
        { status: 400 }
      );
    }

    const possuiArquivo = itensEntrada.some(
      (item) => item?.tipo === "arquivo"
    );

    if (possuiArquivo && !(await podeEnviarMidia(usuario))) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para agendar mídias e arquivos" },
        { status: 403 }
      );
    }

    const tamanhoTotal = files.reduce((total, file) => total + file.size, 0);

    if (tamanhoTotal > LIMITE_TOTAL_ARQUIVOS) {
      return NextResponse.json(
        {
          ok: false,
          error: "Os arquivos deste agendamento somam mais de 50 MB.",
        },
        { status: 400 }
      );
    }

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select(
        "id, empresa_id, setor_id, escopo_fila, responsavel_id, status, historico_importado, contato_id, integracao_whatsapp_id"
      )
      .eq("id", conversaId)
      .maybeSingle<ConversaAcesso>();

    if (conversaError) throw new Error(conversaError.message);

    if (!conversa || conversa.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Conversa não encontrada." },
        { status: 404 }
      );
    }

    if (!(await usuarioPodeAcessarConversa(usuario, conversa))) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não pode agendar mensagens nesta conversa.",
        },
        { status: 403 }
      );
    }

    if (conversa.status === "fila" || conversa.responsavel_id !== usuario.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Assuma a conversa antes de programar mensagens.",
        },
        { status: 403 }
      );
    }

    if (isConversaHistoricoImportado(conversa)) {
      return NextResponse.json(
        { ok: false, error: CONVERSA_HISTORICO_IMPORTADO_MENSAGEM },
        { status: 400 }
      );
    }

    if (!conversa.contato_id || !conversa.integracao_whatsapp_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Conversa sem contato ou integração WhatsApp vinculada.",
        },
        { status: 400 }
      );
    }

    const janela = await canSendFreeformWhatsAppMessage({ conversaId });

    if (!janela.podeEnviarMensagemLivre || !janela.ultimaMensagemRecebidaEm) {
      return NextResponse.json(
        {
          ok: false,
          error:
            janela.motivoBloqueio || "A janela de atendimento está encerrada.",
          janela_24h: janela,
        },
        { status: 400 }
      );
    }

    const limiteSeguroMs =
      new Date(janela.ultimaMensagemRecebidaEm).getTime() +
      LIMITE_SEGURO_JANELA_MS;

    if (
      !Number.isFinite(limiteSeguroMs) ||
      executarEm.getTime() > limiteSeguroMs
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "O horário escolhido ultrapassa o limite seguro de 23 horas após a última mensagem do contato.",
          limite_janela_seguranca_em: Number.isFinite(limiteSeguroMs)
            ? new Date(limiteSeguroMs).toISOString()
            : null,
        },
        { status: 400 }
      );
    }

    const [
      { data: contato, error: contatoError },
      { data: protocolo, error: protocoloError },
    ] = await Promise.all([
      supabaseAdmin
        .from("contatos")
        .select("id, nome, telefone")
        .eq("id", conversa.contato_id)
        .eq("empresa_id", usuario.empresa_id)
        .maybeSingle(),
      supabaseAdmin
        .from("conversa_protocolos")
        .select("id")
        .eq("conversa_id", conversaId)
        .eq("empresa_id", usuario.empresa_id)
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (contatoError || !contato?.telefone) {
      return NextResponse.json(
        { ok: false, error: "Contato sem telefone válido." },
        { status: 400 }
      );
    }

    if (protocoloError) throw new Error(protocoloError.message);

    if (!protocolo?.id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A conversa não possui protocolo ativo para este atendimento.",
        },
        { status: 400 }
      );
    }

    const grupoId = randomUUID();
    const itens: ItemMensagemAgendada[] = [];

    for (const [ordem, item] of itensEntrada.entries()) {
      if (item.tipo === "texto") {
        const conteudo = String(item.conteudo || "").trim();

        if (!conteudo) {
          throw new Error(`A mensagem ${ordem + 1} está vazia.`);
        }

        itens.push({ tipo: "texto", conteudo });
        continue;
      }

      if (item.tipo !== "arquivo" || !Number.isInteger(item.file_index)) {
        throw new Error(`O item ${ordem + 1} é inválido.`);
      }

      const file = files[Number(item.file_index)];

      if (!(file instanceof File) || file.size <= 0) {
        throw new Error(`Arquivo do item ${ordem + 1} não encontrado.`);
      }

      const tipoMensagem = validarTamanhoArquivo(file);
      const nomeSeguro = sanitizarNomeArquivo(file.name);
      const storagePath = `${usuario.empresa_id}/${conversaId}/${grupoId}/${String(
        ordem + 1
      ).padStart(2, "0")}-${randomUUID()}-${nomeSeguro}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET_MENSAGENS_AGENDADAS)
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(
          `Não foi possível armazenar ${file.name}: ${uploadError.message}`
        );
      }

      pathsEnviados.push(storagePath);
      itens.push({
        tipo: "arquivo",
        tipo_mensagem: tipoMensagem,
        storage_bucket: BUCKET_MENSAGENS_AGENDADAS,
        storage_path: storagePath,
        mime_type: file.type || "application/octet-stream",
        filename: file.name,
        legenda: String(item.legenda || "").trim() || null,
      });
    }

    const primeiroTexto = itens.find((item) => item.tipo === "texto");
    const primeiroArquivo = itens.find((item) => item.tipo === "arquivo");
    const preview =
      primeiroTexto?.tipo === "texto"
        ? primeiroTexto.conteudo
        : primeiroArquivo?.tipo === "arquivo"
          ? primeiroArquivo.legenda || primeiroArquivo.filename
          : "Mensagem agendada";

    const payload = {
      origem: "conversa_agendada",
      origem_disparo: "conversa",
      canal_agenda: "whatsapp",
      conversa_id: conversaId,
      contato_id: contato.id,
      contato_nome: contato.nome || "Contato",
      conversa_protocolo_id: protocolo.id,
      integracao_whatsapp_id: conversa.integracao_whatsapp_id,
      numero_destino: contato.telefone,
      destino_tipo: "whatsapp",
      destino_rotulo: "WhatsApp",
      destino_valor: contato.telefone,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome || null,
      assinatura_whatsapp: normalizarAssinaturaWhatsapp(
        usuario.assinatura_whatsapp
      ),
      itens,
      total_mensagens: itens.length,
      ultima_mensagem_recebida_em: janela.ultimaMensagemRecebidaEm,
      limite_janela_seguranca_em: new Date(limiteSeguroMs).toISOString(),
      agendamento_grupo_id: grupoId,
      template_nome:
        itens.length > 1
          ? `${itens.length} mensagens programadas`
          : "Mensagem programada",
      tipo_label:
        itens.length > 1
          ? `${itens.length} mensagens da conversa`
          : "Mensagem da conversa",
      agendamento_titulo: `Mensagem programada · ${
        contato.nome || contato.telefone
      }`,
      conteudo_preview: String(preview || "").slice(0, 500),
      criado_por_usuario_id: usuario.id,
      criado_em: new Date().toISOString(),
    };

    const { data: agendamento, error: insertError } = await supabaseAdmin
      .from("automacao_agendamentos")
      .insert({
        empresa_id: usuario.empresa_id,
        execucao_id: null,
        fluxo_id: null,
        no_id: null,
        tipo_agendamento: TIPO_AGENDAMENTO_MENSAGEM_MANUAL,
        executar_em: executarEm.toISOString(),
        status: "pendente",
        payload_json: payload,
      })
      .select("id, executar_em, status, payload_json")
      .single();

    if (insertError) {
      throw new Error(
        `Não foi possível criar o agendamento: ${insertError.message}`
      );
    }

    const publicacao = await publicarMensagemAgendadaQstash({
      agendamentoId: agendamento.id,
      empresaId: usuario.empresa_id,
      executarEm: agendamento.executar_em,
    });

    const payloadComFila = {
      ...payload,
      processamento_modo: publicacao.modo,
      qstash_message_id: publicacao.messageId,
      qstash_publicado_em: publicacao.ok ? new Date().toISOString() : null,
      qstash_erro: publicacao.erro,
    };

    await supabaseAdmin
      .from("automacao_agendamentos")
      .update({ payload_json: payloadComFila })
      .eq("id", agendamento.id)
      .eq("status", "pendente");

    return NextResponse.json({
      ok: true,
      message: `Envio programado para ${new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(executarEm)}.`,
      agendamento: {
        id: agendamento.id,
        executar_em: agendamento.executar_em,
        status: agendamento.status,
        limite_janela_seguranca_em: new Date(limiteSeguroMs).toISOString(),
        processamento_modo: publicacao.modo,
      },
    });
  } catch (error) {
    await limparUploads(pathsEnviados);
    const mensagem =
      error instanceof Error
        ? error.message
        : "Não foi possível programar a mensagem.";

    console.error("[MENSAGEM AGENDADA] Erro ao criar:", error);

    return NextResponse.json(
      { ok: false, error: mensagem },
      { status: 500 }
    );
  }
}
