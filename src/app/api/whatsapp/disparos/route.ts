import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import { isAmbienteConfigurado } from "@/lib/whatsapp/ambiente-configurado";
import {
  montarRespostaLimiteMetaExcedido,
  reservarLimiteMeta,
} from "@/lib/whatsapp/meta-limites";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import {
  normalizarTelefoneItemDisparo,
  obterFlowControlKeyDisparo,
  publicarItensDisparoQstash,
} from "@/lib/whatsapp/disparo-fila";
import type { TemplatePayloadDisparo } from "@/lib/whatsapp/send-template-disparo";

type DestinatarioEntrada = {
  numero: string;
  contato_id?: string | null;
  variaveis?: string[];
};

type UsuarioPermissoes = Pick<
  UsuarioContexto,
  "assinatura" | "permissoes" | "perfil_dinamico_principal" | "perfis_dinamicos"
>;

type ConfigJsonWhatsapp = {
  access_token?: string;
  meta_token_response?: {
    access_token?: string;
  };
  phone_number_id?: string;
  embedded_signup?: {
    phone_number_id?: string;
    raw?: {
      data?: {
        phone_number_id?: string;
      };
    };
  };
};

type ConversaContato = {
  telefone?: string | null;
};

type ConversaComContato = {
  last_inbound_message_at?: string | null;
  contatos?: ConversaContato | ConversaContato[] | null;
};

const supabaseAdmin = getSupabaseAdmin();
const STATUS_CAMPANHAS_ATIVAS = ["pendente", "enviando"];

type CampanhaAtivaIntegracao = {
  id: string;
  nome: string | null;
  integracao_whatsapp_id: string | null;
  usuario_id: string | null;
  status: string | null;
  template_nome: string | null;
  total_itens: number | null;
  total_enviados: number | null;
  total_falhas: number | null;
  total_cancelados: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function limparNumero(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarNumeroComparacao(valor?: string | null) {
  const limpo = limparNumero(String(valor || ""));

  if (!limpo) return "";

  const normalizado = normalizarTelefoneBrasilParaWhatsApp(limpo);
  return limparNumero(normalizado || limpo);
}

function formatarDataHoraCampanha(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(data)
    .replace(",", "");
}

function montarNomeCampanhaDisparo(params: {
  nomeInformado?: string | null;
  total: number;
  data: Date;
}) {
  const nomeBase = String(params.nomeInformado || "")
    .replace(/\s+/g, " ")
    .trim();
  const base = nomeBase || "Disparo em massa";
  const total = Math.max(0, Math.trunc(Number(params.total || 0)));
  const unidade = total === 1 ? "contato" : "contatos";
  const sufixo = `${formatarDataHoraCampanha(params.data)} - ${total} ${unidade}`;

  return `${base} - ${sufixo}`.slice(0, 180);
}

function usuarioTemPermissao(usuario: UsuarioPermissoes, permissao: string) {
  const permissoes = Array.isArray(usuario?.permissoes)
    ? usuario.permissoes
    : [];
  return permissoes.includes(permissao);
}

function podeRealizarDisparos(usuario: UsuarioPermissoes) {
  if (usuario?.assinatura?.status === "bloqueada") {
    return false;
  }

  return (
    isAdministrador(usuario) ||
    usuarioTemPermissao(usuario, "whatsapp.disparos.enviar") ||
    usuarioTemPermissao(usuario, "mensagens.enviar")
  );
}

async function buscarCampanhaAtivaDaIntegracao(params: {
  empresaId: string;
  integracaoWhatsappId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_disparo_campanhas")
    .select(
      `
        id,
        nome,
        integracao_whatsapp_id,
        usuario_id,
        status,
        template_nome,
        total_itens,
        total_enviados,
        total_falhas,
        total_cancelados,
        created_at,
        updated_at
      `
    )
    .eq("empresa_id", params.empresaId)
    .eq("integracao_whatsapp_id", params.integracaoWhatsappId)
    .in("status", STATUS_CAMPANHAS_ATIVAS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao verificar disparo em andamento: ${error.message}`);
  }

  return (data || null) as CampanhaAtivaIntegracao | null;
}

function erroCampanhaAtivaPorIntegracao(error: unknown) {
  const erro = (error || null) as SupabaseErrorLike | null;
  const texto = `${erro?.message || ""} ${erro?.details || ""} ${
    erro?.hint || ""
  }`;

  return (
    erro?.code === "23505" &&
    texto.includes("whatsapp_disparo_campanhas_integracao_ativa_uidx")
  );
}

function respostaCampanhaAtivaPorIntegracao(
  campanha: CampanhaAtivaIntegracao | null
) {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Ja existe um disparo em massa em processamento nesta integracao WhatsApp. Aguarde a finalizacao antes de iniciar outro.",
      motivo: "disparo_em_massa_em_processamento_integracao",
      bloquear_disparos: true,
      bloqueio_escopo: "integracao",
      campanha,
    },
    { status: 409 }
  );
}

async function cancelarReservasLimiteMetaPorIds(
  reservaIds: string[],
  motivo: string
) {
  const ids = Array.from(new Set(reservaIds.filter(Boolean)));

  if (ids.length === 0) return;

  const { error } = await supabaseAdmin
    .from("whatsapp_meta_conversas_iniciadas")
    .update({
      status: "cancelado",
      updated_at: new Date().toISOString(),
    })
    .in("id", ids)
    .eq("status", "reservado");

  if (error) {
    console.warn(
      `[DISPAROS WHATSAPP] Erro ao cancelar reservas Meta apos ${motivo}:`,
      error
    );
  }
}

function obterContatoDaConversa(conversa: ConversaComContato) {
  if (Array.isArray(conversa.contatos)) {
    return conversa.contatos[0] || null;
  }

  return conversa.contatos || null;
}

async function obterTelefonesQueConsomemLimiteMeta(params: {
  empresaId: string;
  categoria?: string | null;
  telefones: string[];
}) {
  const telefonesSelecionados = Array.from(
    new Set(
      params.telefones
        .map((telefone) => normalizarNumeroComparacao(telefone))
        .filter((telefone) => telefone.length >= 10)
    )
  );

  if (telefonesSelecionados.length === 0) {
    return [];
  }

  if (String(params.categoria || "").trim().toLowerCase() !== "utility") {
    return telefonesSelecionados;
  }

  const { data: conversasData, error } = await supabaseAdmin
    .from("conversas")
    .select(
      `
        id,
        last_inbound_message_at,
        contatos:contato_id (
          id,
          telefone
        )
      `
    )
    .eq("empresa_id", params.empresaId);

  if (error) {
    throw new Error(`Erro ao validar conversas abertas: ${error.message}`);
  }

  const telefonesDentroDaJanela24h = new Set<string>();

  for (const conversaRaw of (conversasData || []) as ConversaComContato[]) {
    const contato = obterContatoDaConversa(conversaRaw);
    const telefoneContato = contato?.telefone || "";
    const telefoneNormalizado = normalizarNumeroComparacao(telefoneContato);
    const lastInboundMessageAt = conversaRaw.last_inbound_message_at || null;

    if (!telefoneNormalizado) continue;
    if (!telefonesSelecionados.includes(telefoneNormalizado)) continue;
    if (!lastInboundMessageAt) continue;

    const dataUltimaMensagemContato = new Date(lastInboundMessageAt).getTime();

    if (Number.isNaN(dataUltimaMensagemContato)) continue;

    const diffMs = Date.now() - dataUltimaMensagemContato;

    if (diffMs <= 24 * 60 * 60 * 1000) {
      telefonesDentroDaJanela24h.add(telefoneNormalizado);
    }
  }

  return telefonesSelecionados.filter(
    (telefone) => !telefonesDentroDaJanela24h.has(telefone)
  );
}

function obterCredenciaisBasicas(params: {
  phoneNumberId?: string | null;
  configJson: ConfigJsonWhatsapp | null;
}) {
  const config = params.configJson || {};
  const token = String(
    config.access_token || config.meta_token_response?.access_token || ""
  ).trim();
  const phoneNumberId = String(
    params.phoneNumberId ||
      config.phone_number_id ||
      config.embedded_signup?.phone_number_id ||
      config.embedded_signup?.raw?.data?.phone_number_id ||
      ""
  ).trim();

  return {
    token,
    phoneNumberId,
  };
}

async function inserirItensCampanha(params: {
  campanhaId: string;
  empresaId: string;
  integracaoWhatsappId: string;
  templateId: string;
  usuarioId: string | null;
  destinatarios: DestinatarioEntrada[];
  telefonesQueConsomemLimite: Set<string>;
}) {
  const payload = params.destinatarios.map((destinatario, index) => {
    const numero = limparNumero(destinatario.numero || "");
    const telefoneNormalizado = normalizarTelefoneItemDisparo(numero);
    const variaveis = Array.isArray(destinatario.variaveis)
      ? destinatario.variaveis.map((item) => String(item || ""))
      : [];

    return {
      campanha_id: params.campanhaId,
      empresa_id: params.empresaId,
      integracao_whatsapp_id: params.integracaoWhatsappId,
      template_id: params.templateId,
      usuario_id: params.usuarioId,
      contato_id: destinatario.contato_id || null,
      numero,
      telefone_normalizado: telefoneNormalizado,
      nome_contato: variaveis[0] || null,
      variaveis,
      status: "pendente",
      consome_limite_meta:
        telefoneNormalizado.length >= 10 &&
        params.telefonesQueConsomemLimite.has(telefoneNormalizado),
      metadata_json: {
        ordem: index + 1,
        origem: "/api/whatsapp/disparos",
      },
    };
  });

  const tamanhoLote = 500;
  const itensCriados: Array<{
    id: string;
    campanha_id: string;
    integracao_whatsapp_id: string;
  }> = [];

  for (let inicio = 0; inicio < payload.length; inicio += tamanhoLote) {
    const lote = payload.slice(inicio, inicio + tamanhoLote);
    const { data, error } = await supabaseAdmin
      .from("whatsapp_disparo_itens")
      .insert(lote)
      .select("id, campanha_id, integracao_whatsapp_id");

    if (error) {
      throw new Error(`Erro ao criar itens da campanha: ${error.message}`);
    }

    itensCriados.push(...(data || []));
  }

  return itensCriados;
}

export async function GET(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const limitParam = Number(req.nextUrl.searchParams.get("limit") || "50");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 100)
      : 50;

    const { data, error } = await supabaseAdmin
      .from("whatsapp_disparo_campanhas")
      .select(
        `
          id,
          nome,
          integracao_whatsapp_id,
          template_id,
          template_nome,
          template_idioma,
          status,
          total_itens,
          total_pendentes,
          total_processando,
          total_enviados,
          total_falhas,
          total_cancelados,
          pausa_motivo,
          erro,
          created_at,
          updated_at,
          finished_at
        `
      )
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar campanhas: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      campanhas: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();
    const auditMeta = getRequestAuditMetadata(req);

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    const integracaoWhatsappId = String(body?.integracao_whatsapp_id || "").trim();
    const templateId = String(body?.template_id || "").trim();
    const nomeCampanhaInformado = String(body?.nome_campanha || "")
      .replace(/\s+/g, " ")
      .trim();
    const destinatarios = Array.isArray(body?.destinatarios)
      ? (body.destinatarios as DestinatarioEntrada[])
      : [];

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const empresaId = usuario.empresa_id;

    if (!integracaoWhatsappId) {
      return NextResponse.json(
        { ok: false, error: "Integracao WhatsApp e obrigatoria." },
        { status: 400 }
      );
    }

    if (!templateId) {
      return NextResponse.json(
        { ok: false, error: "Template e obrigatorio." },
        { status: 400 }
      );
    }

    if (destinatarios.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Informe pelo menos um destinatario." },
        { status: 400 }
      );
    }

    if (!podeRealizarDisparos(usuario)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Voce nao tem permissao para realizar disparos.",
        },
        { status: 403 }
      );
    }

    const campanhaAtivaIntegracao = await buscarCampanhaAtivaDaIntegracao({
      empresaId,
      integracaoWhatsappId,
    });

    if (campanhaAtivaIntegracao) {
      return respostaCampanhaAtivaPorIntegracao(campanhaAtivaIntegracao);
    }

    const { data: integracao, error: integracaoError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select(
        `
          id,
          empresa_id,
          status,
          phone_number_status,
          onboarding_erro,
          phone_number_id,
          waba_id,
          token_ref,
          numero,
          nome_conexao,
          meta_messaging_limit,
          meta_messaging_limit_tier,
          meta_account_mode,
          config_json,
          payment_method_added,
          phone_registered,
          app_assigned,
          webhook_verificado,
          onboarding_etapa,
          onboarding_status,
          setup_completed_at
        `
      )
      .eq("id", integracaoWhatsappId)
      .single();

    if (integracaoError || !integracao) {
      return NextResponse.json(
        {
          ok: false,
          error: "Integracao WhatsApp nao encontrada.",
        },
        { status: 404 }
      );
    }

    if (integracao.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Voce nao pode usar esta integracao.",
        },
        { status: 403 }
      );
    }

    const statusIntegracao = String(integracao.status || "").toLowerCase();
    const statusNumeroMeta = String(
      integracao.phone_number_status || ""
    ).toLowerCase();

    if (
      ["bloqueado", "banido", "blocked", "banned"].includes(statusIntegracao) ||
      ["banned", "blocked"].includes(statusNumeroMeta)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A conta WhatsApp Business vinculada a esta integracao esta bloqueada ou desativada pela Meta.",
          detalhe:
            integracao.onboarding_erro ||
            "Acesse o Gerenciador do WhatsApp na Meta e solicite uma analise se acreditar que foi um engano.",
          motivo: "whatsapp_meta_bloqueado",
        },
        { status: 423 }
      );
    }

    if (!isAmbienteConfigurado(integracao)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Ambiente do WhatsApp ainda nao esta configurado. Conclua a configuracao antes de realizar disparos.",
          motivo: "whatsapp_ambiente_incompleto",
        },
        { status: 400 }
      );
    }

    const { data: template, error: templateError } = await supabaseAdmin
      .from("whatsapp_templates")
      .select(
        `
          id,
          empresa_id,
          integracao_whatsapp_id,
          nome,
          idioma,
          categoria,
          status,
          payload
        `
      )
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        {
          ok: false,
          error: "Template nao encontrado.",
        },
        { status: 404 }
      );
    }

    if (template.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Voce nao pode usar este template.",
        },
        { status: 403 }
      );
    }

    if (template.integracao_whatsapp_id !== integracaoWhatsappId) {
      return NextResponse.json(
        {
          ok: false,
          error: "O template nao pertence a integracao selecionada.",
        },
        { status: 400 }
      );
    }

    if (String(template.status || "").toUpperCase() !== "APPROVED") {
      return NextResponse.json(
        {
          ok: false,
          error: "Somente templates aprovados podem ser disparados.",
        },
        { status: 400 }
      );
    }

    const configJson = (integracao.config_json || null) as ConfigJsonWhatsapp | null;
    const credenciais = obterCredenciaisBasicas({
      phoneNumberId: integracao.phone_number_id,
      configJson,
    });

    if (!credenciais.token || !credenciais.phoneNumberId) {
      console.error("[DISPAROS WHATSAPP] Integracao sem token ou phone_number_id", {
        integracao_id: integracao.id,
        empresa_id: integracao.empresa_id,
        tem_token: Boolean(credenciais.token),
        tem_phone_number_id: Boolean(credenciais.phoneNumberId),
        token_ref: integracao.token_ref,
      });

      return NextResponse.json(
        {
          ok: false,
          error:
            "Integracao do WhatsApp incompleta. Reconecte a conta Meta ou atualize a integracao.",
        },
        { status: 400 }
      );
    }

    if (integracao.payment_method_added === false) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Nao foi possivel criar a campanha porque a conta WhatsApp Business ainda nao possui cartao cadastrado na Meta.",
          detalhe:
            "Cadastre um metodo de pagamento na conta WhatsApp Business dentro do Gerenciador da Meta e tente novamente.",
          motivo: "payment_method_missing",
        },
        { status: 402 }
      );
    }

    const telefonesQueConsomemLimite =
      await obterTelefonesQueConsomemLimiteMeta({
        empresaId,
        categoria: String(template.categoria || ""),
        telefones: destinatarios.map((item) => item.numero),
      });
    const telefonesQueConsomemLimiteSet = new Set(telefonesQueConsomemLimite);

    const reservaLimite = await reservarLimiteMeta({
      empresaId,
      integracao,
      telefones: telefonesQueConsomemLimite,
      origem: "disparo_template_fila",
      templateId: template.id,
      templateNome: template.nome,
      usuarioId: usuario.id,
      metadataJson: {
        total_destinatarios: destinatarios.length,
        total_consumem_limite_meta: telefonesQueConsomemLimite.length,
        rota: "/api/whatsapp/disparos",
        modelo_processamento: "fila",
      },
    });

    if (!reservaLimite.ok) {
      return NextResponse.json(
        montarRespostaLimiteMetaExcedido({
          limite: reservaLimite.limite,
          usados: reservaLimite.usados,
          restantes: reservaLimite.restantes,
          telefonesBloqueados: reservaLimite.telefonesBloqueados,
        }),
        { status: 429 }
      );
    }

    const campanhaCriadaEm = new Date();
    const nomeCampanha = montarNomeCampanhaDisparo({
      nomeInformado: nomeCampanhaInformado,
      total: destinatarios.length,
      data: campanhaCriadaEm,
    });

    const { data: campanha, error: campanhaError } = await supabaseAdmin
      .from("whatsapp_disparo_campanhas")
      .insert({
        empresa_id: empresaId,
        nome: nomeCampanha,
        integracao_whatsapp_id: integracaoWhatsappId,
        template_id: template.id,
        usuario_id: usuario.id,
        origem: "manual",
        status: "pendente",
        template_nome: template.nome,
        template_idioma: template.idioma || null,
        template_categoria: template.categoria || null,
        total_itens: destinatarios.length,
        total_pendentes: destinatarios.length,
        total_processando: 0,
        total_enviados: 0,
        total_falhas: 0,
        total_cancelados: 0,
        limite_meta: reservaLimite.limite,
        limite_meta_usados: reservaLimite.usados,
        limite_meta_restantes: reservaLimite.restantes,
        limite_meta_reserva_ids: reservaLimite.reservaIds,
        processamento_modo: "qstash",
        qstash_flow_control_key: obterFlowControlKeyDisparo(integracaoWhatsappId),
        qstash_publicados: 0,
        metadata_json: {
          template_payload: (template.payload || null) as TemplatePayloadDisparo | null,
          total_consumem_limite_meta: telefonesQueConsomemLimite.length,
          limite_meta_origem: reservaLimite.limiteInfo?.origem || null,
          limite_meta_tier: reservaLimite.limiteInfo?.tier || null,
          nome_campanha_informado: nomeCampanhaInformado || null,
        },
      })
      .select("id, nome, status, created_at")
      .single();

    if (campanhaError || !campanha) {
      const campanhaAtivaPorIntegracao =
        erroCampanhaAtivaPorIntegracao(campanhaError);

      await cancelarReservasLimiteMetaPorIds(
        reservaLimite.reservaIds,
        campanhaAtivaPorIntegracao
          ? "trava por integracao"
          : "erro ao criar campanha"
      );

      if (campanhaAtivaPorIntegracao) {
        const campanhaAtiva = await buscarCampanhaAtivaDaIntegracao({
          empresaId,
          integracaoWhatsappId,
        }).catch(() => null);

        return respostaCampanhaAtivaPorIntegracao(campanhaAtiva);
      }

      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao criar campanha de disparo: ${campanhaError?.message}`,
        },
        { status: 500 }
      );
    }

    let itensCriados: Array<{
      id: string;
      campanha_id: string;
      integracao_whatsapp_id: string;
    }> = [];
    let publicacaoQstash: Awaited<
      ReturnType<typeof publicarItensDisparoQstash>
    > | null = null;

    try {
      itensCriados = await inserirItensCampanha({
        campanhaId: campanha.id,
        empresaId,
        integracaoWhatsappId,
        templateId: template.id,
        usuarioId: usuario.id,
        destinatarios,
        telefonesQueConsomemLimite: telefonesQueConsomemLimiteSet,
      });

      publicacaoQstash = await publicarItensDisparoQstash({
        campanhaId: campanha.id,
        integracaoWhatsappId,
        itens: itensCriados,
      });
    } catch (errorItens) {
      await cancelarReservasLimiteMetaPorIds(
        reservaLimite.reservaIds,
        "erro ao criar itens da campanha"
      );

      await supabaseAdmin
        .from("whatsapp_disparo_campanhas")
        .update({
          status: "erro",
          erro:
            errorItens instanceof Error
              ? errorItens.message
              : "Erro ao criar itens da campanha.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", campanha.id);

      throw errorItens;
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: empresaId,
      categoria: "disparos",
      entidade: "disparo",
      entidade_id: campanha.id,
      acao: "disparo_em_massa_enfileirado",
      descricao: `${destinatarios.length} disparos enfileirados`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      depois: {
        campanha_id: campanha.id,
        total: destinatarios.length,
        template_id: template.id,
        template_nome: template.nome,
        integracao_whatsapp_id: integracaoWhatsappId,
        modelo_processamento: "fila",
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        campanha_id: campanha.id,
        campanha_nome: campanha.nome,
        status: campanha.status,
        total: destinatarios.length,
        total_pendentes: destinatarios.length,
        total_consumem_limite_meta: telefonesQueConsomemLimite.length,
        limite_meta: reservaLimite.limite,
        limite_meta_restantes: reservaLimite.restantes,
        processamento_modo: publicacaoQstash?.ok ? "qstash" : "cron_fallback",
        qstash_publicados: publicacaoQstash?.publicados || 0,
        qstash_flow_control_key:
          publicacaoQstash?.flowControlKey ||
          obterFlowControlKeyDisparo(integracaoWhatsappId),
        qstash_erro: publicacaoQstash?.erro || null,
        message:
          "Campanha criada. Os disparos serão processados gradualmente em segundo plano.",
        resultados: [],
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno.",
      },
      { status: 500 }
    );
  }
}
