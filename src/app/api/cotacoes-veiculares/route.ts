import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  CATEGORIAS_COTACAO,
  categoriaValida,
  configuracaoCotacao,
  consultarFaixas,
  calcularCotacaoPlanos,
  salvarCotacaoPlanos,
} from "@/lib/cotacoes-veiculares/servico";

async function autenticar() {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return { erro: NextResponse.json({ ok: false, error: contexto.error }, { status: contexto.status }) };
  const empresaId = contexto.usuario.empresa_id;
  if (!empresaId) return { erro: NextResponse.json({ ok: false, error: "Empresa não encontrada." }, { status: 403 }) };
  const nicho = await buscarNichoEmpresa(empresaId);
  if (nicho.codigo !== "seguro_veicular") return { erro: NextResponse.json({ ok: false, error: "Módulo exclusivo do nicho Seguro Veicular." }, { status: 403 }) };
  const permissoes = contexto.usuario.permissoes || [];
  const podeGerenciar = contexto.usuario.is_admin || permissoes.includes("cotacoes.gerenciar");
  const podeVer = podeGerenciar || permissoes.includes("cotacoes.visualizar");
  const podeConfigurar = contexto.usuario.is_admin || permissoes.includes("cotacoes.configurar");
  if (!podeVer) return { erro: NextResponse.json({ ok: false, error: "Sem permissão para consultar cotações." }, { status: 403 }) };
  return { empresaId, podeGerenciar, podeConfigurar };
}
function erro(e: unknown, status = 400) {
  return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro ao processar cotação." }, { status });
}
function inteiro(valor: unknown, nome: string, maximo = 2000000000) {
  const n = Number(valor);
  if (!Number.isSafeInteger(n) || n < 0 || n > maximo) throw new Error(nome + " inválido.");
  return n;
}

export async function GET(request: Request) {
  try {
    const acesso = await autenticar();
    if (acesso.erro) return acesso.erro;
    const empresaId = acesso.empresaId!;
    const categoriaBruta = new URL(request.url).searchParams.get("categoria") || "auto_leves";
    if (!categoriaValida(categoriaBruta)) return erro(new Error("Categoria inválida."));
    const supabase = getSupabaseAdmin();
    const [config, faixas, cotacoesResult, modelosResult] = await Promise.all([
      configuracaoCotacao(empresaId), consultarFaixas(empresaId, categoriaBruta),
      supabase.from("cotacao_veicular_cotacoes").select("*").eq("empresa_id",empresaId)
        .order("created_at",{ascending:false}).limit(100),
      supabase.from("cotacao_veicular_modelos_empresa").select("modelo,codigo_fipe",{count:"exact",head:true}).eq("empresa_id",empresaId),
    ]);
    if (cotacoesResult.error) throw cotacoesResult.error;
    return NextResponse.json({
      ok: true, config, faixas, cotacoes: cotacoesResult.data || [],
      modelos_especiais_total: modelosResult.count || 0,
      categorias: CATEGORIAS_COTACAO, pode_gerenciar: acesso.podeGerenciar, pode_configurar: acesso.podeConfigurar,
    });
  } catch (e) { console.error("[COTACOES_VEICULARES] GET",e); return erro(e,500); }
}

export async function POST(request: Request) {
  try {
    const acesso = await autenticar();
    if (acesso.erro) return acesso.erro;
    const empresaId = acesso.empresaId!;
    const body = await request.json() as Record<string, unknown>;
    const acao = String(body.acao || "");

    if (acao === "configurar") {
      if (!acesso.podeConfigurar) return erro(new Error("Sem permissão para configurar."),403);
      const tabelaValidada = body.tabela_validada === true;
      const iaHabilitada = body.ia_habilitada === true;
      if (iaHabilitada && !tabelaValidada) throw new Error("Valide a tabela antes de liberar a IA.");
      const referencia = String(body.referencia || "").trim().slice(0,160);
      if (!referencia) throw new Error("Informe a identificação e vigência da tabela.");
      const { error } = await getSupabaseAdmin().from("cotacao_veicular_configuracoes").upsert({
        empresa_id: empresaId,
        tabela_validada: tabelaValidada,
        ia_habilitada: iaHabilitada,
        referencia,
        validada_em: tabelaValidada ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },{onConflict:"empresa_id"});
      if (error) throw error;
      return NextResponse.json({ ok: true, config: await configuracaoCotacao(empresaId) });
    }

    if (acao === "preco") {
      if (!acesso.podeConfigurar) return erro(new Error("Sem permissão para editar preços."),403);
      if (!categoriaValida(body.categoria)) throw new Error("Categoria inválida.");
      const minimo = inteiro(body.fipe_min_centavos,"Faixa FIPE");
      const original = (await consultarFaixas(empresaId,body.categoria)).find(f=>Number(f.fipe_min_centavos)===minimo);
      if(!original) throw new Error("Faixa FIPE não localizada na tabela atual da empresa.");
      const premium = inteiro(body.premium_centavos,"Valor Premium",100000000);
      const completo = inteiro(body.completo_centavos,"Valor Completo",100000000);
      const { error } = await getSupabaseAdmin().from("cotacao_veicular_faixas").upsert({
        empresa_id: empresaId, categoria: body.categoria,
        fipe_min_centavos: minimo,
        fipe_max_centavos: original.fipe_max_centavos,
        codigo_premium: original.codigo_premium,
        premium_centavos: premium,
        codigo_completo: original.codigo_completo,
        completo_centavos: completo,
        revisar: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "empresa_id,categoria,fipe_min_centavos" });
      if (error) throw error;
      // Alterar o preço invalida aprovação anterior e desativa a cotação automática.
      const { error: revogarErro } = await getSupabaseAdmin().from("cotacao_veicular_configuracoes")
        .upsert({ empresa_id: empresaId, tabela_validada: false, ia_habilitada: false,
          validada_em: null, updated_at: new Date().toISOString() },{onConflict:"empresa_id"});
      if (revogarErro) throw revogarErro;
      return NextResponse.json({ ok: true });
    }

    if (acao !== "simular" && acao !== "salvar") throw new Error("Operação inválida.");
    if (!acesso.podeGerenciar) return erro(new Error("Sem permissão para gerar cotações."),403);
    if (!categoriaValida(body.categoria)) throw new Error("Categoria inválida.");
    const valorFipeCentavos = inteiro(body.valor_fipe_centavos,"Valor FIPE");
    const opcoes = body.opcionais_por_plano && typeof body.opcionais_por_plano === "object"
      ? body.opcionais_por_plano as Record<string,unknown> : {};
    const opcionaisPorPlano = {
      premium: Array.isArray(opcoes.premium) ? opcoes.premium.map(String) : [],
      completo: Array.isArray(opcoes.completo) ? opcoes.completo.map(String) : [],
    };
    const parametros = { empresaId, categoria: body.categoria, valorFipeCentavos,
      opcionaisPorPlano, origem: "manual" as const };
    if (acao === "simular") {
      return NextResponse.json({ ok: true, calculos: await calcularCotacaoPlanos(parametros) });
    }
    const veiculo = String(body.veiculo || "").trim();
    if (veiculo.length < 3) throw new Error("Informe marca e modelo do veículo.");
    const ano = body.ano_modelo == null || body.ano_modelo === "" ? null : inteiro(body.ano_modelo,"Ano",32000);
    if (ano !== null && ano < 1950) throw new Error("Ano do veículo inválido.");
    const resultado = await salvarCotacaoPlanos({
      ...parametros, veiculo, anoModelo: ano,
      nomeContato: String(body.nome_contato || "").slice(0,160),
      referenciaFipe: String(body.referencia_fipe || "").slice(0,100),
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) { console.error("[COTACOES_VEICULARES] POST",e); return erro(e); }
}
