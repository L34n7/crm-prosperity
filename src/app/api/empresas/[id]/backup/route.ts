import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import { BACKUP_BUCKET, gerarBackupEncerramento, type ParteBackup } from "@/lib/empresas/backup";

export const runtime = "nodejs";
export const maxDuration = 300;

async function autorizar(empresaId:string) {
  const acesso=await getUsuarioContexto({ignorarAcessoTemporario:true,sincronizarAssinatura:false});
  if(!acesso.ok)throw new Error("Acesso não autorizado.");
  const [interno,editar]=await Promise.all([
    can(acesso.usuario.id,PERMISSAO_INTERNA_EMPRESAS),
    can(acesso.usuario.id,"empresas.editar"),
  ]);
  if(!interno || !editar)throw new Error("Sem permissão para exportar dados encerrados.");
  const {data:empresa,error}=await getSupabaseAdmin().from("empresas")
    .select("id,nome_fantasia,status,exclusao_prevista_em,encerramento_backup_estado,encerramento_backup_path,encerramento_backup_partes")
    .eq("id",empresaId).maybeSingle();
  if(error || !empresa)throw new Error("Empresa não encontrada.");
  if(empresa.status!=="cancelada" || !empresa.exclusao_prevista_em ||
    new Date(empresa.exclusao_prevista_em).getTime()<=Date.now())
    throw new Error("O prazo de 90 dias para solicitar backup terminou.");
  return empresa;
}

export async function POST(_request:Request,context:{params:Promise<{id:string}>}) {
  try{
    const {id}=await context.params;
    await autorizar(id);
    const resultado=await gerarBackupEncerramento(id);
    return NextResponse.json(resultado,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Falha ao gerar backup."},{status:409});
  }
}
export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  try{
    const {id}=await context.params;
    const empresa=await autorizar(id);
    if(empresa.encerramento_backup_estado!=="pronto")
      return NextResponse.json({ok:false,error:"O backup ainda não foi concluído."},{status:409});
    const parts=(Array.isArray(empresa.encerramento_backup_partes)
      ? empresa.encerramento_backup_partes.filter((p):p is ParteBackup =>
          p && typeof p.path==="string" && typeof p.nome==="string")
      : []);
    const arquivos=parts.length?parts:
      empresa.encerramento_backup_path
        ? [{nome:"backup-"+id+".zip",path:empresa.encerramento_backup_path,bytes:0,sha256:""}]
        : [];
    if(!arquivos.length)throw new Error("Nenhuma parte de backup foi encontrada.");
    const slugEmpresa=empresa.nome_fantasia.normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-")
      .replace(/^-+|-+$/g,"").slice(0,64).toLowerCase() || "empresa";
    const urls=await Promise.all(arquivos.map(async (item,index)=>{
      // Inclui o nome até em ZIPs preparados antes desta atualização (ex.: tea).
      const nome=item.nome.includes(slugEmpresa)
        ? item.nome
        : "backup-"+slugEmpresa+"-"+id.slice(0,8)+"-parte-"+
          String(index+1).padStart(3,"0")+".zip";
      const {data,error}=await getSupabaseAdmin().storage.from(BACKUP_BUCKET)
        .createSignedUrl(item.path,300,{download:nome});
      if(error || !data?.signedUrl)throw new Error("Parte indisponível: "+nome);
      return {nome,bytes:item.bytes,sha256:item.sha256,url:data.signedUrl};
    }));
    return NextResponse.json({ok:true,partes:urls},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Não foi possível baixar o backup."},{status:403});
  }
}
