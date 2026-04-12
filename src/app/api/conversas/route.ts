import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  isAdministrador,
  podeAtribuirConversas,
  podeVisualizarConversas,
} from "@/lib/auth/authorization";

const supabaseAdmin = getSupabaseAdmin();

type ConversaComRelacionamentos = {
  id: string;
  empresa_id: string;
  contato_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  integracao_whatsapp_id: string | null;
  status: string;
  canal: string | null;
  prioridade: string | null;
  assunto: string | null;
  last_message_at: string | null;
  created_at: string;
  contatos?: {
    id: string;
    nome: string | null;
    telefone: string | null;
    email: string | null;
  } | null;
  setores?: {
    id: string;
    nome: string;
  } | null;
  responsavel?: {
    id: string;
    nome: string;
    email: string;
  } | null;
  integracoes_whatsapp?: {
    id: string;
    nome_conexao: string;
    numero: string;
  } | null;
};

function isStatusValido(status: string | null) {
  if (!status) return false;

  return [
    "aberta",
    "bot",
    "fila",
    "em_atendimento",
    "aguardando_cliente",
    "encerrada",
  ].includes(status);
}

function isPrioridadeValida(prioridade: string | null) {
  if (!prioridade) return false;

  return ["baixa", "media", "alta", "urgente"].includes(prioridade);
}

export async function GET(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!(await podeVisualizarConversas(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para visualizar conversas" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const prioridade = searchParams.get("prioridade");
  const contatoId = searchParams.get("contato_id");
  const setorId = searchParams.get("setor_id");
  const responsavelId = searchParams.get("responsavel_id");

  let query = supabaseAdmin
    .from("conversas")
    .select(`
      *,
      contatos (
        id,
        nome,
        telefone,
        email
      ),
      setores (
        id,
        nome
      ),
      responsavel:usuarios (
        id,
        nome,
        email
      ),
      integracoes_whatsapp (
        id,
        nome_conexao,
        numero
      )
    `)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  query = query.eq("empresa_id", usuario.empresa_id);

  if (status) {
    if (!isStatusValido(status)) {
      return NextResponse.json(
        { ok: false, error: "Status inválido" },
        { status: 400 }
      );
    }

    query = query.eq("status", status);
  }

  if (prioridade) {
    if (!isPrioridadeValida(prioridade)) {
      return NextResponse.json(
        { ok: false, error: "Prioridade inválida" },
        { status: 400 }
      );
    }

    query = query.eq("prioridade", prioridade);
  }

  if (contatoId) {
    query = query.eq("contato_id", contatoId);
  }

  if (setorId) {
    query = query.eq("setor_id", setorId);
  }

  if (responsavelId) {
    query = query.eq("responsavel_id", responsavelId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  let conversas = (data ?? []) as ConversaComRelacionamentos[];

  if (isAdministrador(usuario)) {
    return NextResponse.json({
      ok: true,
      conversas,
    });
  }

  const setoresDoUsuario = usuario.setores_ids ?? [];
  const usuarioPodeAtribuir = await podeAtribuirConversas(usuario);

  if (usuarioPodeAtribuir) {
    if (setoresDoUsuario.length === 0) {
      return NextResponse.json({
        ok: true,
        conversas: [],
      });
    }

    conversas = conversas.filter((conversa) => {
      if (!conversa.setor_id) return false;
      return setoresDoUsuario.includes(conversa.setor_id);
    });

    return NextResponse.json({
      ok: true,
      conversas,
    });
  }

  conversas = conversas.filter((conversa) => {
    const conversaEhMinha = conversa.responsavel_id === usuario.id;

    const conversaEstaNaFilaDoMeuSetor =
      !!conversa.setor_id &&
      setoresDoUsuario.includes(conversa.setor_id) &&
      conversa.responsavel_id === null &&
      conversa.status === "fila";

    return conversaEhMinha || conversaEstaNaFilaDoMeuSetor;
  });

  return NextResponse.json({
    ok: true,
    conversas,
  });
}