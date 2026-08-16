import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import {
  PODOGRAMA_BUCKET_FOTOS,
  PODOGRAMA_LADOS,
  PODOGRAMA_OCORRENCIAS,
  PODOGRAMA_SEVERIDADES,
  PODOGRAMA_STATUS,
  PODOGRAMA_VISTAS,
  valorPermitido,
} from "@/lib/podograma/config";

export const dynamic = "force-dynamic";

const supabase = getSupabaseAdmin();

type PacienteRow = {
  id: string;
  empresa_id: string;
  pessoa_id: string;
};

type FotoRow = {
  id: string;
  empresa_id: string;
  paciente_id: string;
  marcacao_id: string;
  storage_path: string;
  nome_original: string;
  mime_type: string;
  tamanho_bytes: number;
  momento: string;
  legenda: string | null;
  created_at: string;
};

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function numeroPercentual(valor: unknown) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 && numero <= 100
    ? Math.round(numero * 1000) / 1000
    : null;
}

async function garantirAcessoPodograma(
  permissoes: string[],
  permissao: string,
  empresaId: string,
) {
  if (!can(permissoes, permissao)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Sem permissão para acessar o Podograma." },
        { status: 403 },
      ),
    };
  }

  const nicho = await buscarNichoEmpresa(empresaId);

  if (
    nicho.codigo !== "podologia" ||
    !nicho.modulos.includes("saude.prontuarios")
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Podograma disponível apenas para empresas de Podologia." },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, nicho };
}

async function buscarPacienteEmpresa(empresaId: string, pacienteId: string) {
  const { data, error } = await supabase
    .from("pacientes")
    .select("id, empresa_id, pessoa_id")
    .eq("empresa_id", empresaId)
    .eq("id", pacienteId)
    .maybeSingle<PacienteRow>();

  if (error) throw new Error(`Erro ao localizar paciente: ${error.message}`);
  return data;
}

async function validarAtendimento(
  empresaId: string,
  pacienteId: string,
  atendimentoId: string | null,
) {
  if (!atendimentoId) return null;

  const { data, error } = await supabase
    .from("prontuario_atendimentos")
    .select("id, data_atendimento, tipo")
    .eq("empresa_id", empresaId)
    .eq("paciente_id", pacienteId)
    .eq("id", atendimentoId)
    .maybeSingle();

  if (error) throw new Error(`Erro ao validar atendimento: ${error.message}`);
  return data;
}

async function assinarFoto(foto: FotoRow) {
  const { data, error } = await supabase.storage
    .from(PODOGRAMA_BUCKET_FOTOS)
    .createSignedUrl(foto.storage_path, 60 * 60);

  return {
    ...foto,
    url: error ? null : data?.signedUrl ?? null,
  };
}

export async function GET(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status },
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 },
    );
  }

  try {
    const acesso = await garantirAcessoPodograma(
      usuario.permissoes,
      "prontuarios.visualizar",
      usuario.empresa_id,
    );

    if (!acesso.ok) return acesso.response;

    const { searchParams } = new URL(request.url);
    const pacienteId = texto(searchParams.get("paciente_id"));

    if (!pacienteId) {
      return NextResponse.json(
        { ok: false, error: "Selecione um paciente." },
        { status: 400 },
      );
    }

    const paciente = await buscarPacienteEmpresa(usuario.empresa_id, pacienteId);

    if (!paciente) {
      return NextResponse.json(
        { ok: false, error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const [marcacoesResult, atendimentosResult] = await Promise.all([
      supabase
        .from("podograma_marcacoes")
        .select(
          "id, empresa_id, paciente_id, pessoa_id, atendimento_id, lado, vista, coordenada_x, coordenada_y, coordenada_z, regiao_anatomica, tipo_ocorrencia, severidade, status, procedimento, observacoes, modelo_versao, resolvido_em, created_at, updated_at",
        )
        .eq("empresa_id", usuario.empresa_id)
        .eq("paciente_id", paciente.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("prontuario_atendimentos")
        .select("id, data_atendimento, tipo, queixa_principal")
        .eq("empresa_id", usuario.empresa_id)
        .eq("paciente_id", paciente.id)
        .order("data_atendimento", { ascending: false })
        .limit(100),
    ]);

    if (marcacoesResult.error) {
      throw new Error(`Erro ao carregar Podograma: ${marcacoesResult.error.message}`);
    }

    if (atendimentosResult.error) {
      throw new Error(`Erro ao carregar atendimentos: ${atendimentosResult.error.message}`);
    }

    const marcacoes = marcacoesResult.data ?? [];
    const ids = marcacoes.map((marcacao) => marcacao.id);
    let fotos: Array<FotoRow & { url: string | null }> = [];

    if (ids.length > 0) {
      const { data: fotosRaw, error: fotosError } = await supabase
        .from("podograma_fotos")
        .select(
          "id, empresa_id, paciente_id, marcacao_id, storage_path, nome_original, mime_type, tamanho_bytes, momento, legenda, created_at",
        )
        .eq("empresa_id", usuario.empresa_id)
        .eq("paciente_id", paciente.id)
        .in("marcacao_id", ids)
        .order("created_at", { ascending: false });

      if (fotosError) {
        throw new Error(`Erro ao carregar fotos do Podograma: ${fotosError.message}`);
      }

      fotos = await Promise.all((fotosRaw ?? []).map((foto) => assinarFoto(foto as FotoRow)));
    }

    const fotosPorMarcacao = new Map<string, typeof fotos>();
    for (const foto of fotos) {
      const atuais = fotosPorMarcacao.get(foto.marcacao_id) ?? [];
      atuais.push(foto);
      fotosPorMarcacao.set(foto.marcacao_id, atuais);
    }

    return NextResponse.json({
      ok: true,
      contexto: { nicho: acesso.nicho },
      paciente,
      marcacoes: marcacoes.map((marcacao) => ({
        ...marcacao,
        fotos: fotosPorMarcacao.get(marcacao.id) ?? [],
      })),
      atendimentos: atendimentosResult.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno ao carregar Podograma.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status },
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 },
    );
  }

  try {
    const acesso = await garantirAcessoPodograma(
      usuario.permissoes,
      "prontuarios.editar",
      usuario.empresa_id,
    );

    if (!acesso.ok) return acesso.response;

    const body = await request.json();
    const id = texto(body?.id) || null;
    const pacienteId = texto(body?.paciente_id);
    const atendimentoId = texto(body?.atendimento_id) || null;
    const lado = texto(body?.lado);
    const vista = texto(body?.vista);
    const tipoOcorrencia = texto(body?.tipo_ocorrencia);
    const severidade = texto(body?.severidade) || "moderada";
    const status = texto(body?.status) || "ativa";
    const regiaoAnatomica = texto(body?.regiao_anatomica).slice(0, 100);
    const coordenadaX = numeroPercentual(body?.coordenada_x);
    const coordenadaY = numeroPercentual(body?.coordenada_y);

    if (!pacienteId) {
      return NextResponse.json(
        { ok: false, error: "Selecione um paciente." },
        { status: 400 },
      );
    }

    if (!valorPermitido(PODOGRAMA_LADOS, lado)) {
      return NextResponse.json({ ok: false, error: "Lado do pé inválido." }, { status: 400 });
    }

    if (!valorPermitido(PODOGRAMA_VISTAS, vista)) {
      return NextResponse.json({ ok: false, error: "Vista anatômica inválida." }, { status: 400 });
    }

    if (!valorPermitido(PODOGRAMA_OCORRENCIAS, tipoOcorrencia)) {
      return NextResponse.json({ ok: false, error: "Ocorrência clínica inválida." }, { status: 400 });
    }

    if (!valorPermitido(PODOGRAMA_SEVERIDADES, severidade)) {
      return NextResponse.json({ ok: false, error: "Gravidade inválida." }, { status: 400 });
    }

    if (!valorPermitido(PODOGRAMA_STATUS, status)) {
      return NextResponse.json({ ok: false, error: "Status inválido." }, { status: 400 });
    }

    if (coordenadaX === null || coordenadaY === null) {
      return NextResponse.json(
        { ok: false, error: "Posição inválida no Podograma." },
        { status: 400 },
      );
    }

    if (!regiaoAnatomica) {
      return NextResponse.json(
        { ok: false, error: "Informe a região anatômica." },
        { status: 400 },
      );
    }

    const paciente = await buscarPacienteEmpresa(usuario.empresa_id, pacienteId);

    if (!paciente) {
      return NextResponse.json(
        { ok: false, error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const atendimento = await validarAtendimento(
      usuario.empresa_id,
      paciente.id,
      atendimentoId,
    );

    if (atendimentoId && !atendimento) {
      return NextResponse.json(
        { ok: false, error: "O atendimento selecionado não pertence a este paciente." },
        { status: 400 },
      );
    }

    let anterior: Record<string, unknown> | null = null;

    if (id) {
      const { data, error } = await supabase
        .from("podograma_marcacoes")
        .select("*")
        .eq("empresa_id", usuario.empresa_id)
        .eq("paciente_id", paciente.id)
        .eq("id", id)
        .maybeSingle();

      if (error) throw new Error(`Erro ao localizar marcação: ${error.message}`);
      if (!data) {
        return NextResponse.json(
          { ok: false, error: "Marcação do Podograma não encontrada." },
          { status: 404 },
        );
      }
      anterior = data as Record<string, unknown>;
    }

    const resolvidoEm =
      status === "resolvida"
        ? texto(anterior?.resolvido_em) || new Date().toISOString()
        : null;

    const payload = {
      empresa_id: usuario.empresa_id,
      paciente_id: paciente.id,
      pessoa_id: paciente.pessoa_id,
      atendimento_id: atendimentoId,
      lado,
      vista,
      coordenada_x: coordenadaX,
      coordenada_y: coordenadaY,
      coordenada_z: null,
      regiao_anatomica: regiaoAnatomica,
      tipo_ocorrencia: tipoOcorrencia,
      severidade,
      status,
      procedimento: texto(body?.procedimento).slice(0, 2000) || null,
      observacoes: texto(body?.observacoes).slice(0, 5000) || null,
      modelo_versao: "podograma-2d-v1",
      resolvido_em: resolvidoEm,
      updated_by: usuario.id,
    };

    const operacao = id
      ? supabase
          .from("podograma_marcacoes")
          .update(payload)
          .eq("empresa_id", usuario.empresa_id)
          .eq("paciente_id", paciente.id)
          .eq("id", id)
      : supabase.from("podograma_marcacoes").insert({
          ...payload,
          created_by: usuario.id,
        });

    const { data, error } = await operacao
      .select(
        "id, empresa_id, paciente_id, pessoa_id, atendimento_id, lado, vista, coordenada_x, coordenada_y, coordenada_z, regiao_anatomica, tipo_ocorrencia, severidade, status, procedimento, observacoes, modelo_versao, resolvido_em, created_at, updated_at",
      )
      .single();

    if (error) throw new Error(`Erro ao salvar Podograma: ${error.message}`);

    const auditMeta = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "saude",
      entidade: "podograma",
      entidade_id: data.id,
      acao: id ? "marcacao_atualizada" : "marcacao_criada",
      descricao: `${id ? "Marcação atualizada" : "Nova marcação"} no Podograma`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: anterior,
      depois: data,
      metadata: {
        paciente_id: paciente.id,
        pessoa_id: paciente.pessoa_id,
        atendimento_id: atendimentoId,
        lado,
        vista,
        regiao_anatomica: regiaoAnatomica,
        tipo_ocorrencia: tipoOcorrencia,
        status,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: id ? "Marcação atualizada no Podograma." : "Ocorrência registrada no Podograma.",
      marcacao: { ...data, fotos: [] },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno ao salvar Podograma.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status },
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 },
    );
  }

  try {
    const acesso = await garantirAcessoPodograma(
      usuario.permissoes,
      "prontuarios.editar",
      usuario.empresa_id,
    );

    if (!acesso.ok) return acesso.response;

    const { searchParams } = new URL(request.url);
    const id = texto(searchParams.get("id"));
    const pacienteId = texto(searchParams.get("paciente_id"));

    if (!id || !pacienteId) {
      return NextResponse.json(
        { ok: false, error: "Marcação inválida." },
        { status: 400 },
      );
    }

    const paciente = await buscarPacienteEmpresa(usuario.empresa_id, pacienteId);
    if (!paciente) {
      return NextResponse.json({ ok: false, error: "Paciente não encontrado." }, { status: 404 });
    }

    const { data: marcacao, error: marcacaoError } = await supabase
      .from("podograma_marcacoes")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("paciente_id", paciente.id)
      .eq("id", id)
      .maybeSingle();

    if (marcacaoError) throw new Error(`Erro ao localizar marcação: ${marcacaoError.message}`);
    if (!marcacao) {
      return NextResponse.json(
        { ok: false, error: "Marcação não encontrada." },
        { status: 404 },
      );
    }

    const { data: fotos, error: fotosError } = await supabase
      .from("podograma_fotos")
      .select("storage_path")
      .eq("empresa_id", usuario.empresa_id)
      .eq("paciente_id", paciente.id)
      .eq("marcacao_id", id);

    if (fotosError) throw new Error(`Erro ao localizar fotos: ${fotosError.message}`);

    const paths = (fotos ?? []).map((foto) => foto.storage_path).filter(Boolean);
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from(PODOGRAMA_BUCKET_FOTOS)
        .remove(paths);
      if (storageError) throw new Error(`Erro ao remover fotos: ${storageError.message}`);
    }

    const { error: deleteError } = await supabase
      .from("podograma_marcacoes")
      .delete()
      .eq("empresa_id", usuario.empresa_id)
      .eq("paciente_id", paciente.id)
      .eq("id", id);

    if (deleteError) throw new Error(`Erro ao remover marcação: ${deleteError.message}`);

    const auditMeta = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "saude",
      entidade: "podograma",
      entidade_id: id,
      acao: "marcacao_excluida",
      descricao: "Marcação removida do Podograma",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: marcacao,
      metadata: { paciente_id: paciente.id, pessoa_id: paciente.pessoa_id },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({ ok: true, message: "Marcação removida do Podograma." });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno ao remover marcação.",
      },
      { status: 400 },
    );
  }
}
