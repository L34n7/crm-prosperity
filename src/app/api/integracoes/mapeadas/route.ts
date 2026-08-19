import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SISTEMAS_INTEGRACAO_MAPEADOS } from "@/lib/integracoes/sistemas-mapeados";

const supabase = getSupabaseAdmin();

export async function GET() {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: contexto.error },
      { status: contexto.status },
    );
  }

  const { usuario } = contexto;
  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 403 },
    );
  }

  const bloqueio = bloquearSemPermissao(
    usuario,
    "automacoes_api.visualizar",
    "Sem permissão para visualizar integrações de automação.",
  );
  if (bloqueio) return bloqueio;

  const { data: conexoes, error } = await supabase
    .from("integracoes_api_externas")
    .select("id,nome,tipo,base_url,codigo_empresa,status,ultimo_teste_em,ultimo_erro")
    .eq("empresa_id", usuario.empresa_id)
    .neq("status", "inativa")
    .order("nome");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    sistemas: SISTEMAS_INTEGRACAO_MAPEADOS.map((sistema) => ({
      ...sistema,
      conexoes: (conexoes || []).filter(
        (conexao) => String(conexao.tipo || "") === sistema.tipo_integracao,
      ),
    })),
  });
}
