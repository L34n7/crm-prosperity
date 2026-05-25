const WEBHOOK_URL =
  process.env.TEST_WEBHOOK_URL ||
  "http://localhost:3000/api/webhooks/whatsapp";

const PHONE_NUMBER_ID =
  process.env.TEST_PHONE_NUMBER_ID || "1121455171042033";

const DISPLAY_PHONE_NUMBER =
  process.env.TEST_DISPLAY_PHONE_NUMBER || "553175051275";

const TOTAL = Number(process.env.TEST_TOTAL || 10);
const CONCURRENCY = Number(process.env.TEST_CONCURRENCY || 5);
const TEXTO = process.env.TEST_MESSAGE || "Agendar";

function criarPayload(index) {
  const agora = Math.floor(Date.now() / 1000).toString();

  const numeroFake = `5531999${String(index).padStart(6, "0")}`;
  const messageId = `wamid.TESTE_${Date.now()}_${index}_${Math.random()
    .toString(36)
    .slice(2)}`;

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "TEST_WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: DISPLAY_PHONE_NUMBER,
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [
                {
                  profile: {
                    name: `Contato Teste ${index}`,
                  },
                  wa_id: numeroFake,
                },
              ],
              messages: [
                {
                  from: numeroFake,
                  id: messageId,
                  timestamp: agora,
                  type: "text",
                  text: {
                    body: TEXTO,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function enviarMensagem(index) {
  const inicio = Date.now();

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(criarPayload(index)),
  });

  const json = await response.json().catch(() => null);

  return {
    index,
    status: response.status,
    tempo_ms: Date.now() - inicio,
    ok: response.ok,
    json,
  };
}

async function executarEmRodadas() {
  console.log("Iniciando teste em rodadas:", {
    WEBHOOK_URL,
    PHONE_NUMBER_ID,
    TOTAL,
    mensagensPorSegundo: CONCURRENCY,
    TEXTO,
  });

  const resultados = [];
  const inicioTotal = Date.now();

  let enviadas = 0;
  let rodada = 1;

  while (enviadas < TOTAL) {
    const quantidadeRodada = Math.min(CONCURRENCY, TOTAL - enviadas);

    console.log(`\n[RODADA ${rodada}] Enviando ${quantidadeRodada} mensagens simultâneas...`);

    const inicioRodada = Date.now();

    const promessas = Array.from({ length: quantidadeRodada }, (_, i) => {
      const index = enviadas + i + 1;
      return enviarMensagem(index);
    });

    const resultadosRodada = await Promise.allSettled(promessas);

    for (const item of resultadosRodada) {
      if (item.status === "fulfilled") {
        resultados.push(item.value);

        console.log(
          `[TESTE] mensagem ${item.value.index}/${TOTAL}`,
          item.value.ok ? "OK" : "ERRO",
          `${item.value.tempo_ms}ms`
        );
      } else {
        resultados.push({
          ok: false,
          error: item.reason?.message || String(item.reason),
        });

        console.error("[TESTE] ERRO", item.reason);
      }
    }

    enviadas += quantidadeRodada;

    const tempoRodada = Date.now() - inicioRodada;

    console.log(`[RODADA ${rodada}] Finalizada em ${tempoRodada}ms`);

    rodada++;

    if (enviadas < TOTAL) {
      const espera = Math.max(0, 1000 - tempoRodada);

      console.log(`[AGUARDANDO] ${espera}ms para fechar 1 segundo...`);

      await new Promise((resolve) => setTimeout(resolve, espera));
    }
  }

  const tempoTotal = Date.now() - inicioTotal;

  const sucesso = resultados.filter((r) => r.ok).length;
  const erro = resultados.length - sucesso;
  const media =
    resultados.reduce((acc, r) => acc + (r.tempo_ms || 0), 0) /
    resultados.length;

  console.log("\nResumo:");
  console.log({
    total: resultados.length,
    sucesso,
    erro,
    tempoTotal_ms: tempoTotal,
    mediaRespostaWebhook_ms: Math.round(media),
  });
}

executarEmRodadas();