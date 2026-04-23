import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    // Cabeçalhos padrão
    const headers = [
      "nome",
      "telefone",
      "email",
      "origem",
      "campanha",
      "status_lead",
      "observacoes",
    ];

    // Linha de exemplo (opcional, ajuda MUITO o usuário)
    const exemplo = [
      "João Silva",
      "31999999999",
      "joao@email.com",
      "WhatsApp",
      "Campanha Abril",
      "novo",
      "Cliente interessado",
    ];

    // Criar worksheet
    const worksheet = XLSX.utils.aoa_to_sheet([headers, exemplo]);

    // Criar workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contatos");

    // Gerar arquivo em buffer
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="modelo-importacao-contatos.xlsx"',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao gerar modelo." },
      { status: 500 }
    );
  }
}