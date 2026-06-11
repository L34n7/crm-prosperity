import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

type ProtocoloPorContato = {
  protocolo_atual: string;
  ultimo_protocolo: string;
};

export async function POST(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const contatoIds: string[] = Array.isArray(body?.contato_ids)
    ? body.contato_ids
        .map((item: unknown) => String(item || "").trim())
        .filter((item: string) => Boolean(item))
    : [];

    if (contatoIds.length === 0) {
      return NextResponse.json({
        ok: true,
        protocolos: {},
      });
    }

    const { data: conversas, error: conversasError } = await supabaseAdmin
      .from("conversas")
      .select("id, contato_id, updated_at, last_message_at, started_at")
      .eq("empresa_id", usuario.empresa_id)
      .in("contato_id", contatoIds);

    if (conversasError) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar conversas: ${conversasError.message}` },
        { status: 500 }
      );
    }

    const conversasLista = Array.isArray(conversas) ? conversas : [];
    const conversaIds = conversasLista.map((item) => item.id).filter(Boolean);

    if (conversaIds.length === 0) {
      return NextResponse.json({
        ok: true,
        protocolos: {},
      });
    }

    const conversaParaContato = new Map<string, string>();

    conversasLista.forEach((conversa) => {
      if (conversa?.id && conversa?.contato_id) {
        conversaParaContato.set(conversa.id, conversa.contato_id);
      }
    });

    const { data: protocolos, error: protocolosError } = await supabaseAdmin
      .from("conversa_protocolos")
      .select("id, conversa_id, protocolo, ativo, started_at, closed_at, created_at")
      .eq("empresa_id", usuario.empresa_id)
      .in("conversa_id", conversaIds)
      .order("created_at", { ascending: false });

    if (protocolosError) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar protocolos: ${protocolosError.message}` },
        { status: 500 }
      );
    }

    const resultado: Record<string, ProtocoloPorContato> = {};

    contatoIds.forEach((contatoId: string) => {
    resultado[contatoId] = {
        protocolo_atual: "",
        ultimo_protocolo: "",
    };
    });

    const protocolosLista = Array.isArray(protocolos) ? protocolos : [];

    for (const protocolo of protocolosLista) {
      const contatoId = conversaParaContato.get(protocolo.conversa_id);

      if (!contatoId) continue;

      if (!resultado[contatoId]) {
        resultado[contatoId] = {
          protocolo_atual: "",
          ultimo_protocolo: "",
        };
      }

      if (protocolo.ativo === true && !resultado[contatoId].protocolo_atual) {
        resultado[contatoId].protocolo_atual = protocolo.protocolo || "";
      }

      if (protocolo.ativo === false && !resultado[contatoId].ultimo_protocolo) {
        resultado[contatoId].ultimo_protocolo = protocolo.protocolo || "";
      }
    }

    return NextResponse.json({
      ok: true,
      protocolos: resultado,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}