import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarWhiteLabelAdminPorUsuario } from "@/lib/white-label/acesso";
import {
  WHITE_LABEL_MAX_NUMEROS_ADICIONAIS_POR_CLIENTE,
  WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE,
  WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE,
  sincronizarCobrancaWhiteLabel,
} from "@/lib/white-label/billing";

const supabase = getSupabaseAdmin();

async function obterAdmin() {
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true });
  if (!contexto.ok) return contexto;

  const admin =
    contexto.usuario.white_label_admin ||
    (await buscarWhiteLabelAdminPorUsuario(contexto.usuario));

  if (!admin) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Acesso disponível apenas para administradores White Label.",
    };
  }

  return { ok: true as const, admin };
}

function deltaValido(valor: unknown) {
  const delta = Number(valor);
  return delta === 1 || delta === -1 ? delta : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const acesso = await obterAdmin();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status },
    );
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const acao = String(body?.acao || "").trim();
  const { admin } = acesso;

  const { data: empresa, error: empresaError } = await supabase
    .from("empresas")
    .select(
      "id,nome_fantasia,status,white_label_id,white_label_tipo,limite_integracoes_whatsapp,limite_total_numeros_whatsapp,limite_usuarios",
    )
    .eq("id", id)
    .eq("white_label_id", admin.white_label_id)
    .eq("white_label_tipo", "cliente")
    .maybeSingle();

  if (empresaError) {
    return NextResponse.json(
      { ok: false, error: empresaError.message },
      { status: 500 },
    );
  }

  if (!empresa) {
    return NextResponse.json(
      { ok: false, error: "Cliente White Label não encontrado." },
      { status: 404 },
    );
  }

  if (acao === "status") {
    const ativo = body?.ativo === true;

    const { error } = await supabase
      .from("empresas")
      .update({
        status: ativo ? "ativa" : "inativa",
        updated_at: new Date().toISOString(),
      })
      .eq("id", empresa.id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: ativo ? "Cliente ativado." : "Cliente desativado.",
      status: ativo ? "ativa" : "inativa",
    });
  }

  if (acao === "salvar_adicionais") {
    const numerosAdicionais = Number(body?.numeros_adicionais);
    const usuariosAdicionais = Number(body?.usuarios_adicionais);

    if (
      !Number.isInteger(numerosAdicionais) ||
      numerosAdicionais < 0 ||
      numerosAdicionais > WHITE_LABEL_MAX_NUMEROS_ADICIONAIS_POR_CLIENTE ||
      !Number.isInteger(usuariosAdicionais) ||
      usuariosAdicionais < 0 ||
      usuariosAdicionais > 10000
    ) {
      return NextResponse.json(
        { ok: false, error: "Quantidade de adicionais inválida." },
        { status: 400 },
      );
    }

    const limiteWhatsappAtual = Math.max(
      WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE,
      Number(
        empresa.limite_integracoes_whatsapp ??
          WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE,
      ),
    );
    const limiteUsuariosAtual = Math.max(
      WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE,
      Number(
        empresa.limite_usuarios ??
          WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE,
      ),
    );
    const novoLimiteWhatsapp =
      WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE + numerosAdicionais;
    const novoLimiteUsuarios =
      WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE + usuariosAdicionais;

    if (novoLimiteWhatsapp < limiteWhatsappAtual) {
      const { count, error: countError } = await supabase
        .from("integracoes_whatsapp")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresa.id)
        .eq("provider", "meta_official")
        .neq("status", "desconectada");

      if (countError) {
        return NextResponse.json(
          { ok: false, error: countError.message },
          { status: 500 },
        );
      }

      if ((count ?? 0) > novoLimiteWhatsapp) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Desconecte primeiro um dos números WhatsApp deste cliente antes de salvar a redução.",
          },
          { status: 409 },
        );
      }
    }

    if (novoLimiteUsuarios < limiteUsuariosAtual) {
      const { count, error: countError } = await supabase
        .from("usuarios")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresa.id)
        .eq("status", "ativo");

      if (countError) {
        return NextResponse.json(
          { ok: false, error: countError.message },
          { status: 500 },
        );
      }

      if ((count ?? 0) > novoLimiteUsuarios) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Inative usuários deste cliente até ficar dentro do novo limite antes de salvar a redução.",
          },
          { status: 409 },
        );
      }
    }

    const { error } = await supabase
      .from("empresas")
      .update({
        limite_integracoes_whatsapp: novoLimiteWhatsapp,
        limite_total_numeros_whatsapp:
          WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE +
          WHITE_LABEL_MAX_NUMEROS_ADICIONAIS_POR_CLIENTE,
        limite_usuarios: novoLimiteUsuarios,
        updated_at: new Date().toISOString(),
      })
      .eq("id", empresa.id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    const cobranca = await sincronizarCobrancaWhiteLabel(admin.white_label_id);

    return NextResponse.json({
      ok: true,
      message: "Quantidades de números e usuários salvas com sucesso.",
      numeros_adicionais: numerosAdicionais,
      usuarios_adicionais: usuariosAdicionais,
      limite_integracoes_whatsapp: novoLimiteWhatsapp,
      limite_usuarios: novoLimiteUsuarios,
      cobranca,
      warning: cobranca.warning,
    });
  }

  if (acao === "numero_adicional") {
    const delta = deltaValido(body?.delta);
    if (!delta) {
      return NextResponse.json(
        { ok: false, error: "Alteração de número adicional inválida." },
        { status: 400 },
      );
    }

    const limiteAtual = Math.max(
      WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE,
      Number(
        empresa.limite_integracoes_whatsapp ??
          WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE,
      ),
    );
    const adicionaisAtuais = Math.max(
      0,
      limiteAtual - WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE,
    );
    const adicionaisNovos = adicionaisAtuais + delta;

    if (
      adicionaisNovos < 0 ||
      adicionaisNovos > WHITE_LABEL_MAX_NUMEROS_ADICIONAIS_POR_CLIENTE
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            adicionaisNovos > WHITE_LABEL_MAX_NUMEROS_ADICIONAIS_POR_CLIENTE
              ? "Este cliente já atingiu o máximo de 5 números adicionais."
              : "Este cliente não possui número adicional para remover.",
        },
        { status: 409 },
      );
    }

    const novoLimite =
      WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE + adicionaisNovos;

    if (delta < 0) {
      const { count, error: countError } = await supabase
        .from("integracoes_whatsapp")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresa.id)
        .eq("provider", "meta_official")
        .neq("status", "desconectada");

      if (countError) {
        return NextResponse.json(
          { ok: false, error: countError.message },
          { status: 500 },
        );
      }

      if ((count ?? 0) > novoLimite) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Desconecte primeiro um dos números WhatsApp deste cliente antes de remover a licença adicional.",
          },
          { status: 409 },
        );
      }
    }

    const { error } = await supabase
      .from("empresas")
      .update({
        limite_integracoes_whatsapp: novoLimite,
        limite_total_numeros_whatsapp:
          WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE +
          WHITE_LABEL_MAX_NUMEROS_ADICIONAIS_POR_CLIENTE,
        updated_at: new Date().toISOString(),
      })
      .eq("id", empresa.id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    const cobranca = await sincronizarCobrancaWhiteLabel(admin.white_label_id);

    return NextResponse.json({
      ok: true,
      message:
        delta > 0
          ? "Número adicional liberado para o cliente."
          : "Número adicional removido da próxima mensalidade.",
      numeros_adicionais: adicionaisNovos,
      limite_integracoes_whatsapp: novoLimite,
      cobranca,
      warning: cobranca.warning,
    });
  }

  if (acao === "usuario_adicional") {
    const delta = deltaValido(body?.delta);
    if (!delta) {
      return NextResponse.json(
        { ok: false, error: "Alteração de usuário adicional inválida." },
        { status: 400 },
      );
    }

    const limiteAtual = Math.max(
      WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE,
      Number(
        empresa.limite_usuarios ??
          WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE,
      ),
    );
    const adicionaisAtuais = Math.max(
      0,
      limiteAtual - WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE,
    );
    const adicionaisNovos = adicionaisAtuais + delta;

    if (adicionaisNovos < 0) {
      return NextResponse.json(
        { ok: false, error: "Este cliente não possui usuário adicional para remover." },
        { status: 409 },
      );
    }

    const novoLimite =
      WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE + adicionaisNovos;

    if (delta < 0) {
      const { count, error: countError } = await supabase
        .from("usuarios")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresa.id)
        .eq("status", "ativo");

      if (countError) {
        return NextResponse.json(
          { ok: false, error: countError.message },
          { status: 500 },
        );
      }

      if ((count ?? 0) > novoLimite) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Inative um usuário deste cliente antes de remover esta licença adicional.",
          },
          { status: 409 },
        );
      }
    }

    const { error } = await supabase
      .from("empresas")
      .update({
        limite_usuarios: novoLimite,
        updated_at: new Date().toISOString(),
      })
      .eq("id", empresa.id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    const cobranca = await sincronizarCobrancaWhiteLabel(admin.white_label_id);

    return NextResponse.json({
      ok: true,
      message:
        delta > 0
          ? "Usuário adicional liberado para o cliente."
          : "Usuário adicional removido da próxima mensalidade.",
      usuarios_adicionais: adicionaisNovos,
      limite_usuarios: novoLimite,
      cobranca,
      warning: cobranca.warning,
    });
  }

  return NextResponse.json(
    { ok: false, error: "Ação não suportada." },
    { status: 400 },
  );
}


export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const acesso = await obterAdmin();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status },
    );
  }

  const { id } = await context.params;
  const { admin } = acesso;

  const { data: empresa, error: empresaError } = await supabase
    .from("empresas")
    .select("id,nome_fantasia,status,white_label_id,white_label_tipo")
    .eq("id", id)
    .eq("white_label_id", admin.white_label_id)
    .eq("white_label_tipo", "cliente")
    .maybeSingle();

  if (empresaError) {
    return NextResponse.json(
      { ok: false, error: empresaError.message },
      { status: 500 },
    );
  }

  if (!empresa) {
    return NextResponse.json(
      { ok: false, error: "Cliente White Label não encontrado." },
      { status: 404 },
    );
  }

  if (empresa.status === "cancelada") {
    return NextResponse.json({
      ok: true,
      message: "Cliente já estava excluído.",
    });
  }

  const agora = new Date().toISOString();

  const { error: empresaUpdateError } = await supabase
    .from("empresas")
    .update({
      status: "cancelada",
      updated_at: agora,
    })
    .eq("id", empresa.id)
    .eq("white_label_id", admin.white_label_id)
    .eq("white_label_tipo", "cliente");

  if (empresaUpdateError) {
    return NextResponse.json(
      { ok: false, error: empresaUpdateError.message },
      { status: 500 },
    );
  }

  const [{ error: usuariosError }, { error: sessoesError }] = await Promise.all([
    supabase
      .from("usuarios")
      .update({
        status: "inativo",
        updated_at: agora,
      })
      .eq("empresa_id", empresa.id),
    supabase
      .from("usuario_sessoes")
      .delete()
      .eq("empresa_id", empresa.id),
  ]);

  if (usuariosError || sessoesError) {
    console.error("[WHITE LABEL] Cliente cancelado com aviso ao revogar acessos:", {
      empresaId: empresa.id,
      usuariosError: usuariosError?.message || null,
      sessoesError: sessoesError?.message || null,
    });
  }

  let cobranca: Awaited<ReturnType<typeof sincronizarCobrancaWhiteLabel>> | null = null;
  let warning: string | null = null;

  try {
    cobranca = await sincronizarCobrancaWhiteLabel(admin.white_label_id);
    warning = cobranca.warning;
  } catch (error) {
    warning =
      error instanceof Error
        ? "Cliente excluído e licença liberada, mas a cobrança precisa ser reconciliada: " +
          error.message
        : "Cliente excluído e licença liberada, mas a cobrança precisa ser reconciliada.";
  }

  return NextResponse.json({
    ok: true,
    message:
      "Cliente excluído. A licença foi liberada para cadastrar outro cliente.",
    warning,
    cobranca,
  });
}
