import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

const supabaseAdmin = getSupabaseAdmin();

export async function GET() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  const podeVisualizarEmpresas = await can(
    usuario.id,
    PERMISSAO_INTERNA_EMPRESAS
  );

  if (!podeVisualizarEmpresas) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para listar empresas" },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("empresas")
    .select(`
      id,
      nome_fantasia,
      razao_social,
      documento,
      email,
      telefone,
      nome_responsavel,
      status,
      white_label_id,
      white_label_tipo,
      cancelada_em,
      encerramento_backup_solicitado_em,
      exclusao_prevista_em,
      encerramento_backup_estado,
      encerramento_backup_path,
      encerramento_backup_gerado_em,
      encerramento_backup_erro,
      timezone,
      logo_url,
      observacoes,
      created_at,
      updated_at,
      plano_id,
      limite_integracoes_whatsapp,
      limite_usuarios,
      assinatura_status,
      restauracao_pendente_pagamento_em,
      assinatura_inicio_em,
      assinatura_vencimento_em,
      assinatura_bloqueio_em,
      assinatura_renovada_em,
      assinatura_gateway,
      assinatura_referencia,
      nicho_id,
      empresa_tokens_ia (
        limite_mensal,
        tokens_restantes,
        saldo_mensal_restante,
        saldo_avulso_restante,
        tokens_mensais_usados,
        tokens_avulsos_usados,
        periodo_inicio,
        periodo_fim,
        updated_at
      ),
      nichos (
        id,
        codigo,
        nome
      ),
      planos (
        id,
        nome,
        slug,
        preco_mensal_centavos,
        limite_integracoes_whatsapp,
        limite_usuarios
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  // Apenas um resumo administrativo: dados operacionais e credenciais já foram eliminados.
  const {data:historico,error:erroHistorico}=await supabaseAdmin
    .from("empresa_encerramento_financeiro")
    .select("cliente_id,empresa_nome,white_label_id,white_label_tipo,inicio_em,cancelada_em,backup_solicitado_em,excluida_em")
    .order("excluida_em",{ascending:false});
  if(erroHistorico){
    return NextResponse.json({ok:false,error:"Erro ao consultar histórico de exclusão: "+erroHistorico.message},{status:500});
  }
  const excluidas=(historico || []).map((item)=>({
    id:item.cliente_id,
    nome_fantasia:item.empresa_nome,
    razao_social:null,
    documento:null,
    email:"",
    telefone:null,
    nome_responsavel:null,
    status:"excluida" as const,
    white_label_id:item.white_label_id,
    white_label_tipo:item.white_label_tipo,
    cancelada_em:item.cancelada_em,
    encerramento_backup_solicitado_em:item.backup_solicitado_em,
    excluida_em:item.excluida_em,
    created_at:item.inicio_em,
    timezone:"",
    logo_url:null,
    observacoes:null,
    plano_id:"",
    limite_integracoes_whatsapp:null,
    limite_usuarios:null,
    assinatura_status:null,
    nicho_id:"",
    nichos:null,
    planos:null,
    empresa_tokens_ia:null,
  }));
  // Clientes White Label herdam o status financeiro da empresa gestora,
  // exceto se estão aguardando a primeira renovação após restauração.
  const clientesWhiteLabel=(data || []).filter(e =>
    e.white_label_tipo==="cliente" && !!e.white_label_id);
  let empresasAtuais=data ?? [];
  if(clientesWhiteLabel.length){
    const ids=[...new Set(clientesWhiteLabel.map(e=>String(e.white_label_id)))];
    const {data:gestoras,error:erroGestoras}=await supabaseAdmin.from("white_labels")
      .select("id,empresa_gestora_id").in("id",ids);
    if(erroGestoras){
      return NextResponse.json({ok:false,error:"Falha ao consultar cobrança White Label."},{status:500});
    }
    const gestoraIds=[...new Set((gestoras || [])
      .map(x=>String(x.empresa_gestora_id||"")).filter(Boolean))];
    const {data:empresasGestoras,error:erroEmpresasGestoras}=gestoraIds.length
      ? await supabaseAdmin.from("empresas")
        .select("id,assinatura_status,restauracao_pendente_pagamento_em").in("id",gestoraIds)
      : {data:[],error:null};
    if(erroEmpresasGestoras){
      return NextResponse.json({ok:false,error:"Falha ao consultar situação da gestora."},{status:500});
    }
    const responsaveis=new Map((gestoras||[]).map(w=>[w.id,w.empresa_gestora_id]));
    const statusGestora=new Map((empresasGestoras||[]).map(e=>[
      e.id,e.restauracao_pendente_pagamento_em ? "bloqueada" : e.assinatura_status
    ]));
    empresasAtuais=(data||[]).map(e=>{
      if(e.white_label_tipo!=="cliente" || !e.white_label_id) return e;
      const status=statusGestora.get(responsaveis.get(e.white_label_id)||"");
      return {...e,assinatura_status:
        e.restauracao_pendente_pagamento_em
          ? "bloqueada" : (status || e.assinatura_status)};
    });
  }
  return NextResponse.json({
    ok: true,
    empresas:[...empresasAtuais,...excluidas],
  });
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  const [podeAcessarEmpresas, podeCriarEmpresa] = await Promise.all([
    can(usuario.id, PERMISSAO_INTERNA_EMPRESAS),
    can(usuario.id, "empresas.criar"),
  ]);

  if (!podeAcessarEmpresas || !podeCriarEmpresa) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para criar empresa" },
      { status: 403 }
    );
  }

  const body = await request.json();

  const nome_fantasia = body?.nome_fantasia?.trim();
  const razao_social = body?.razao_social?.trim() || null;
  const documento = body?.documento?.trim() || null;
  const email = body?.email?.trim()?.toLowerCase();
  const telefone = body?.telefone?.trim() || null;
  const nome_responsavel = body?.nome_responsavel?.trim() || null;
  const plano_id = body?.plano_id || null;
  const nicho_id =
    body?.nicho_id || "10000000-0000-4000-8000-000000000001";
  const timezone = body?.timezone?.trim() || "America/Sao_Paulo";
  const logo_url = body?.logo_url?.trim() || null;
  const observacoes = body?.observacoes?.trim() || null;

  if (!nome_fantasia) {
    return NextResponse.json(
      { ok: false, error: "Nome fantasia é obrigatório" },
      { status: 400 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Email é obrigatório" },
      { status: 400 }
    );
  }

  if (!plano_id) {
    return NextResponse.json(
      { ok: false, error: "Plano é obrigatório" },
      { status: 400 }
    );
  }

  const { data: plano } = await supabaseAdmin
    .from("planos")
    .select("id")
    .eq("id", plano_id)
    .maybeSingle();

  if (!plano) {
    return NextResponse.json(
      { ok: false, error: "Plano não encontrado" },
      { status: 404 }
    );
  }

  const { data: nicho } = await supabaseAdmin
    .from("nichos")
    .select("id")
    .eq("id", nicho_id)
    .eq("ativo", true)
    .maybeSingle();

  if (!nicho) {
    return NextResponse.json(
      { ok: false, error: "Nicho não encontrado" },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("empresas")
    .insert([
      {
        plano_id,
        nicho_id,
        nome_fantasia,
        razao_social,
        documento,
        email,
        telefone,
        nome_responsavel,
        status: "ativa",
        timezone,
        logo_url,
        observacoes,
      },
    ])
    .select(`
      id,
      nome_fantasia,
      razao_social,
      documento,
      email,
      telefone,
      nome_responsavel,
      status,
      timezone,
      logo_url,
      observacoes,
      created_at,
      updated_at,
      plano_id,
      limite_integracoes_whatsapp,
      limite_usuarios,
      nicho_id,
      nichos (
        id,
        codigo,
        nome
      )
    `)
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Empresa criada com sucesso",
    empresa: data,
  });
}
