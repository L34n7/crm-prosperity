import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { podeRealizarDisparos } from "@/lib/whatsapp/disparo-permissoes";

function somenteDigitos(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarVariavelTemplate(valor: unknown) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function contarVariaveisTemplate(payload: any) {
  const componentes = Array.isArray(payload?.components)
    ? payload.components
    : [];

  const header = componentes.find(
    (item: any) =>
      String(item?.type || "").toUpperCase() === "HEADER"
  );

  const body = componentes.find(
    (item: any) =>
      String(item?.type || "").toUpperCase() === "BODY"
  );

  const buttons = componentes.find(
    (item: any) =>
      String(item?.type || "").toUpperCase() === "BUTTONS"
  );

  function contarTexto(texto?: string | null) {
    const matches =
      String(texto || "").match(/\{\{(\d+)\}\}/g) || [];

    const numeros = matches
      .map((item) => Number(item.replace(/[{}]/g, "")))
      .filter((numero) => Number.isFinite(numero));

    if (numeros.length === 0) return 0;

    return Math.max(...numeros);
  }

  const totalHeader = contarTexto(header?.text);
  const totalBody = contarTexto(body?.text);

  const totalBotoes = (buttons?.buttons || []).reduce(
    (total: number, button: any) => {
      if (
        String(button?.type || "").toUpperCase() !== "URL"
      ) {
        return total;
      }

      return total + contarTexto(button?.url);
    },
    0
  );

  return totalHeader + totalBody + totalBotoes;
}

export async function POST(request: NextRequest) {
  try {
    const resultado = await getUsuarioContexto();
    const auditMeta = getRequestAuditMetadata(request);

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (usuario.assinatura?.status === "bloqueada") {
      return NextResponse.json(
        {
          ok: false,
          code: "ASSINATURA_BLOQUEADA",
          error: "Plano bloqueado. Renove a assinatura para criar disparos.",
        },
        { status: 403 }
      );
    }

    if (!podeRealizarDisparos(usuario)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Voce nao tem permissao para agendar disparos.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const integracaoWhatsappId = String(body.integracao_whatsapp_id || "").trim();
    const templateId = String(body.template_id || "").trim();
    const executarEm = String(body.executar_em || "").trim();
    const nomeCampanha = String(body.nome_campanha || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90);
    const variaveis = Array.isArray(body.variaveis)
      ? body.variaveis
          .map((variavel: unknown) =>
            normalizarVariavelTemplate(variavel)
          )
          .slice(0, 3)
      : [];
    
    const contatos = Array.isArray(body.contatos) ? body.contatos : [];

    if (!integracaoWhatsappId) {
      return NextResponse.json(
        { ok: false, error: "Selecione uma integração WhatsApp." },
        { status: 400 }
      );
    }

    if (!templateId) {
      return NextResponse.json(
        { ok: false, error: "Selecione um template WhatsApp." },
        { status: 400 }
      );
    }

    if (!executarEm || Number.isNaN(new Date(executarEm).getTime())) {
      return NextResponse.json(
        { ok: false, error: "Informe uma data e hora válida para o agendamento." },
        { status: 400 }
      );
    }

    if (new Date(executarEm).getTime() <= Date.now()) {
      return NextResponse.json(
        { ok: false, error: "A data do agendamento precisa ser futura." },
        { status: 400 }
      );
    }

    if (contatos.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Selecione pelo menos um contato." },
        { status: 400 }
      );
    }

    const contatosValidos = contatos
      .map((contato: any) => ({
        id: String(contato.id || "").trim() || null,
        nome: contato.nome || null,
        telefone: somenteDigitos(contato.telefone || ""),
      }))
      .filter((contato: any) => contato.telefone.length >= 10);

    if (contatosValidos.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nenhum contato selecionado possui telefone válido." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: integracao, error: integracaoError } = await supabase
      .from("integracoes_whatsapp")
      .select("id, nome_conexao, numero, status")
      .eq("id", integracaoWhatsappId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (integracaoError || !integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada." },
        { status: 404 }
      );
    }

    const { data: template, error: templateError } = await supabase
      .from("whatsapp_templates")
      .select("id, nome, idioma, status, integracao_whatsapp_id, payload")
      .eq("id", templateId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (templateError || !template) {
      return NextResponse.json(
        { ok: false, error: "Template WhatsApp não encontrado." },
        { status: 404 }
      );
    }

    if (String(template.status || "").toUpperCase() !== "APPROVED") {
      return NextResponse.json(
        { ok: false, error: "O template selecionado ainda não está aprovado." },
        { status: 400 }
      );
    }

    if (template.integracao_whatsapp_id !== integracaoWhatsappId) {
      return NextResponse.json(
        {
          ok: false,
          error: "O template selecionado não pertence à integração WhatsApp escolhida.",
        },
        { status: 400 }
      );
    }

    const totalVariaveisTemplate = contarVariaveisTemplate(
      template.payload
    );

    if (totalVariaveisTemplate > 3) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Este template usa mais de 3 variáveis e não pode ser utilizado nesta tela.",
        },
        { status: 400 }
      );
    }

    const variaveisObrigatorias = variaveis.slice(
      0,
      totalVariaveisTemplate
    );

    if (
      totalVariaveisTemplate > 0 &&
      variaveisObrigatorias.length !== totalVariaveisTemplate
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Preencha todas as variáveis exigidas pelo template.",
        },
        { status: 400 }
      );
    }

    if (
      variaveisObrigatorias.some(
        (variavel: string) => !variavel
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Uma ou mais variáveis do template estão vazias.",
        },
        { status: 400 }
      );
    }

    const contatosIds = contatosValidos
      .map((contato: any) => contato.id)
      .filter((id: string | null): id is string => Boolean(id));

    const conversaPorContatoId = new Map<string, string>();

    if (contatosIds.length > 0) {
      const { data: conversasDosContatos, error: conversasError } =
        await supabase
          .from("conversas")
          .select("id, contato_id, integracao_whatsapp_id, last_message_at")
          .eq("empresa_id", usuario.empresa_id)
          .eq("integracao_whatsapp_id", integracaoWhatsappId)
          .in("contato_id", contatosIds)
          .order("last_message_at", {
            ascending: false,
            nullsFirst: false,
          });

      if (conversasError) {
        console.error(
          "[CRIAR_DISPARO_AGENDADO] Erro ao localizar conversas:",
          conversasError
        );

        return NextResponse.json(
          {
            ok: false,
            error: "Erro ao localizar as conversas dos contatos selecionados.",
          },
          { status: 500 }
        );
      }

      for (const conversa of conversasDosContatos || []) {
        if (
          conversa.contato_id &&
          !conversaPorContatoId.has(conversa.contato_id)
        ) {
          conversaPorContatoId.set(conversa.contato_id, conversa.id);
        }
      }
    }

    const agendamentoGrupoId = randomUUID();
    const registros = contatosValidos.map((contato: any) => ({
      empresa_id: usuario.empresa_id,
      execucao_id: null,
      fluxo_id: null,
      no_id: null,
      tipo_agendamento: "disparo_template",
      executar_em: executarEm,
      status: "pendente",
      payload_json: {
        conversa_id: contato.id
          ? conversaPorContatoId.get(contato.id) || null
          : null,
        contato_id: contato.id,
        conversa_protocolo_id: null,
        numero_destino: contato.telefone,

        template_id: template.id,
        template_nome: template.nome,
        template_idioma: template.idioma,
        template_payload: template.payload || null,
        integracao_whatsapp_id: integracaoWhatsappId,

        variaveis: variaveisObrigatorias,
        tempo_quantidade: null,
        tempo_unidade: null,
        segundos_para_agendar: null,

        origem: "manual_agendado",
        agendamento_grupo_id: agendamentoGrupoId,
        usuario_id: usuario.id,
        nome_campanha: nomeCampanha || null,
        contato_nome: contato.nome,
        integracao_nome: integracao.nome_conexao || integracao.numero || null,
        automacao_no_titulo: "Disparo manual agendado",
      },
    }));

    const { data: disparosCriados, error: insertError } = await supabase
      .from("automacao_agendamentos")
      .insert(registros)
      .select("id, executar_em, status, payload_json");

    if (insertError) {
      console.error("[CRIAR_DISPARO_AGENDADO] Erro ao inserir:", insertError);

      return NextResponse.json(
        { ok: false, error: "Erro ao criar disparo agendado." },
        { status: 500 }
      );
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "disparos",
      entidade: "disparo",
      entidade_id: disparosCriados?.[0]?.id || usuario.empresa_id,
      acao: "disparo_agendado_criado",
      descricao: `${disparosCriados?.length || 0} disparos agendados`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      depois: {
        quantidade: disparosCriados?.length || 0,
        executar_em: executarEm,
        template_id: template.id,
        template_nome: template.nome,
        integracao_whatsapp_id: integracaoWhatsappId,
        agendamento_grupo_id: agendamentoGrupoId,
        nome_campanha: nomeCampanha || null,
      },
      metadata: {
        disparos_ids: (disparosCriados || []).map((disparo) => disparo.id),
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      quantidade: disparosCriados?.length || 0,
      agendamento_grupo_id: agendamentoGrupoId,
      disparos: disparosCriados || [],
    });
  } catch (error: any) {
    console.error("[CRIAR_DISPARO_AGENDADO] Erro interno:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro interno ao criar disparo agendado.",
      },
      { status: 500 }
    );
  }
}
