import { getSupabaseAdmin } from "@/lib/supabase/admin";

type UsuarioSessao = {
  id: string;
  auth_user_id: string | null;
  empresa_id: string | null;
};

type RegistrarEventoSessaoParams = {
  usuario: UsuarioSessao;
  evento: "login" | "heartbeat" | "logout";
  clientSessionId: string;
  ip?: string | null;
  userAgent?: string | null;
};

const supabaseAdmin = getSupabaseAdmin();
const HEARTBEAT_WRITE_THROTTLE_MS = 4 * 60 * 1000;

function normalizarClientSessionId(valor: string | null | undefined) {
  return String(valor || "").trim().slice(0, 120);
}

export async function registrarEventoSessaoUsuario({
  usuario,
  evento,
  clientSessionId,
  ip = null,
  userAgent = null,
}: RegistrarEventoSessaoParams) {
  const clientSessionIdNormalizado = normalizarClientSessionId(clientSessionId);

  if (!usuario.id || !clientSessionIdNormalizado) {
    return;
  }

  const agora = new Date().toISOString();

  try {
    if (evento === "logout") {
      await supabaseAdmin
        .from("usuario_sessoes")
        .update({
          logout_at: agora,
          last_seen_at: agora,
          status: "offline",
          updated_at: agora,
        })
        .eq("usuario_id", usuario.id)
        .eq("client_session_id", clientSessionIdNormalizado)
        .is("logout_at", null);

      await supabaseAdmin
        .from("usuarios")
        .update({
          ultimo_logout: agora,
          updated_at: agora,
        })
        .eq("id", usuario.id);

      return;
    }

    const { data: sessaoAberta, error: sessaoError } = await supabaseAdmin
      .from("usuario_sessoes")
      .select("id, last_seen_at, status")
      .eq("usuario_id", usuario.id)
      .eq("client_session_id", clientSessionIdNormalizado)
      .is("logout_at", null)
      .order("login_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessaoError) {
      throw sessaoError;
    }

    if (sessaoAberta?.id) {
      if (
        evento === "heartbeat" &&
        sessaoAberta.status === "online" &&
        sessaoAberta.last_seen_at
      ) {
        const lastSeenTime = new Date(sessaoAberta.last_seen_at).getTime();

        if (
          Number.isFinite(lastSeenTime) &&
          Date.now() - lastSeenTime < HEARTBEAT_WRITE_THROTTLE_MS
        ) {
          return;
        }
      }

      await supabaseAdmin
        .from("usuario_sessoes")
        .update({
          last_seen_at: agora,
          status: "online",
          ip,
          user_agent: userAgent,
          updated_at: agora,
        })
        .eq("id", sessaoAberta.id);
    } else {
      await supabaseAdmin.from("usuario_sessoes").insert({
        empresa_id: usuario.empresa_id,
        usuario_id: usuario.id,
        auth_user_id: usuario.auth_user_id,
        client_session_id: clientSessionIdNormalizado,
        login_at: agora,
        last_seen_at: agora,
        status: "online",
        ip,
        user_agent: userAgent,
        metadata_json: {
          origem: evento,
        },
        created_at: agora,
        updated_at: agora,
      });
    }

    await supabaseAdmin
      .from("usuarios")
      .update({
        ultimo_acesso: agora,
        updated_at: agora,
      })
      .eq("id", usuario.id);
  } catch (error) {
    console.error("[SESSAO_USUARIO] Erro ao registrar evento:", error);
  }
}
