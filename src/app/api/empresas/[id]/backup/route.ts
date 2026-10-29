import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import { BACKUP_BUCKET, gerarBackupEncerramento } from "@/lib/empresas/backup";

export const runtime = "nodejs";
export const maxDuration = 300;

async function autorizar(empresaId: string) {
  const acesso = await getUsuarioContexto({
    ignorarAcessoTemporario: true, sincronizarAssinatura: false,
  });
  if (!acesso.ok) throw new Error("Acesso não autorizado.");
  const [interno, editar] = await Promise.all([
    can(acesso.usuario.id, PERMISSAO_INTERNA_EMPRESAS),
    can(acesso.usuario.id, "empresas.editar"),
  ]);
  if (!interno || !editar) throw new Error("Sem permissão para exportar dados encerrados.");
  const supabase = getSupabaseAdmin();
  const {data: empresa,error} = await supabase.from("empresas")
    .select("id,nome_fantasia,status,encerramento_backup_path,encerramento_backup_estado")
    .eq("id",empresaId).maybeSingle();
  if (error || !empresa) throw new Error("Empresa não encontrada.");
  if (empresa.status !== "cancelada") throw new Error("Empresa não está cancelada.");
  return empresa;
}

export async function POST(_request: Request, context: {params: Promise<{id:string}>}) {
  try {
    const {id} = await context.params;
    await autorizar(id);
    const result = await gerarBackupEncerramento(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Falha ao gerar backup."}, {status:400});
  }
}

export async function GET(_request: Request, context: {params: Promise<{id:string}>}) {
  try {
    const {id} = await context.params;
    const empresa = await autorizar(id);
    if (empresa.encerramento_backup_estado !== "pronto" || !empresa.encerramento_backup_path)
      return NextResponse.json({ok:false,error:"Backup não está pronto."},{status:409});
    const supabase = getSupabaseAdmin();
    const {data,error} = await supabase.storage.from(BACKUP_BUCKET)
      .createSignedUrl(empresa.encerramento_backup_path,120, {
        download: "backup-" + id + ".zip",
      });
    if (error || !data?.signedUrl) throw new Error(error?.message || "Arquivo indisponível.");
    return NextResponse.json({ok:true,url:data.signedUrl}, {
      headers: {"Cache-Control":"private, no-store"},
    });
  } catch (error) {
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Falha ao obter backup."},{status:403});
  }
}
