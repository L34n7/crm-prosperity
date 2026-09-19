import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { qstash } from "@/lib/qstash/client";
import {
  getUsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getSupabaseAdmin();
const TAMANHO_LOTE = 100;

type ContatoImportacao = {
  nome?: string | null;
  telefone_original?: string;
  telefone_normalizado?: string;
  email?: string | null;
  origem?: string | null;
  origem_importacao?: string | null;
  campanha?: string | null;
  variavel_contato?: string | null;
  observacoes?: string | null;
  telefone_revisar?: boolean;
};

type ResultadoLote = {
  ok?: boolean;
  concluida?: boolean;
  ocupada?: boolean;
  ignorada?: boolean;
  erro?: string;
};

type RegistroImportacao = {
  nome: string | null;
  telefone: string;
  email: string | null;
  origem: string | null;
  campanha: string | null;
  variavel_contato: string | null;
  observacoes: string | null;
  telefone_revisar: boolean;
};

function telefoneImportacaoValido(telefone: string) {
  return telefone.length >= 8;
}

function obterWorkerUrl(request: Request) {
  return (
    process.env.QSTASH_IMPORTACAO_CONTATOS_WORKER_URL?.trim() ||
    request.url
  );
}

async function publicarProximoLote(params: {
  importacaoId: string;
  workerUrl: string;
  delay?: number;
}) {
  return qstash.publishJSON({
    url: params.workerUrl,
    body: { importacaoId: params.importacaoId },
    retries: 5,
    ...(params.delay ? { delay: params.delay } : {}),
  });
}

async function processarChamadaQStash(
  request: Request,
  bodyText: string,
  signature: string
) {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentSigningKey || !nextSigningKey) {
    return NextResponse.json(
      { ok: false, error: "Chaves de assinatura do QStash não configuradas." },
      { status: 500 }
    );
  }

  const receiver = new Receiver({
    currentSigningKey,
    nextSigningKey,
  });

  const assinaturaValida = await receiver.verify({
    signature,
    body: bodyText,
  });

  if (!assinaturaValida) {
    return NextResponse.json(
      { ok: false, error: "Assinatura QStash inválida." },
      { status: 401 }
    );
  }

  const body = JSON.parse(bodyText) as {
    importacaoId?: string;
  };

  if (!body.importacaoId) {
    return NextResponse.json(
      { ok: false, error: "importacaoId ausente." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc(
    "processar_lote_importacao_contatos",
    {
      p_importacao_id: body.importacaoId,
      p_tamanho_lote: TAMANHO_LOTE,
    }
  );

  if (error) {
    console.error("[IMPORTAÇÃO CONTATOS] Erro no RPC do lote", error);

    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const resultado = (data || {}) as ResultadoLote;

  if (resultado.ok !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: resultado.erro || "Falha ao processar lote da importação.",
      },
      { status: 500 }
    );
  }

  if (!resultado.concluida && !resultado.ocupada && !resultado.ignorada) {
    await publicarProximoLote({
      importacaoId: body.importacaoId,
      workerUrl: obterWorkerUrl(request),
      delay: 1,
    });
  }

  return NextResponse.json({
    ok: true,
    resultado,
  });
}

async function enfileirarImportacaoUsuario(request: Request, bodyText: string) {
  const resultado = await getUsuarioContexto();
  const auditMeta = getRequestAuditMetadata(request);

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  const bloqueio = bloquearSemPermissao(
    usuario,
    "contatos.importar",
    "Sem permissão para importar contatos",
  );
  if (bloqueio) return bloqueio;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = JSON.parse(bodyText);
  const contatos = Array.isArray(body?.contatos) ? body.contatos : [];
  const nomeLista = String(body?.nome_lista || "").trim();
  const arquivoNome = String(body?.arquivo_nome || "").trim() || null;
  const permitirContatosExistentes = body?.permitir_contatos_existentes === true;

  if (!nomeLista) {
    return NextResponse.json(
      { ok: false, error: "Informe um nome para a lista." },
      { status: 400 }
    );
  }

  if (nomeLista.length > 160) {
    return NextResponse.json(
      { ok: false, error: "O nome da lista deve ter no máximo 160 caracteres." },
      { status: 400 }
    );
  }

  if (!contatos.length) {
    return NextResponse.json(
      { ok: false, error: "Nenhum contato válido enviado para importação" },
      { status: 400 }
    );
  }

  const telefonesLote = new Set<string>();
  const registros: RegistroImportacao[] = [];
  const ignorados: Array<{ telefone: string; motivo: string }> = [];

  for (const contato of contatos as ContatoImportacao[]) {
    const telefone = normalizarTelefoneBrasilParaWhatsApp(
      contato.telefone_normalizado || contato.telefone_original || ""
    );

    if (!telefoneImportacaoValido(telefone)) {
      ignorados.push({
        telefone,
        motivo: "Telefone inválido",
      });
      continue;
    }

    if (telefonesLote.has(telefone)) {
      ignorados.push({
        telefone,
        motivo: "Telefone duplicado no lote",
      });
      continue;
    }

    telefonesLote.add(telefone);

    registros.push({
      nome: contato.nome?.trim() || null,
      telefone,
      email: contato.email?.trim()?.toLowerCase() || null,
      origem: contato.origem?.trim() || null,
      campanha: contato.campanha?.trim() || null,
      variavel_contato: contato.variavel_contato?.trim() || null,
      observacoes: contato.observacoes?.trim() || null,
      telefone_revisar:
        Boolean(contato.telefone_revisar) || telefone.length < 10,
    });
  }

  if (!registros.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Nenhum contato pôde ser enviado para a fila",
        ignorados,
      },
      { status: 400 }
    );
  }

  const telefonesRegistros = registros
    .map((registro) => String(registro.telefone || "").trim())
    .filter(Boolean);

  const { data: contatosExistentes, error: contatosExistentesError } =
    await supabaseAdmin.rpc("buscar_telefones_contatos_existentes", {
      p_empresa_id: usuario.empresa_id,
      p_telefones: telefonesRegistros,
    });

  if (contatosExistentesError) {
    return NextResponse.json(
      { ok: false, error: contatosExistentesError.message },
      { status: 500 }
    );
  }

  const contatosExistentesNormalizados = Array.isArray(contatosExistentes)
    ? (contatosExistentes as Array<{
        telefone_normalizado?: string | null;
      }>)
    : [];

  const telefonesExistentes = new Set(
    contatosExistentesNormalizados
      .map((item) => String(item.telefone_normalizado || "").trim())
      .filter(Boolean)
  );

  const registrosParaProcessar = permitirContatosExistentes
    ? registros
    : registros.filter(
        (registro) =>
          !telefonesExistentes.has(String(registro.telefone || "").trim())
      );

  if (!registrosParaProcessar.length) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Todos os contatos desta lista já existem no CRM. Ative a opção para permitir contatos repetidos entre listas ou escolha outro arquivo.",
      },
      { status: 409 }
    );
  }

  const { data: lista, error: listaError } = await supabaseAdmin
    .from("contatos_listas")
    .insert({
      empresa_id: usuario.empresa_id,
      nome: nomeLista,
      arquivo_nome: arquivoNome,
      permitir_contatos_existentes: permitirContatosExistentes,
      usuario_id: usuario.id,
    })
    .select("id, nome")
    .single();

  if (listaError || !lista) {
    const nomeDuplicado = listaError?.code === "23505";

    return NextResponse.json(
      {
        ok: false,
        error: nomeDuplicado
          ? "Já existe uma lista com esse nome. Escolha outro nome para continuar."
          : listaError?.message || "Não foi possível registrar a lista.",
      },
      { status: nomeDuplicado ? 409 : 500 }
    );
  }

  const { data: importacao, error: importacaoError } = await supabaseAdmin
    .from("contatos_importacoes")
    .insert({
      empresa_id: usuario.empresa_id,
      usuario_id: usuario.id,
      status: "pendente",
      total: registrosParaProcessar.length,
      payload_json: registrosParaProcessar,
      lista_id: lista.id,
      nome_lista: nomeLista,
      arquivo_nome: arquivoNome,
      permitir_contatos_existentes: permitirContatosExistentes,
    })
    .select("id")
    .single();

  if (importacaoError || !importacao) {
    await supabaseAdmin
      .from("contatos_listas")
      .delete()
      .eq("id", lista.id);

    return NextResponse.json(
      {
        ok: false,
        error:
          importacaoError?.message ||
          "Não foi possível criar a fila de importação.",
      },
      { status: 500 }
    );
  }

  try {
    await publicarProximoLote({
      importacaoId: importacao.id,
      workerUrl: obterWorkerUrl(request),
    });
  } catch (error) {
    const mensagemErro =
      error instanceof Error
        ? error.message
        : "Erro ao publicar a importação no QStash.";

    await supabaseAdmin
      .from("contatos_importacoes")
      .update({
        status: "erro",
        erro: mensagemErro,
        updated_at: new Date().toISOString(),
      })
      .eq("id", importacao.id);

    await supabaseAdmin
      .from("contatos_listas")
      .delete()
      .eq("id", lista.id);

    return NextResponse.json(
      { ok: false, error: mensagemErro },
      { status: 500 }
    );
  }

  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "contatos",
    entidade: "contato",
    entidade_id: importacao.id,
    acao: "importacao_contatos_enfileirada",
    descricao: `${registrosParaProcessar.length} contatos enviados para a fila de importação da lista "${nomeLista}"`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    depois: {
      importacao_id: importacao.id,
      lista_id: lista.id,
      nome_lista: nomeLista,
      permitir_contatos_existentes: permitirContatosExistentes,
      total: registrosParaProcessar.length,
      ignorados_antes_da_fila:
        ignorados.length + (registros.length - registrosParaProcessar.length),
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json(
    {
      ok: true,
      queued: true,
      importacao_id: importacao.id,
      lista_id: lista.id,
      nome_lista: nomeLista,
      permitir_contatos_existentes: permitirContatosExistentes,
      total: registrosParaProcessar.length,
      ignorados,
      message: `Lista "${nomeLista}" registrada e enviada para processamento.`,
    },
    { status: 202 }
  );
}

export async function POST(request: Request) {
  try {
    const bodyText = await request.text();
    const signature = request.headers.get("upstash-signature");

    if (signature) {
      return await processarChamadaQStash(request, bodyText, signature);
    }

    return await enfileirarImportacaoUsuario(request, bodyText);
  } catch (error) {
    console.error("[IMPORTAÇÃO CONTATOS] Erro", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao importar contatos",
      },
      { status: 500 }
    );
  }
}
