
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrSetTtlCache, getTtlCacheKey } from "@/lib/cache/ttl-cache";
import { rowParaBranding } from "@/lib/white-label/branding";
import type {
  WhiteLabelAdminContexto,
  WhiteLabelResumo,
} from "@/lib/white-label/types";

const supabaseAdmin = getSupabaseAdmin();

type UsuarioIdentidade = {
  id: string;
  email: string | null;
};

type AdminRow = {
  id: string;
  white_label_id: string;
  usuario_id: string | null;
  email: string;
  nome: string | null;
  status: "ativo" | "inativo";
};

type WhiteLabelRow = {
  id: string;
  nome: string;
  slug: string;
  dominio: string;
  nome_produto: string;
  logo_url: string | null;
  favicon_url: string | null;
  cor_primaria: string | null;
  licencas_contratadas: number;
  valor_mensal_centavos: number;
  plano_padrao_id: string | null;
  empresa_gestora_id: string | null;
  status: "ativo" | "inativo";
};

export async function contarLicencasUsadas(whiteLabelId: string) {
  const { count, error } = await supabaseAdmin
    .from("empresas")
    .select("id", { count: "exact", head: true })
    .eq("white_label_id", whiteLabelId)
    .eq("white_label_tipo", "cliente")
    .neq("status", "cancelada");

  if (error) {
    throw new Error("Não foi possível calcular as licenças utilizadas.");
  }

  return count ?? 0;
}

async function carregarWhiteLabel(
  whiteLabelId: string
): Promise<WhiteLabelResumo | null> {
  const { data, error } = await supabaseAdmin
    .from("white_labels")
    .select(
      "id, nome, slug, dominio, nome_produto, logo_url, favicon_url, cor_primaria, licencas_contratadas, valor_mensal_centavos, plano_padrao_id, empresa_gestora_id, status"
    )
    .eq("id", whiteLabelId)
    .maybeSingle<WhiteLabelRow>();

  if (error || !data) return null;

  const licencasUsadas = await contarLicencasUsadas(data.id);
  const branding = rowParaBranding(data);

  return {
    ...branding,
    slug: data.slug,
    licencas_contratadas: data.licencas_contratadas,
    licencas_usadas: licencasUsadas,
    licencas_disponiveis: Math.max(
      data.licencas_contratadas - licencasUsadas,
      0
    ),
    valor_mensal_centavos: data.valor_mensal_centavos,
    plano_padrao_id: data.plano_padrao_id,
    empresa_gestora_id: data.empresa_gestora_id,
    status: data.status,
  };
}

async function buscarAdminPorUsuario(
  usuario: UsuarioIdentidade
): Promise<AdminRow | null> {
  const { data: porUsuario } = await supabaseAdmin
    .from("white_label_administradores")
    .select("id, white_label_id, usuario_id, email, nome, status")
    .eq("usuario_id", usuario.id)
    .eq("status", "ativo")
    .limit(1)
    .maybeSingle<AdminRow>();

  if (porUsuario) return porUsuario;

  const email = String(usuario.email || "").trim().toLowerCase();
  if (!email) return null;

  const { data: porEmail } = await supabaseAdmin
    .from("white_label_administradores")
    .select("id, white_label_id, usuario_id, email, nome, status")
    .ilike("email", email)
    .eq("status", "ativo")
    .limit(1)
    .maybeSingle<AdminRow>();

  if (!porEmail) return null;

  if (!porEmail.usuario_id) {
    const { error } = await supabaseAdmin
      .from("white_label_administradores")
      .update({
        usuario_id: usuario.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", porEmail.id)
      .is("usuario_id", null);

    if (!error) {
      porEmail.usuario_id = usuario.id;
    }
  }

  return porEmail;
}

export async function buscarWhiteLabelAdminPorUsuario(
  usuario: UsuarioIdentidade
): Promise<WhiteLabelAdminContexto | null> {
  return await getOrSetTtlCache(
    getTtlCacheKey("white-label-admin", [
      usuario.id,
      usuario.email || "",
    ]),
    30_000,
    async () => {
      const admin = await buscarAdminPorUsuario(usuario);
      if (!admin) return null;

      const whiteLabel = await carregarWhiteLabel(admin.white_label_id);
      if (!whiteLabel || whiteLabel.status !== "ativo") return null;

      return {
        id: admin.id,
        white_label_id: admin.white_label_id,
        usuario_id: admin.usuario_id,
        email: admin.email,
        nome: admin.nome,
        white_label: whiteLabel,
      };
    }
  );
}

export async function empresaPertenceAoWhiteLabel(
  empresaId: string,
  whiteLabelId: string,
  tipo: "cliente" | "gestora" | null = null
) {
  let query = supabaseAdmin
    .from("empresas")
    .select("id")
    .eq("id", empresaId)
    .eq("white_label_id", whiteLabelId);

  if (tipo) {
    query = query.eq("white_label_tipo", tipo);
  }

  const { data, error } = await query.maybeSingle<{ id: string }>();
  return !error && Boolean(data);
}

export async function buscarWhiteLabelDaEmpresa(empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("empresas")
    .select("white_label_id, white_label_tipo")
    .eq("id", empresaId)
    .maybeSingle<{
      white_label_id: string | null;
      white_label_tipo: "gestora" | "cliente" | null;
    }>();

  if (error || !data?.white_label_id) return null;

  const whiteLabel = await carregarWhiteLabel(data.white_label_id);
  if (!whiteLabel) return null;

  return {
    white_label: whiteLabel,
    tipo: data.white_label_tipo,
  };
}
