import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import {
  isAdministrador,
  podeAtribuirConversas,
  podeVisualizarConversas,
} from "@/lib/auth/authorization";

const supabaseAdmin = getSupabaseAdmin();

type ConversaLeituraRow = {
  conversa_id: string;
  ultima_mensagem_lida_at: string | null;
};

type MensagemNaoLidaRow = {
  conversa_id: string;
  created_at: string;
};

type ConversaPermissaoRow = {
  id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  status: string | null;
};

async function buscarConversaIdsNaoLidas({
  empresaId,
  usuarioId,
}: {
  empresaId: string;
  usuarioId: string;
}) {
  const { data: leituras, error: leiturasError } = await supabaseAdmin
    .from("conversa_leituras")
    .select("conversa_id, ultima_mensagem_lida_at")
    .eq("empresa_id", empresaId)
    .eq("usuario_id", usuarioId);

  if (leiturasError) {
    throw new Error(leiturasError.message);
  }

  const leituraPorConversa = new Map<string, string | null>();

  for (const leitura of (leituras ?? []) as ConversaLeituraRow[]) {
    leituraPorConversa.set(
      leitura.conversa_id,
      leitura.ultima_mensagem_lida_at ?? null
    );
  }

  const { data: mensagens, error: mensagensError } = await supabaseAdmin
    .from("mensagens")
    .select("conversa_id, created_at")
    .eq("empresa_id", empresaId)
    .or("origem.eq.recebida,remetente_tipo.eq.contato")
    .order("created_at", { ascending: false })
    .limit(10000);

  if (mensagensError) {
    throw new Error(mensagensError.message);
  }

  const conversaIdsNaoLidas = new Set<string>();

  for (const mensagem of (mensagens ?? []) as MensagemNaoLidaRow[]) {
    if (!mensagem.conversa_id || conversaIdsNaoLidas.has(mensagem.conversa_id)) {
      continue;
    }

    const ultimaLeitura = leituraPorConversa.get(mensagem.conversa_id) ?? null;

    if (!ultimaLeitura) {
      conversaIdsNaoLidas.add(mensagem.conversa_id);
      continue;
    }

    const mensagemTime = new Date(mensagem.created_at).getTime();
    const leituraTime = new Date(ultimaLeitura).getTime();

    if (Number.isNaN(mensagemTime) || Number.isNaN(leituraTime)) {
      continue;
    }

    if (mensagemTime >= leituraTime + 1) {
      conversaIdsNaoLidas.add(mensagem.conversa_id);
    }
  }

  return Array.from(conversaIdsNaoLidas);
}

function filtrarConversasPorPermissao({
  conversas,
  usuario,
  usuarioPodeAtribuir,
}: {
  conversas: ConversaPermissaoRow[];
  usuario: UsuarioContexto;
  usuarioPodeAtribuir: boolean;
}) {
  if (isAdministrador(usuario)) {
    return conversas;
  }

  const setoresDoUsuario = usuario.setores_ids ?? [];

  if (usuarioPodeAtribuir) {
    if (setoresDoUsuario.length === 0) return [];

    return conversas.filter((conversa) => {
      if (!conversa.setor_id) return false;
      return setoresDoUsuario.includes(conversa.setor_id);
    });
  }

  return conversas.filter((conversa) => {
    const conversaEhMinha = conversa.responsavel_id === usuario.id;

    const conversaEstaNaFilaDoMeuSetor =
      !!conversa.setor_id &&
      setoresDoUsuario.includes(conversa.setor_id) &&
      conversa.responsavel_id === null &&
      conversa.status === "fila";

    return conversaEhMinha || conversaEstaNaFilaDoMeuSetor;
  });
}

export async function GET() {
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
      { ok: false, error: "Sem permissao para visualizar conversas" },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuario sem empresa vinculada" },
      { status: 400 }
    );
  }

  try {
    const idsNaoLidas = await buscarConversaIdsNaoLidas({
      empresaId: usuario.empresa_id,
      usuarioId: usuario.id,
    });

    if (idsNaoLidas.length === 0) {
      return NextResponse.json({ ok: true, quantidade: 0 });
    }

    const { data: conversas, error: conversasError } = await supabaseAdmin
      .from("conversas")
      .select("id, setor_id, responsavel_id, status")
      .eq("empresa_id", usuario.empresa_id)
      .in("id", idsNaoLidas);

    if (conversasError) {
      throw new Error(conversasError.message);
    }

    const usuarioPodeAtribuir = await podeAtribuirConversas(usuario);
    const conversasPermitidas = filtrarConversasPorPermissao({
      conversas: (conversas ?? []) as ConversaPermissaoRow[],
      usuario,
      usuarioPodeAtribuir,
    });

    return NextResponse.json({
      ok: true,
      quantidade: conversasPermitidas.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar conversas nao lidas",
      },
      { status: 500 }
    );
  }
}
