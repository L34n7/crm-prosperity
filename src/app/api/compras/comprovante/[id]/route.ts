import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

function moeda(valor: unknown) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor ?? 0));
}

function data(valor: string | null | undefined) {
  if (!valor) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor));
}

function linhas(texto: string, limite = 82) {
  const palavras = texto.trim().split(/\s+/);
  const resultado: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    if (`${atual} ${palavra}`.trim().length > limite && atual) {
      resultado.push(atual);
      atual = palavra;
    } else atual = `${atual} ${palavra}`.trim();
  }
  if (atual) resultado.push(atual);
  return resultado;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return NextResponse.json({ ok: false, error: contexto.error }, { status: contexto.status });
  if (!contexto.usuario.empresa_id) return NextResponse.json({ ok: false, error: "Usuário sem empresa." }, { status: 400 });
  if (!can(contexto.usuario.permissoes, "compras.visualizar") && !can(contexto.usuario.permissoes, "financeiro.operacional")) {
    return NextResponse.json({ ok: false, error: "Sem permissão para emitir comprovantes." }, { status: 403 });
  }
  const { id } = await params;
  const empresaId = contexto.usuario.empresa_id;
  const { data: baixa, error } = await supabase.from("financeiro_contas_pagar_baixas").select("*").eq("empresa_id", empresaId).eq("id", id).maybeSingle();
  if (error || !baixa) return NextResponse.json({ ok: false, error: error?.message || "Pagamento não encontrado." }, { status: 404 });
  const { data: conta, error: contaError } = await supabase.from("financeiro_contas_pagar").select("id,documento_id").eq("empresa_id", empresaId).eq("id", baixa.conta_id).maybeSingle();
  if (contaError || !conta?.documento_id) return NextResponse.json({ ok: false, error: contaError?.message || "Conta a pagar relacionada não encontrada." }, { status: 404 });

  const [{ data: pedido }, { data: empresa }] = await Promise.all([
    supabase.from("comercial_documentos").select("id,numero,parceiro_id,total,data_emissao").eq("empresa_id", empresaId).eq("id", conta.documento_id).eq("tipo", "pedido_compra").maybeSingle(),
    supabase.from("empresas").select("nome_fantasia,razao_social,documento,email,telefone,endereco,cidade,estado").eq("id", empresaId).maybeSingle(),
  ]);
  if (!pedido) return NextResponse.json({ ok: false, error: "Pedido relacionado não encontrado." }, { status: 404 });
  const { data: fornecedor } = await supabase.from("comercial_parceiros").select("nome,nome_fantasia,documento,email").eq("empresa_id", empresaId).eq("id", pedido.parceiro_id).maybeSingle();

  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([595.28, 841.89]);
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const azul = rgb(0.08, 0.27, 0.55);
  let y = 782;
  const escrever = (valor: string, opcoes?: { tamanho?: number; bold?: boolean; cor?: ReturnType<typeof rgb> }) => {
    pagina.drawText(valor, { x: 52, y, size: opcoes?.tamanho ?? 10, font: opcoes?.bold ? negrito : fonte, color: opcoes?.cor ?? rgb(0.12, 0.16, 0.23) });
    y -= (opcoes?.tamanho ?? 10) + 8;
  };

  escrever(empresa?.nome_fantasia || empresa?.razao_social || "Empresa", { tamanho: 18, bold: true, cor: azul });
  escrever([empresa?.documento, empresa?.email, empresa?.telefone].filter(Boolean).join(" · ") || "Dados cadastrais não informados", { tamanho: 9 });
  escrever([empresa?.endereco, empresa?.cidade, empresa?.estado].filter(Boolean).join(" · "), { tamanho: 9 });
  y -= 18;
  pagina.drawLine({ start: { x: 52, y }, end: { x: 543, y }, thickness: 1, color: rgb(0.84, 0.87, 0.91) });
  y -= 30;
  escrever("COMPROVANTE DE PAGAMENTO", { tamanho: 16, bold: true, cor: azul });
  escrever("DOCUMENTO NÃO FISCAL", { tamanho: 9, bold: true, cor: rgb(0.72, 0.22, 0.16) });
  y -= 12;
  escrever(`Comprovante: ${baixa.id}`);
  escrever(`Pedido de compra: #${pedido.numero}`);
  escrever(`Fornecedor: ${fornecedor?.nome_fantasia || fornecedor?.nome || "Não informado"}`, { bold: true });
  escrever(`CPF/CNPJ do fornecedor: ${fornecedor?.documento || "Não informado"}`);
  escrever(`Valor pago: ${moeda(baixa.valor)}`, { tamanho: 15, bold: true, cor: azul });
  escrever(`Forma: ${String(baixa.forma).replaceAll("_", " ")}`);
  escrever("Status: confirmado");
  escrever(`Registrado em: ${data(baixa.pago_em || baixa.created_at)}`);
  escrever(`Referência: ${baixa.referencia || "Não informada"}`);
  y -= 10;
  escrever("Observações", { bold: true });
  for (const linha of linhas(baixa.observacao || "Sem observações.")) escrever(linha);
  y -= 24;
  pagina.drawLine({ start: { x: 120, y }, end: { x: 475, y }, thickness: 0.8, color: rgb(0.35, 0.39, 0.45) });
  y -= 20;
  escrever(fornecedor?.nome_fantasia || fornecedor?.nome || "Fornecedor", { bold: true });
  y = 72;
  escrever("Este comprovante registra uma operação financeira interna e não substitui nota fiscal, NFC-e ou NFS-e.", { tamanho: 8 });
  escrever(`Emitido pelo CRM em ${data(new Date().toISOString())}.`, { tamanho: 8 });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="comprovante-pagamento-${baixa.id.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
