import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getCamposPadraoNicho } from "@/lib/cadastros/form-schema";
import { validarDadosPersonalizados } from "@/lib/cadastros/validar-campos";
import { buscarCamposPersonalizados } from "@/lib/cadastros/campos-personalizados";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

export const dynamic = "force-dynamic";

const supabase = getSupabaseAdmin();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SalvarCadastroResult = {
  pessoa_id?: string;
  paciente_id?: string | null;
  contatos_ids?: string[] | null;
};

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function telefoneNormalizado(valor: unknown) {
  return normalizarTelefoneBrasilParaWhatsApp(texto(valor));
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

  if (!can(usuario.permissoes, "pessoas.criar")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para cadastrar pacientes." },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const nome = texto(body?.nome);

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Informe o nome do paciente." },
        { status: 400 },
      );
    }

    const nicho = await buscarNichoEmpresa(usuario.empresa_id);
    if (nicho.grupo !== "saude") {
      return NextResponse.json(
        { ok: false, error: "Cadastro de paciente disponível apenas em nichos de saúde." },
        { status: 403 },
      );
    }

    const camposPersonalizados = await buscarCamposPersonalizados(usuario.empresa_id);
    const camposPadrao = getCamposPadraoNicho(nicho.codigo);
    const camposPessoa = [
      ...camposPadrao.filter((campo) => campo.escopo === "pessoa"),
      ...camposPersonalizados
        .filter((campo) => campo.escopo === "pessoa")
        .map((campo) => ({
          chave: campo.chave,
          nome: campo.nome,
          tipo: campo.tipo,
          obrigatorio: campo.obrigatorio,
          opcoes: Array.isArray(campo.opcoes) ? campo.opcoes.map(String) : [],
        })),
    ];
    const camposPaciente = [
      ...camposPadrao.filter((campo) => campo.escopo === "paciente"),
      ...camposPersonalizados
        .filter((campo) => campo.escopo === "paciente")
        .map((campo) => ({
          chave: campo.chave,
          nome: campo.nome,
          tipo: campo.tipo,
          obrigatorio: campo.obrigatorio,
          opcoes: Array.isArray(campo.opcoes) ? campo.opcoes.map(String) : [],
        })),
    ];

    const dadosPersonalizados = validarDadosPersonalizados({
      valores: body?.dados_personalizados,
      campos: camposPessoa,
    });
    const pacienteDadosPersonalizados = validarDadosPersonalizados({
      valores: body?.paciente?.dados_personalizados,
      campos: camposPaciente,
    });

    const telefoneFormulario = telefoneNormalizado(body?.telefone);
    let contatoId = texto(body?.contato_id);
    if (contatoId && !UUID_REGEX.test(contatoId)) contatoId = "";

    let contatoSelecionado: {
      id: string;
      pessoa_id: string | null;
      telefone: string;
      nome: string | null;
      email: string | null;
    } | null = null;

    if (contatoId) {
      const { data, error } = await supabase
        .from("contatos")
        .select("id, pessoa_id, telefone, nome, email")
        .eq("empresa_id", usuario.empresa_id)
        .eq("id", contatoId)
        .maybeSingle();

      if (error) throw new Error(`Erro ao validar contato: ${error.message}`);
      if (!data) {
        return NextResponse.json(
          { ok: false, error: "Contato selecionado não foi encontrado." },
          { status: 404 },
        );
      }
      contatoSelecionado = data;
    } else if (telefoneFormulario) {
      const { data, error } = await supabase
        .from("contatos")
        .select("id, pessoa_id, telefone, nome, email")
        .eq("empresa_id", usuario.empresa_id)
        .eq("telefone", telefoneFormulario)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`Erro ao validar telefone: ${error.message}`);
      contatoSelecionado = data ?? null;
    }

    let pessoaIdExistente = texto(contatoSelecionado?.pessoa_id) || null;

    if (pessoaIdExistente) {
      const { data: pacienteExistente, error } = await supabase
        .from("pacientes")
        .select("id")
        .eq("empresa_id", usuario.empresa_id)
        .eq("pessoa_id", pessoaIdExistente)
        .maybeSingle();

      if (error) throw new Error(`Erro ao validar paciente existente: ${error.message}`);
      if (pacienteExistente) {
        return NextResponse.json(
          {
            ok: false,
            error: "Este contato já está vinculado a um paciente. Selecione outro contato.",
          },
          { status: 409 },
        );
      }
    }

    const telefones = new Set<string>();
    if (pessoaIdExistente) {
      const { data: contatosPessoa, error } = await supabase
        .from("contatos")
        .select("telefone")
        .eq("empresa_id", usuario.empresa_id)
        .eq("pessoa_id", pessoaIdExistente)
        .order("created_at", { ascending: true });

      if (error) throw new Error(`Erro ao preservar contatos vinculados: ${error.message}`);
      for (const contato of contatosPessoa ?? []) {
        const telefone = telefoneNormalizado(contato.telefone);
        if (telefone) telefones.add(telefone);
      }
    }

    const telefoneContato = telefoneNormalizado(contatoSelecionado?.telefone);
    if (telefoneContato) telefones.add(telefoneContato);
    if (telefoneFormulario) telefones.add(telefoneFormulario);

    if (telefones.size > 3) {
      return NextResponse.json(
        { ok: false, error: "A pessoa já possui o limite de três contatos vinculados." },
        { status: 400 },
      );
    }

    const dados = {
      tipo_pessoa: "fisica",
      nome,
      nome_social: texto(body?.nome_social),
      razao_social: "",
      cpf_cnpj: texto(body?.cpf_cnpj),
      data_nascimento: texto(body?.data_nascimento),
      email: texto(body?.email),
      cep: texto(body?.cep),
      logradouro: texto(body?.logradouro),
      numero: texto(body?.numero),
      complemento: texto(body?.complemento),
      bairro: texto(body?.bairro),
      cidade: texto(body?.cidade),
      estado: texto(body?.estado),
      observacoes: texto(body?.observacoes),
      dados_personalizados: dadosPersonalizados,
      status: "ativo",
    };

    const paciente = {
      numero_prontuario: texto(body?.paciente?.numero_prontuario),
      convenio: texto(body?.paciente?.convenio),
      numero_carteirinha: texto(body?.paciente?.numero_carteirinha),
      responsavel_nome: texto(body?.paciente?.responsavel_nome),
      dados_personalizados: pacienteDadosPersonalizados,
    };

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "salvar_cadastro_pessoa",
      {
        p_empresa_id: usuario.empresa_id,
        p_usuario_id: usuario.id,
        p_pessoa_id: pessoaIdExistente,
        p_dados: dados,
        p_paciente: paciente,
        p_contatos: Array.from(telefones).map((telefone) => ({ telefone })),
      },
    );

    if (rpcError) {
      const conflito =
        rpcError.message.includes("duplicate") ||
        rpcError.message.includes("vinculado") ||
        rpcError.message.includes("vinculada");
      return NextResponse.json(
        { ok: false, error: rpcError.message },
        { status: conflito ? 409 : 400 },
      );
    }

    const rpcResultado = rpcData as SalvarCadastroResult | null;
    const pessoaId = texto(rpcResultado?.pessoa_id);
    const pacienteId = texto(rpcResultado?.paciente_id);
    const contatosIds = Array.isArray(rpcResultado?.contatos_ids)
      ? rpcResultado?.contatos_ids ?? []
      : [];
    const vinculado = contatosIds.length > 0;

    if (!pessoaId || !pacienteId) {
      throw new Error("Cadastro concluído sem os identificadores clínicos esperados.");
    }

    const auditMeta = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "pessoas",
      entidade: "pessoa",
      entidade_id: pessoaId,
      acao: "paciente_criado",
      descricao: `Paciente ${nome} cadastrado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        paciente_id: pacienteId,
        contato_id_origem: contatoSelecionado?.id ?? null,
        contatos_vinculados: contatosIds.length,
        reutilizou_pessoa: Boolean(pessoaIdExistente),
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json(
      {
        ok: true,
        paciente_id: pacienteId,
        pessoa_id: pessoaId,
        contato_vinculado: vinculado,
        message: vinculado
          ? "Paciente cadastrado e vinculado ao contato com sucesso."
          : "Paciente cadastrado. O vínculo com um contato ainda precisa ser realizado.",
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao cadastrar paciente.",
      },
      { status: 400 },
    );
  }
}
