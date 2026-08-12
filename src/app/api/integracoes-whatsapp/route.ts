import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { usuarioTemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  sanitizeWhatsAppIntegrationForClient,
} from "@/lib/whatsapp/access-token";
import {
  isWhatsAppIntegrationMode,
  type WhatsAppIntegrationMode,
} from "@/lib/whatsapp/integration-mode";
import {
  calcularProximaPosicaoLivre,
  listarIntegracoesWhatsappDaEmpresa,
  obterLimiteIntegracoesWhatsapp,
} from "@/lib/whatsapp/integracoes-multiplas";

async function getUsuarioLogado(permissao: string) {
  const contexto = await getUsuarioContexto();

  if (!contexto.ok) {
    return { error: contexto.error, status: contexto.status };
  }

  if (!usuarioTemPermissao(contexto.usuario, permissao)) {
    return {
      error: "Você não tem permissão para acessar integrações WhatsApp.",
      status: 403 as const,
    };
  }

  return { usuario: contexto.usuario };
}

function montarNomeConexaoPadrao(nomeEmpresa?: string | null) {
  if (nomeEmpresa && nomeEmpresa.trim()) {
    return `WhatsApp ${nomeEmpresa.trim()}`;
  }
  return "WhatsApp principal";
}

function montarNomeConexaoPorPosicao(
  posicao: number,
  nomeEmpresa?: string | null
) {
  if (posicao <= 1) return montarNomeConexaoPadrao(nomeEmpresa);
  return `WhatsApp ${posicao}`;
}

function erroDeRegistroDuplicado(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const erro = error as {
    code?: string;
    message?: string;
    details?: string;
  };

  return (
    erro.code === "23505" ||
    `${erro.message || ""} ${erro.details || ""}`.includes(
      "integracoes_whatsapp_numero_key"
    )
  );
}

function respostaIntegracao(integracao: Record<string, unknown>) {
  return sanitizeWhatsAppIntegrationForClient(integracao);
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getUsuarioLogado("whatsapp.integracao.visualizar");

    if ("error" in auth) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { usuario } = auth;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const integracaoIdParam = searchParams.get("integracao_id")?.trim() || "";

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .select("id, nome_fantasia, razao_social")
      .eq("id", usuario.empresa_id)
      .maybeSingle();

    if (empresaError || !empresa) {
      return NextResponse.json(
        { ok: false, error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    // 🔍 Busca integração existente
    let integracaoQuery = supabaseAdmin
      .from("integracoes_whatsapp")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("provider", "meta_official");

    if (integracaoIdParam) {
      integracaoQuery = integracaoQuery.eq("id", integracaoIdParam);
    } else {
      integracaoQuery = integracaoQuery.eq("posicao", 1);
    }

    const { data: integracaoExistente, error: integracaoError } =
      await integracaoQuery
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (integracaoError) {
      return NextResponse.json(
        { ok: false, error: integracaoError.message },
        { status: 500 }
      );
    }

    // ✅ Se já existe, retorna
    if (integracaoIdParam && !integracaoExistente) {
      return NextResponse.json(
        { ok: false, error: "IntegraÃ§Ã£o WhatsApp nÃ£o encontrada." },
        { status: 404 }
      );
    }

    if (integracaoExistente) {
      return NextResponse.json({
        ok: true,
        created: false,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
        },
        empresa: {
          id: empresa.id,
          nome: empresa.nome_fantasia || empresa.razao_social || "sua empresa",
        },
        integracao: respostaIntegracao(integracaoExistente),
        limite_integracoes_whatsapp:
          await obterLimiteIntegracoesWhatsapp(usuario.empresa_id),
      });
    }

    const agora = new Date().toISOString();
    const numeroPendente = `pendente_${usuario.empresa_id}_1`;

    // 🆕 Cria integração inicial
    const { data: novaIntegracao, error: createError } =
      await supabaseAdmin
        .from("integracoes_whatsapp")
        .insert({
          empresa_id: usuario.empresa_id,
          nome_conexao: montarNomeConexaoPadrao(empresa.nome_fantasia),
          numero: numeroPendente,
          provider: "meta_official",
          posicao: 1,
          status: "pendente",
          webhook_verificado: false,

          // onboarding
          onboarding_etapa: "inicio",
          onboarding_status: "pendente",
          modo_integracao: "cloud_api",
          modo_integracao_escolhido_em: null,
          phone_registered: false,
          payment_method_added: true,
          app_assigned: false,

          config_json: {},

          created_at: agora,
          updated_at: agora,
        })
        .select("*")
        .single();

    if (createError) {
      if (erroDeRegistroDuplicado(createError)) {
        const {
          data: integracaoCriadaEmParalelo,
          error: buscarConcorrenteError,
        } = await supabaseAdmin
          .from("integracoes_whatsapp")
          .select("*")
          .eq("empresa_id", usuario.empresa_id)
          .eq("provider", "meta_official")
          .eq("posicao", 1)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!buscarConcorrenteError && integracaoCriadaEmParalelo) {
          return NextResponse.json({
            ok: true,
            created: false,
            concurrent_creation: true,
            usuario: {
              id: usuario.id,
              nome: usuario.nome,
              email: usuario.email,
            },
            empresa: {
              id: empresa.id,
              nome:
                empresa.nome_fantasia ||
                empresa.razao_social ||
                "sua empresa",
            },
            integracao: respostaIntegracao(integracaoCriadaEmParalelo),
            limite_integracoes_whatsapp:
              await obterLimiteIntegracoesWhatsapp(usuario.empresa_id),
          });
        }
      }

      console.error(
        "[INTEGRACAO WHATSAPP] Erro ao criar integração inicial:",
        createError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "Não foi possível iniciar a configuração do WhatsApp.",
        },
        { status: 500 }
      );
    }

  return NextResponse.json({
    ok: true,
    created: true,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
    },
    empresa: {
      id: empresa.id,
      nome: empresa.nome_fantasia || empresa.razao_social || "sua empresa",
    },
    integracao: respostaIntegracao(novaIntegracao),
    limite_integracoes_whatsapp:
      await obterLimiteIntegracoesWhatsapp(usuario.empresa_id),
  });
  } catch (error) {
    console.error("Erro ao iniciar integração WhatsApp:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno." },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const auth = await getUsuarioLogado("whatsapp.integracao.configurar");

    if ("error" in auth) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { usuario } = auth;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "UsuÃ¡rio sem empresa vinculada." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .select("id, nome_fantasia, razao_social")
      .eq("id", usuario.empresa_id)
      .maybeSingle();

    if (empresaError || !empresa) {
      return NextResponse.json(
        { ok: false, error: "Empresa nÃ£o encontrada." },
        { status: 404 }
      );
    }

    const [limite, integracoes] = await Promise.all([
      obterLimiteIntegracoesWhatsapp(usuario.empresa_id),
      listarIntegracoesWhatsappDaEmpresa(usuario.empresa_id),
    ]);

    const proximaPosicao = calcularProximaPosicaoLivre(integracoes, limite);

    if (!proximaPosicao) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "O limite de integraÃ§Ãµes WhatsApp da empresa jÃ¡ foi atingido.",
          limite_integracoes_whatsapp: limite,
          total_integracoes_whatsapp: integracoes.length,
        },
        { status: 403 }
      );
    }

    const agora = new Date().toISOString();
    const numeroPendente = `pendente_${usuario.empresa_id}_${proximaPosicao}`;

    const { data: novaIntegracao, error: createError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .insert({
        empresa_id: usuario.empresa_id,
        nome_conexao: montarNomeConexaoPorPosicao(
          proximaPosicao,
          empresa.nome_fantasia
        ),
        numero: numeroPendente,
        provider: "meta_official",
        posicao: proximaPosicao,
        status: "pendente",
        webhook_verificado: false,
        onboarding_etapa: "inicio",
        onboarding_status: "pendente",
        modo_integracao: "cloud_api",
        modo_integracao_escolhido_em: null,
        phone_registered: false,
        payment_method_added: true,
        app_assigned: false,
        config_json: {},
        created_at: agora,
        updated_at: agora,
      })
      .select("*")
      .single();

    if (createError) {
      return NextResponse.json(
        { ok: false, error: createError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      created: true,
      posicao: proximaPosicao,
      limite_integracoes_whatsapp: limite,
      integracao: respostaIntegracao(novaIntegracao),
    });
  } catch (error) {
    console.error("[INTEGRACAO WHATSAPP] Erro ao criar nova integracao:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao criar nova integraÃ§Ã£o." },
      { status: 500 }
    );
  }
}

type PatchIntegrationPayload = {
  integracao_id?: string;
  modo_integracao?: WhatsAppIntegrationMode;
  nome_conexao?: string;
};

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getUsuarioLogado("whatsapp.integracao.configurar");

    if ("error" in auth) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!auth.usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | PatchIntegrationPayload
      | null;
    const integracaoId = String(body?.integracao_id || "").trim();
    const modoIntegracao = body?.modo_integracao;
    const deveAtualizarModo = modoIntegracao !== undefined;
    const deveAtualizarNome = body?.nome_conexao !== undefined;
    const nomeConexao = String(body?.nome_conexao || "").trim();

    if (
      !integracaoId ||
      (!deveAtualizarModo && !deveAtualizarNome) ||
      (deveAtualizarModo && !isWhatsAppIntegrationMode(modoIntegracao))
    ) {
      return NextResponse.json(
        { ok: false, error: "Dados da integração inválidos." },
        { status: 400 }
      );
    }

    if (deveAtualizarNome && (nomeConexao.length < 3 || nomeConexao.length > 80)) {
      return NextResponse.json(
        {
          ok: false,
          error: "O nome da integração deve ter entre 3 e 80 caracteres.",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: integracao, error: findError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .select("*")
      .eq("id", integracaoId)
      .eq("empresa_id", auth.usuario.empresa_id)
      .eq("provider", "meta_official")
      .maybeSingle();

    if (findError) {
      return NextResponse.json(
        { ok: false, error: findError.message },
        { status: 500 }
      );
    }

    if (!integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração WhatsApp não encontrada." },
        { status: 404 }
      );
    }

    if (
      (deveAtualizarModo && integracao.status === "ativa") ||
      (deveAtualizarModo && integracao.waba_id) ||
      (deveAtualizarModo && integracao.phone_number_id)
    ) {
      if (integracao.modo_integracao === modoIntegracao) {
        return NextResponse.json({
          ok: true,
          integracao: respostaIntegracao(integracao),
        });
      }

      return NextResponse.json(
        {
          ok: false,
          error:
            "O modo não pode ser alterado depois que a conexão com a Meta foi iniciada. Desconecte a integração para escolher outro modo.",
        },
        { status: 409 }
      );
    }

    const agora = new Date().toISOString();
    const atualizacoes: Record<string, unknown> = {
      updated_at: agora,
    };

    if (deveAtualizarNome) {
      atualizacoes.nome_conexao = nomeConexao;
      atualizacoes.config_json = {
        ...(integracao.config_json && typeof integracao.config_json === "object"
          ? integracao.config_json
          : {}),
        nome_conexao_definido_em: agora,
      };
    }

    if (deveAtualizarModo) {
      atualizacoes.modo_integracao = modoIntegracao;
      atualizacoes.modo_integracao_escolhido_em = agora;
      atualizacoes.coex_status =
        modoIntegracao === "coexistence" ? "pendente" : null;
      atualizacoes.is_on_biz_app = null;
      atualizacoes.platform_type = null;
      atualizacoes.onboarding_erro = null;
    }

    const { data: atualizada, error: updateError } = await supabaseAdmin
      .from("integracoes_whatsapp")
      .update(atualizacoes)
      .eq("id", integracao.id)
      .eq("empresa_id", auth.usuario.empresa_id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      integracao: respostaIntegracao(atualizada),
    });
  } catch (error) {
    console.error("[INTEGRACAO WHATSAPP] Erro ao escolher modo:", error);
    return NextResponse.json(
      { ok: false, error: "Erro interno ao escolher a integração." },
      { status: 500 }
    );
  }
}
