import OpenAI from "openai";

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

export async function interpretarArquivoComIA(params: {
  instrucao: string;
  arquivoUrl: string;
  mimeType?: string | null;
}): Promise<ResultadoInterpretacaoArquivo> {
  const { instrucao, arquivoUrl, mimeType } = params;

  if (!arquivoUrl) {
    return {
      sucesso: false,
      status: "erro",
      motivo: "Arquivo sem URL para análise.",
      dados_extraidos: {},
      confianca: 0,
    };
  }

  const prompt = `
Você é uma IA de análise de arquivos recebidos no WhatsApp.

Instrução do usuário:
${instrucao}

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
- Se for comprovante, extraia valor, data, pagador, recebedor, banco e id_transacao quando possível.
`.trim();

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
            {
              type: "input_image",
              image_url: arquivoUrl,
              detail: "low",
            },
          ],
        },
      ],
    });

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

    return {
      sucesso: json.sucesso === true && json.status === "aprovado",
      status: statusPermitido ? json.status : "erro",
      motivo: String(json.motivo || "Análise concluída."),
      dados_extraidos:
        json.dados_extraidos && typeof json.dados_extraidos === "object"
          ? json.dados_extraidos
          : {},
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