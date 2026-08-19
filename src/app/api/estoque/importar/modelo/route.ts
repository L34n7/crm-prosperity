import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { IMPORTACAO_PRODUTOS_CABECALHOS } from "@/lib/estoque/importacao-produtos";
import { can } from "@/lib/permissoes/frontend";

export const runtime = "nodejs";

function erro(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return erro(contexto.error, contexto.status);
  if (!contexto.usuario.empresa_id) return erro("Usuário sem empresa vinculada.");
  if (!can(contexto.usuario.permissoes, "estoque.gerenciar")) {
    return erro("Sem permissão para importar produtos.", 403);
  }

  const exemplo = [
    "PROD-001",
    "Luva nitrílica P",
    "Caixa com 100 unidades",
    "insumo",
    "cx",
    "LUVA-NIT-P",
    "7891234567890",
    "Descartáveis",
    "Marca Exemplo",
    5,
    29.9,
    49.9,
    "Sim",
    "Sim",
    "Não",
    10,
    "PRINCIPAL",
    "A-01",
    "L24001",
    "01/08/2026",
    "01/08/2028",
    "",
  ];

  const planilha = XLSX.utils.aoa_to_sheet([
    [...IMPORTACAO_PRODUTOS_CABECALHOS],
    exemplo,
  ]);
  planilha["!cols"] = IMPORTACAO_PRODUTOS_CABECALHOS.map((cabecalho) => ({
    wch: Math.max(14, cabecalho.length + 2),
  }));
  planilha["!autofilter"] = { ref: `A1:V2` };
  for (let coluna = 0; coluna < IMPORTACAO_PRODUTOS_CABECALHOS.length; coluna += 1) {
    const celula = planilha[XLSX.utils.encode_cell({ r: 1, c: coluna })];
    if (celula && [0, 4, 5, 6, 12, 13, 14, 16, 17, 18, 19, 20, 21].includes(coluna)) {
      celula.t = "s";
      celula.v = String(celula.v ?? "");
    }
  }

  const instrucoes = XLSX.utils.aoa_to_sheet([
    ["Importação de produtos — instruções"],
    ["Campo obrigatório", "nome"],
    ["Identificação", "Produtos existentes são localizados por código, SKU ou código de barras."],
    ["Campos vazios", "Ao atualizar, campos vazios preservam o valor atual."],
    ["Tipos aceitos", "produto, material ou insumo"],
    ["Unidades aceitas", "un, cx, pct, kg, g, l, ml, m ou cm"],
    ["Campos Sim/Não", "controla_lote, controla_validade e controla_serie"],
    ["Categoria e marca", "São localizadas pelo nome e criadas automaticamente quando ainda não existem."],
    ["Saldo inicial", "Aplicado somente a produtos novos e registrado como documento de entrada."],
    ["Depósito", "Use o código ou nome. Se ficar vazio, será usado o depósito principal."],
    ["Lote e validade", "Obrigatórios no saldo inicial quando os respectivos controles estiverem ativos."],
    ["Número de série", "Para item serializado, use saldo inicial 1 e uma linha por produto."],
    ["Datas", "Use DD/MM/AAAA."],
    ["Limite", "Até 2.000 produtos e 5 MB por importação."],
  ]);
  instrucoes["!cols"] = [{ wch: 22 }, { wch: 92 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, "Produtos");
  XLSX.utils.book_append_sheet(workbook, instrucoes, "Instruções");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-importacao-produtos.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
