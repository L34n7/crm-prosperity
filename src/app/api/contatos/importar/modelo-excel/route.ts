import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    // Cabeçalhos padrão
    const headers = [
      "nome",
      "telefone",
      "campo_contato",
      "email",
      "origem",
      "campanha",
      "classificacao",
      "observacoes",
    ];

    // Telefone OU e-mail é suficiente: exemplos dos dois canais.
    const exemploWhatsapp = [
      "João Silva",
      "31999999999",
      "programador",
      "",
      "WhatsApp",
      "Campanha Abril",
      "qualificado",
      "Cliente interessado",
    ];
    const exemploEmail = [
      "Maria Oliveira",
      "",
      "interessada em imóvel",
      "maria@email.com",
      "E-mail Marketing",
      "Campanha Outubro",
      "novo",
      "Contato sem número de telefone",
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers, exemploWhatsapp, exemploEmail]);

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
