import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabase = getSupabaseAdmin();

async function contexto() {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) return resultado;
  if (!resultado.usuario.empresa_id) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Usuário sem empresa vinculada.",
    };
  }
  return {
    ok: true as const,
    usuario: resultado.usuario,
    empresaId: resultado.usuario.empresa_id,
  };
}

function normalizarBaseUrl(valor: unknown) {
  return String(valor || "").trim().replace(/\/$/, "");
}

function validarUrlHttps(valor: string) {
  try {
    const url = new URL(valor);
    if (url.protocol !== "https:") throw new Error();
    return url;
  } catch {
    throw new Error("Use uma URL HTTPS válida.");
  }
}

function enderecoIpv4Privado(endereco: string) {
  const partes = endereco.split(".").map(Number);
  if (partes.length !== 4 || partes.some((parte) => Number.isNaN(parte))) {
    return true;
  }
  const [a, b] = partes;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function enderecoPrivado(endereco: string) {
  const versao = isIP(endereco);
  if (versao === 4) return enderecoIpv4Privado(endereco);
  if (versao === 6) {
    const valor = endereco.toLowerCase();
    return (
      valor === "::" ||
      valor === "::1" ||
      valor.startsWith("fc") ||
      valor.startsWith("fd") ||
      valor.startsWith("fe8") ||
      valor.startsWith("fe9") ||
      valor.startsWith("fea") ||
      valor.startsWith("feb") ||
      valor.startsWith("2001:db8") ||
      valor.startsWith("::ffff:127.") ||
      valor.startsWith("::ffff:10.") ||
      valor.startsWith("::ffff:192.168.")
    );
  }
  return true;
}

async function validarDestinoExterno(url: URL) {
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    !hostname.includes(".")
  ) {
    throw new Error("A URL deve apontar para um servidor público.");
  }

  if (isIP(hostname) && enderecoPrivado(hostname)) {
    throw new Error("Endereços privados ou locais não são permitidos.");
  }

  const enderecos = await lookup(hostname, { all: true, verbatim: true });
  if (!enderecos.length || enderecos.some((item) => enderecoPrivado(item.address))) {
    throw new Error("A URL não pode resolver para uma rede privada ou local.");
  }
}

function criptografarToken(valor: string) {
  const segredo =
    process.env.CREDENTIALS_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!segredo) {
    throw new Error(
      "Configure CREDENTIALS_ENCRYPTION_KEY para armazenar credenciais externas.",
    );
  }

  const chave = createHash("sha256").update(segredo).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave, iv);
  const conteudo = Buffer.concat([
    cipher.update(valor, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    conteudo.toString("base64"),
  ].join(":");
}

export async function GET() {
  const ctx = await contexto();
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status },
    );
  }

  const [integracoesResult, rotinasResult, execucoesResult, templatesResult] =
    await Promise.all([
      supabase
        .from("integracoes_api_externas")
        .select(
          "id,nome,tipo,base_url,codigo_empresa,status,ultimo_teste_em,ultimo_erro,created_at",
        )
        .eq("empresa_id", ctx.empresaId)
        .order("created_at", { ascending: false }),
      supabase
        .from("automacoes_api_rotinas")
        .select(
          "id,nome,consulta_chave,endpoint,metodo,template_id,frequencia,horario,status,proxima_execucao_em,ultima_execucao_em,ultimo_erro,total_processados,integracao_id,created_at",
        )
        .eq("empresa_id", ctx.empresaId)
        .order("created_at", { ascending: false }),
      supabase
        .from("automacoes_api_execucoes")
        .select("status,mensagens_enviadas,iniciada_em")
        .eq("empresa_id", ctx.empresaId)
        .gte(
          "iniciada_em",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        ),
      supabase
        .from("whatsapp_templates")
        .select("id,nome,status")
        .eq("empresa_id", ctx.empresaId)
        .eq("status", "APPROVED")
        .order("nome"),
    ]);

  const erro =
    integracoesResult.error ||
    rotinasResult.error ||
    execucoesResult.error ||
    templatesResult.error;
  if (erro) {
    return NextResponse.json(
      { ok: false, error: erro.message },
      { status: 500 },
    );
  }

  const execucoes = execucoesResult.data || [];
  const concluidas = execucoes.filter((item) => item.status !== "executando");
  const sucessos = concluidas.filter((item) => item.status === "sucesso").length;

  return NextResponse.json({
    ok: true,
    integracoes: integracoesResult.data || [],
    rotinas: rotinasResult.data || [],
    templates: templatesResult.data || [],
    metricas: {
      total_rotinas: rotinasResult.data?.length || 0,
      rotinas_ativas:
        rotinasResult.data?.filter((item) => item.status === "ativa").length ||
        0,
      com_erro:
        rotinasResult.data?.filter((item) => item.status === "erro").length || 0,
      enviados_30_dias: execucoes.reduce(
        (total, item) => total + Number(item.mensagens_enviadas || 0),
        0,
      ),
      taxa_execucao: concluidas.length
        ? Number(((sucessos / concluidas.length) * 100).toFixed(1))
        : null,
    },
  });
}

export async function POST(request: NextRequest) {
  const ctx = await contexto();
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status },
    );
  }

  const body = await request.json();
  const acao = String(body?.acao || "");

  if (acao === "testar_conexao") {
    const baseUrl = normalizarBaseUrl(body?.base_url);
    const token = String(body?.token || "").trim();

    try {
      const url = validarUrlHttps(baseUrl);
      await validarDestinoExterno(url);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let resposta: Response;
      try {
        resposta = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (resposta.status === 401 || resposta.status === 403) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "O servidor respondeu, mas recusou a autenticação. Confira o token ou o método exigido pelo ERP.",
          },
          { status: 400 },
        );
      }

      if (resposta.status >= 500) {
        return NextResponse.json(
          {
            ok: false,
            error: `O sistema externo respondeu com erro ${resposta.status}.`,
          },
          { status: 502 },
        );
      }

      return NextResponse.json({
        ok: true,
        status: resposta.status,
        message: `Servidor alcançado com resposta HTTP ${resposta.status}.`,
      });
    } catch (error) {
      const mensagem =
        error instanceof Error && error.name === "AbortError"
          ? "O sistema externo não respondeu dentro de 10 segundos."
          : error instanceof Error
            ? error.message
            : "Não foi possível testar a conexão.";
      return NextResponse.json({ ok: false, error: mensagem }, { status: 400 });
    }
  }

  if (acao === "criar_integracao") {
    const nome = String(body?.nome || "").trim();
    const baseUrl = normalizarBaseUrl(body?.base_url);
    const token = String(body?.token || "").trim();

    if (!nome || !baseUrl) {
      return NextResponse.json(
        { ok: false, error: "Informe nome e URL base." },
        { status: 400 },
      );
    }

    try {
      const url = validarUrlHttps(baseUrl);
      await validarDestinoExterno(url);
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error ? error.message : "Use uma URL HTTPS válida.",
        },
        { status: 400 },
      );
    }

    let tokenCriptografado: string | null = null;
    if (token) {
      try {
        tokenCriptografado = criptografarToken(token);
      } catch (error) {
        return NextResponse.json(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível proteger o token.",
          },
          { status: 500 },
        );
      }
    }

    const { data, error } = await supabase
      .from("integracoes_api_externas")
      .insert({
        empresa_id: ctx.empresaId,
        nome,
        base_url: baseUrl,
        token_criptografado: tokenCriptografado,
        codigo_empresa: String(body?.codigo_empresa || "").trim() || null,
        status: "nao_testada",
      })
      .select("id,nome,tipo,base_url,codigo_empresa,status,created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, integracao: data });
  }

  if (acao === "criar_rotina") {
    const integracaoId = String(body?.integracao_id || "");
    const nome = String(body?.nome || "").trim();
    const endpoint = String(body?.endpoint || "").trim();
    const consultaChave = String(
      body?.consulta_chave || "personalizada",
    ).trim();

    if (!integracaoId || !nome || !endpoint.startsWith("/")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Informe integração, nome e endpoint iniciado por /.",
        },
        { status: 400 },
      );
    }

    const { data: integracao } = await supabase
      .from("integracoes_api_externas")
      .select("id")
      .eq("id", integracaoId)
      .eq("empresa_id", ctx.empresaId)
      .maybeSingle();
    if (!integracao) {
      return NextResponse.json(
        { ok: false, error: "Integração inválida." },
        { status: 404 },
      );
    }

    const { data, error } = await supabase
      .from("automacoes_api_rotinas")
      .insert({
        empresa_id: ctx.empresaId,
        integracao_id: integracaoId,
        nome,
        consulta_chave: consultaChave,
        endpoint,
        metodo: body?.metodo === "POST" ? "POST" : "GET",
        template_id: body?.template_id || null,
        frequencia: ["diaria", "semanal", "mensal"].includes(body?.frequencia)
          ? body.frequencia
          : "diaria",
        horario: String(body?.horario || "09:00"),
        status: "pausada",
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, rotina: data });
  }

  return NextResponse.json(
    { ok: false, error: "Ação inválida." },
    { status: 400 },
  );
}

export async function PATCH(request: NextRequest) {
  const ctx = await contexto();
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status },
    );
  }

  const body = await request.json();
  const id = String(body?.id || "");
  const status = String(body?.status || "");
  if (!id || !["ativa", "pausada"].includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Dados inválidos." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("automacoes_api_rotinas")
    .update({
      status,
      updated_at: new Date().toISOString(),
      ultimo_erro: null,
    })
    .eq("id", id)
    .eq("empresa_id", ctx.empresaId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
