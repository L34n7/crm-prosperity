import { NextResponse } from "next/server";
import {
  aplicarClassificacaoLeadContato,
  classificacaoLeadPorEventoRastreamento,
} from "@/lib/leads/classificacao";
import { obterAcessoRastreamento } from "@/lib/rastreamento/api";
import {
  obterResultadoFluxoEventoManual,
  tipoEventoManualValido,
} from "@/lib/rastreamento/eventos-manuais";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function normalizarValorInformado(valor: unknown) {
  if (valor === "" || valor === null || valor === undefined) {
    return null;
  }

  if (typeof valor === "number") {
    return valor;
  }

  const texto = String(valor)
    .trim()
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  return Number(texto);
}

async function buscarEventoManual(id: string, empresaId: string) {
  return getSupabaseAdmin()
    .from("rastreamento_eventos")
    .select("id, empresa_id, tipo, contato_id, conversa_id, valor, origem_registro, metadata_json")
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .maybeSingle();
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await obterAcessoRastreamento("rastreamento.gerenciar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { id } = await context.params;
  const body = await request.json();
  const tipo = String(body?.tipo || "").trim();
  const contatoId =
    body?.contato_id === undefined
      ? undefined
      : String(body?.contato_id || "").trim() || null;
  const conversaProtocoloId =
    String(body?.conversa_protocolo_id || "").trim() || null;
  const observacao = String(body?.observacao || "").trim() || null;
  const valorInformado = normalizarValorInformado(body?.valor);
  const resultadoFluxo = obterResultadoFluxoEventoManual(tipo);

  if (!tipoEventoManualValido(tipo)) {
    return NextResponse.json(
      { ok: false, error: "Tipo de evento manual invalido." },
      { status: 400 }
    );
  }

  if (valorInformado !== null && (!Number.isFinite(valorInformado) || valorInformado < 0)) {
    return NextResponse.json(
      { ok: false, error: "Informe um valor valido." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: evento, error: eventoError } = await buscarEventoManual(
    id,
    acesso.usuario.empresa_id
  );

  if (eventoError) {
    return NextResponse.json(
      { ok: false, error: eventoError.message },
      { status: 500 }
    );
  }

  if (!evento) {
    return NextResponse.json(
      { ok: false, error: "Evento nao encontrado." },
      { status: 404 }
    );
  }

  if (evento.origem_registro !== "manual") {
    return NextResponse.json(
      { ok: false, error: "Eventos automaticos nao podem ser editados." },
      { status: 400 }
    );
  }

  let contatoAtualizadoId = contatoId === undefined ? evento.contato_id : contatoId;

  if (!contatoAtualizadoId && !evento.conversa_id) {
    return NextResponse.json(
      { ok: false, error: "Selecione um contato ou mantenha uma conversa vinculada." },
      { status: 400 }
    );
  }

  let atribuicao: {
    origem_id: string | null;
    campanha_id: string | null;
    link_id: string | null;
    clique_id: string | null;
  } = {
    origem_id: null,
    campanha_id: null,
    link_id: null,
    clique_id: null,
  };

  if (evento.conversa_id) {
    const { data: conversa } = await supabase
      .from("conversas")
      .select(`
        contato_id,
        rastreamento_origem_id,
        rastreamento_campanha_id,
        rastreamento_link_id,
        rastreamento_clique_id
      `)
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("id", evento.conversa_id)
      .maybeSingle();

    if (conversa) {
      contatoAtualizadoId = contatoAtualizadoId || conversa.contato_id || null;
      atribuicao = {
        origem_id: conversa.rastreamento_origem_id || null,
        campanha_id: conversa.rastreamento_campanha_id || null,
        link_id: conversa.rastreamento_link_id || null,
        clique_id: conversa.rastreamento_clique_id || null,
      };
    }
  }

  if (contatoAtualizadoId) {
    const { data: contato } = await supabase
      .from("contatos")
      .select(`
        id,
        rastreamento_origem_id,
        rastreamento_campanha_id,
        rastreamento_link_id,
        rastreamento_clique_id
      `)
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("id", contatoAtualizadoId)
      .maybeSingle();

    if (!contato) {
      return NextResponse.json(
        { ok: false, error: "Contato nao encontrado." },
        { status: 404 }
      );
    }

    if (!evento.conversa_id) {
      atribuicao = {
        origem_id: contato.rastreamento_origem_id || null,
        campanha_id: contato.rastreamento_campanha_id || null,
        link_id: contato.rastreamento_link_id || null,
        clique_id: contato.rastreamento_clique_id || null,
      };
    }
  }

  let protocolo: { id: string; protocolo: string | null } | null = null;

  if (conversaProtocoloId) {
    if (!evento.conversa_id) {
      return NextResponse.json(
        { ok: false, error: "Este evento nao esta vinculado a uma conversa." },
        { status: 400 }
      );
    }

    const { data } = await supabase
      .from("conversa_protocolos")
      .select("id, protocolo")
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("conversa_id", evento.conversa_id)
      .eq("id", conversaProtocoloId)
      .maybeSingle();

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Protocolo nao encontrado para esta conversa." },
        { status: 404 }
      );
    }

    protocolo = data;
  }

  const metadataAtual = evento.metadata_json || {};
  const metadataAtualizado = {
    ...metadataAtual,
    conversa_protocolo_id: protocolo?.id || null,
    protocolo: protocolo?.protocolo || null,
    observacao,
    resultado_fluxo: resultadoFluxo,
    atualizado_por: acesso.usuario.id,
    atualizado_em: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("rastreamento_eventos")
    .update({
      tipo,
      contato_id: contatoAtualizadoId,
      origem_id: atribuicao.origem_id,
      campanha_id: atribuicao.campanha_id,
      link_id: atribuicao.link_id,
      clique_id: atribuicao.clique_id,
      valor: valorInformado,
      metadata_json: metadataAtualizado,
    })
    .eq("id", id)
    .eq("empresa_id", acesso.usuario.empresa_id)
    .eq("origem_registro", "manual")
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const classificacao = classificacaoLeadPorEventoRastreamento(
    tipo,
    resultadoFluxo
  );

  if (classificacao) {
    await aplicarClassificacaoLeadContato({
      empresaId: acesso.usuario.empresa_id,
      contatoId: contatoAtualizadoId,
      classificacao,
      eventoId: data.id,
      protocoloId: protocolo?.id || null,
      origem: "rastreamento_manual_edicao",
    });
  }

  return NextResponse.json({
    ok: true,
    message: "Evento atualizado com sucesso.",
    evento: data,
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await obterAcessoRastreamento("rastreamento.gerenciar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { id } = await context.params;
  const { data: evento, error: eventoError } = await buscarEventoManual(
    id,
    acesso.usuario.empresa_id
  );

  if (eventoError) {
    return NextResponse.json(
      { ok: false, error: eventoError.message },
      { status: 500 }
    );
  }

  if (!evento) {
    return NextResponse.json(
      { ok: false, error: "Evento nao encontrado." },
      { status: 404 }
    );
  }

  if (evento.origem_registro !== "manual") {
    return NextResponse.json(
      { ok: false, error: "Eventos automaticos nao podem ser apagados." },
      { status: 400 }
    );
  }

  const { error } = await getSupabaseAdmin()
    .from("rastreamento_eventos")
    .delete()
    .eq("id", id)
    .eq("empresa_id", acesso.usuario.empresa_id)
    .eq("origem_registro", "manual");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: "Evento apagado com sucesso.",
  });
}
