import OpenAI from "openai";
import {
  extrairUsoTokensIa,
  registrarUsoTokensIa,
  verificarSaldoTokensIa,
} from "@/lib/ia/tokens";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ResultadoInterpretacaoArquivo = {
  sucesso: boolean;
  status: "aprovado" | "reprovado" | "erro";
  motivo: string;
  dados_extraidos: Record<string, any>;
  confianca?: number;
};

function extrairJson(texto: string) {
  try {
    return JSON.parse(texto);
  } catch {
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function montarPrompt(instrucao: string, camposExtracao: string[]) {
  const camposValidos = camposExtracao
    .map((campo) => String(campo || "").trim())
    .filter(Boolean);

  const instrucaoCampos =
    camposValidos.length > 0
      ? `
Campos permitidos em dados_extraidos:
${camposValidos.map((campo) => `- ${campo}`).join("\n")}

Regras dos campos:
- Use SOMENTE os campos listados acima dentro de dados_extraidos.
- Não crie campos novos.
- Se não encontrar uma informação, retorne o campo com valor vazio.
`
      : `
Não extraia campos específicos em dados_extraidos, a menos que seja indispensável.
`;

  return `
Você é uma IA de análise de arquivos recebidos no WhatsApp.

Instrução do usuário:
${instrucao}

${instrucaoCampos}

Analise o arquivo e responda SOMENTE em JSON válido neste formato:

{
  "sucesso": true,
  "status": "aprovado",
  "motivo": "explicação curta",
  "dados_extraidos": {},
  "confianca": 0.0
}

Regras:
- "status" deve ser apenas: "aprovado", "reprovado" ou "erro".
- Use "aprovado" somente se o arquivo atender claramente à instrução.
- Use "reprovado" se o arquivo não atender à instrução.
- Use "erro" se estiver ilegível, inacessível ou inconclusivo.
- Não invente dados.
`.trim();
}

export async function interpretarArquivoComIA(params: {
  instrucao: string;
  arquivoUrl: string;
  mimeType?: string | null;
  camposExtracao?: string[];
  empresaId?: string | null;
  usuarioId?: string | null;
  metadata?: Record<string, any>;
}): Promise<ResultadoInterpretacaoArquivo> {
  const {
    instrucao,
    arquivoUrl,
    mimeType,
    camposExtracao = [],
    empresaId,
    usuarioId,
    metadata,
  } = params;

  if (!arquivoUrl) {
    return {
      sucesso: false,
      status: "erro",
      motivo: "Arquivo sem URL para análise.",
      dados_extraidos: {},
      confianca: 0,
    };
  }

  const prompt = montarPrompt(instrucao, camposExtracao);
  const mime = String(mimeType || "").toLowerCase();
  const ehPdf = mime.includes("pdf");
  const modelo = "gpt-4.1-mini";

  try {
    if (empresaId) {
      await verificarSaldoTokensIa(empresaId);
    }

    const content: any[] = [
      {
        type: "input_text",
        text: prompt,
      },
    ];

    if (ehPdf) {
      content.push({
        type: "input_file",
        file_url: arquivoUrl,
      });
    } else {
      content.push({
        type: "input_image",
        image_url: arquivoUrl,
        detail: "low",
      });
    }

    const response = await openai.responses.create({
      model: modelo,
      input: [
        {
          role: "user",
          content,
        },
      ],
    });

    if (empresaId) {
      await registrarUsoTokensIa({
        empresaId,
        usuarioId,
        origem: "interpretar_arquivo",
        modelo,
        uso: extrairUsoTokensIa(response.usage),
        metadata: {
          mime_type: mimeType || null,
          campos_extracao: camposExtracao,
          ...(metadata || {}),
        },
      });
    }

    const texto = response.output_text || "";
    const json = extrairJson(texto);

    if (!json) {
      return {
        sucesso: false,
        status: "erro",
        motivo: "A IA não retornou um JSON válido.",
        dados_extraidos: {
          resposta_bruta: texto,
        },
        confianca: 0,
      };
    }

    const statusPermitido = ["aprovado", "reprovado", "erro"].includes(
      String(json.status || "")
    );

    const status = statusPermitido ? json.status : "erro";

    const dadosExtraidosBrutos =
      json.dados_extraidos && typeof json.dados_extraidos === "object"
        ? json.dados_extraidos
        : {};

    const camposPermitidos = camposExtracao
      .map((campo) => String(campo || "").trim())
      .filter(Boolean);

    const dadosExtraidosFiltrados =
      camposPermitidos.length > 0
        ? camposPermitidos.reduce((acc: Record<string, any>, campo) => {
            acc[campo] = dadosExtraidosBrutos[campo] ?? "";
            return acc;
          }, {})
        : dadosExtraidosBrutos;
        
    return {
      sucesso: json.sucesso === true && status === "aprovado",
      status,
      motivo: String(json.motivo || "Análise concluída."),
      dados_extraidos: dadosExtraidosFiltrados,
      confianca: Number(json.confianca || 0),
    };
  } catch (error: any) {
    return {
      sucesso: false,
      status: "erro",
      motivo: error?.message || "Erro ao interpretar arquivo com IA.",
      dados_extraidos: {
        mimeType: mimeType || null,
      },
      confianca: 0,
    };
  }
}
