import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import * as XLSX from "xlsx";

const supabaseAdmin = getSupabaseAdmin();

type StatusLead =
  | "novo"
  | "em_atendimento"
  | "qualificado"
  | "cliente"
  | "perdido";

type LinhaPreview = {
  linha: number;
  nome: string | null;
  telefone_original: string;
  telefone_normalizado: string;
  email: string | null;
  origem: string | null;
  origem_importacao?: string | null;
  campanha: string | null;
  status_lead: StatusLead;
  observacoes: string | null;
  motivo?: string;
  alerta?: boolean;
  telefone_revisar?: boolean;
};

function podeGerenciarContatos(usuario: UsuarioContexto) {
  const nomesPerfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);

  return (
    nomesPerfis.includes("Administrador") ||
    nomesPerfis.includes("Supervisor") ||
    nomesPerfis.includes("Atendente")
  );
}

function normalizarStatusLead(valor: string): StatusLead {
  const v = String(valor || "").trim().toLowerCase();

  if (
    v === "novo" ||
    v === "em_atendimento" ||
    v === "qualificado" ||
    v === "cliente" ||
    v === "perdido"
  ) {
    return v;
  }

  return "novo";
}

function normalizeHeaderName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getFirstValueByPossibleHeaders(
  headers: string[],
  row: string[],
  possibleHeaders: string[]
) {
  for (const headerName of possibleHeaders) {
    const normalized = normalizeHeaderName(headerName);
    const index = headers.findIndex((h) => normalizeHeaderName(h) === normalized);

    if (index !== -1) {
      const value = String(row[index] || "").trim();
      if (value) return value;
    }
  }

  return "";
}

function montarNomePorPartes(headers: string[], row: string[]) {
  const nomeCompleto = getFirstValueByPossibleHeaders(headers, row, [
    "nome",
    "name",
    "full name",
    "display name",
    "file as",
  ]);

  if (nomeCompleto) return nomeCompleto;

  const firstName = getFirstValueByPossibleHeaders(headers, row, [
    "first name",
    "given name",
    "nome",
  ]);

  const middleName = getFirstValueByPossibleHeaders(headers, row, [
    "middle name",
    "additional name",
  ]);

  const lastName = getFirstValueByPossibleHeaders(headers, row, [
    "last name",
    "family name",
    "surname",
    "sobrenome",
  ]);

  return [firstName, middleName, lastName].filter(Boolean).join(" ").trim();
}

function obterTelefoneDaLinha(headers: string[], row: string[]) {
  return getFirstValueByPossibleHeaders(headers, row, [
    "telefone",
    "numero",
    "número",
    "phone",
    "mobile phone",
    "primary phone",
    "home phone",
    "home phone 2",
    "business phone",
    "business phone 2",
    "company main phone",
    "other phone",
    "car phone",
    "callback",
    "assistant's phone",
    "phone 1 - value",
    "phone 2 - value",
    "phone 3 - value",
  ]);
}

function obterEmailDaLinha(headers: string[], row: string[]) {
  return getFirstValueByPossibleHeaders(headers, row, [
    "email",
    "e-mail",
    "email address",
    "e-mail address",
    "e-mail 2 address",
    "e-mail 3 address",
    "email 2 address",
    "email 3 address",
  ]);
}

function obterObservacoesDaLinha(headers: string[], row: string[]) {
  return getFirstValueByPossibleHeaders(headers, row, [
    "observacoes",
    "observação",
    "notes",
    "anotacoes",
    "anotações",
  ]);
}

function parseCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result.map((value) => value.replace(/^"|"$/g, "").trim());
}

function parseCsv(text: string) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return { headers: [], rows: [] as string[][] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);

  return { headers, rows };
}

async function parseSpreadsheetFile(file: File) {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".csv")) {
    const text = await file.text();
    return parseCsv(text);
  }

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return { headers: [], rows: [] as string[][] };
    }

    const worksheet = workbook.Sheets[firstSheetName];

    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
      worksheet,
      {
        header: 1,
        defval: "",
        raw: false,
      }
    );

    if (!matrix.length) {
      return { headers: [], rows: [] as string[][] };
    }

    const headers = (matrix[0] || []).map((cell) => String(cell || "").trim());
    const rows = matrix
      .slice(1)
      .map((row) => row.map((cell) => String(cell || "").trim()))
      .filter((row) => row.some((cell) => cell.trim() !== ""));

    return { headers, rows };
  }

  throw new Error("Formato de arquivo não suportado");
}

function formatarDataHoraImportacao(data: Date) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = String(data.getFullYear());
  const hora = String(data.getHours()).padStart(2, "0");
  const minuto = String(data.getMinutes()).padStart(2, "0");

  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

function telefoneImportacaoValido(telefone: string) {
  return telefone.length >= 8;
}

function telefonePrecisaRevisao(telefone: string) {
  return telefone.length < 10;
}

export async function POST(request: Request) {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!podeGerenciarContatos(usuario)) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para importar contatos" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Arquivo CSV não enviado" },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();

    if (
      !fileName.endsWith(".csv") &&
      !fileName.endsWith(".xlsx") &&
      !fileName.endsWith(".xls")
    ) {
      return NextResponse.json(
        { ok: false, error: "Envie um arquivo .csv, .xlsx ou .xls" },
        { status: 400 }
      );
    }

    const { headers, rows } = await parseSpreadsheetFile(file);

    if (!headers.length) {
      return NextResponse.json(
        { ok: false, error: "Arquivo vazio" },
        { status: 400 }
      );
    }

    const encontrouAlgumaColunaDeTelefone = headers.some((header) =>
      [
        "telefone",
        "numero",
        "número",
        "phone",
        "mobile phone",
        "primary phone",
        "home phone",
        "business phone",
        "other phone",
        "phone 1 - value",
        "phone 2 - value",
        "phone 3 - value",
      ].includes(normalizeHeaderName(header))
    );

    if (!encontrouAlgumaColunaDeTelefone) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Não encontrei uma coluna de telefone no arquivo. Aceito, por exemplo: "telefone", "Número", "Mobile Phone", "Primary Phone" ou "Phone 1 - Value".',
        },
        { status: 400 }
      );
    }

    const { data: contatosExistentes, error: contatosError } = await supabaseAdmin
      .from("contatos")
      .select("telefone")
      .eq("empresa_id", usuario.empresa_id);

    if (contatosError) {
      return NextResponse.json(
        { ok: false, error: contatosError.message },
        { status: 500 }
      );
    }

    const telefonesBanco = new Set(
      (contatosExistentes || [])
        .map((item) => normalizarTelefoneBrasilParaWhatsApp(item.telefone))
        .filter(Boolean)
    );

    const telefonesArquivo = new Set<string>();

    const validos: LinhaPreview[] = [];
    const alertas: LinhaPreview[] = [];
    const duplicadosBanco: LinhaPreview[] = [];
    const duplicadosArquivo: LinhaPreview[] = [];
    const invalidos: LinhaPreview[] = [];

    const nomeArquivoImportacao = file.name;
    const dataImportacaoTexto = formatarDataHoraImportacao(new Date());
    const origemImportacaoPadrao = `Importação - ${nomeArquivoImportacao} - ${dataImportacaoTexto}`;

    rows.forEach((row, index) => {
      const linhaReal = index + 2;

      const nome = montarNomePorPartes(headers, row) || null;
      const telefoneOriginal = obterTelefoneDaLinha(headers, row);
      const telefoneNormalizado = normalizarTelefoneBrasilParaWhatsApp(telefoneOriginal);
      const email = obterEmailDaLinha(headers, row) || null;
      const observacoes = obterObservacoesDaLinha(headers, row) || null;

      const origem =
        getFirstValueByPossibleHeaders(headers, row, ["origem", "source"]) ||
        origemImportacaoPadrao;

      const campanha =
        getFirstValueByPossibleHeaders(headers, row, ["campanha", "campaign"]) || null;

      const statusLead = normalizarStatusLead(
        getFirstValueByPossibleHeaders(headers, row, ["status_lead", "status"])
      );

      const base: LinhaPreview = {
        linha: linhaReal,
        nome,
        telefone_original: telefoneOriginal,
        telefone_normalizado: telefoneNormalizado,
        email,
        origem,
        origem_importacao: origemImportacaoPadrao,
        campanha,
        status_lead: statusLead,
        observacoes,
        telefone_revisar: telefonePrecisaRevisao(telefoneNormalizado),
      };

      if (!telefoneOriginal.trim()) {
        invalidos.push({
          ...base,
          motivo: "Telefone não informado",
        });
        return;
      }

      if (!telefoneImportacaoValido(telefoneNormalizado)) {
        invalidos.push({
          ...base,
          motivo: "Telefone inválido",
        });
        return;
      }

      if (telefonesArquivo.has(telefoneNormalizado)) {
        duplicadosArquivo.push({
          ...base,
          motivo: "Telefone duplicado dentro do arquivo",
        });
        return;
      }

      if (telefonesBanco.has(telefoneNormalizado)) {
        duplicadosBanco.push({
          ...base,
          motivo: "Telefone já cadastrado no sistema",
        });
        return;
      }

      telefonesArquivo.add(telefoneNormalizado);

      if (telefonePrecisaRevisao(telefoneNormalizado)) {
        alertas.push({
          ...base,
          alerta: true,
          motivo: "Telefone importado, mas marcado para revisão.",
        });
        return;
      }

      validos.push(base);
    });

    return NextResponse.json({
      ok: true,
      resumo: {
        total: rows.length,
        validos: validos.length,
        alertas: alertas.length,
        duplicados_banco: duplicadosBanco.length,
        duplicados_arquivo: duplicadosArquivo.length,
        invalidos: invalidos.length,
      },
      headers,
      validos,
      alertas,
      duplicados_banco: duplicadosBanco,
      duplicados_arquivo: duplicadosArquivo,
      invalidos,
      campos_detectados: {
        headers_recebidos: headers,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno ao analisar arquivo" },
      { status: 500 }
    );
  }
}