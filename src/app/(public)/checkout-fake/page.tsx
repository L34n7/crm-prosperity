"use client";

import { useMemo, useState } from "react";

type MetodoPagamento = "pix" | "credit_card" | "billet";

function gerarTransactionId() {
  return `tx_fake_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function limparTelefone(valor: string) {
  return valor.replace(/\D/g, "");
}

export default function CheckoutFakePage() {
  const [nome, setNome] = useState("Leandro Teste");
  const [email, setEmail] = useState("seuemail@gmail.com");
  const [telefone, setTelefone] = useState("(31) 99999-9999");
  const [empresa, setEmpresa] = useState("Empresa Teste");
  const [metodo, setMetodo] = useState<MetodoPagamento>("pix");
  const [planoSlug, setPlanoSlug] = useState("basico");
  const [tipoOferta, setTipoOferta] = useState<"normal" | "vip" | "jv">("normal");
  const [valor, setValor] = useState("49,90");
  const [carregando, setCarregando] = useState(false);
  const [resposta, setResposta] = useState("");
  const [erro, setErro] = useState("");
  const [mostrarPayload, setMostrarPayload] = useState(false);

  const valorCentavos = useMemo(() => {
    const normalizado = valor.replace(/\./g, "").replace(",", ".");
    const numero = Number(normalizado);

    if (Number.isNaN(numero)) return 0;

    return Math.round(numero * 100);
  }, [valor]);

  const payload = useMemo(() => {
    const transactionId = gerarTransactionId();

    return {
      token: `fake_token_${Date.now()}`,
      event: "transaction",
      created_at: new Date().toISOString(),
      paid_at: new Date().toISOString(),
      refunded_at: null,
      platform: "Checkout Fake",
      status: "paid",
      method: metodo,
      customer: {
        id: `cus_fake_${Date.now()}`,
        name: nome,
        email,
        phone: limparTelefone(telefone),
        phone_number: limparTelefone(telefone),
        document: null,
        zip_code: null,
        street_name: null,
        number: null,
        complement: null,
        neighborhood: null,
        city: null,
        state: null,
      },
      affiliate: null,
      transaction: {
        id: transactionId,
        status: "paid",
        method: metodo,
        tracking_code: "TRACK_FAKE_001",
        country: "BR",
        amount: valorCentavos,
        net_amount: Math.max(valorCentavos - 300, 0),
        url: null,
        billet: {
          url: null,
          barcode: null,
          expires_at: null,
        },
        pix: {
          code: "PIX_FAKE_CODE",
          url: null,
          expires_at: null,
        },
      },
      offer: {
        hash: "offer_fake_001",
        title: empresa || "Plano Teste",
        price: valorCentavos,
      },
      items: [
        {
          hash: "item_fake_001",
          product_hash: "prod_fake_001",
          title: `Plano ${planoSlug}`,
          price: valorCentavos,
          quantity: 1,
          cover: null,
          operation_type: 1,
        },
      ],
      tracking: {
        src: "checkout_fake",
        utm_source: "teste_local",
        utm_campaign: "checkout_fake",
        utm_medium: "interno",
        utm_term: planoSlug,
        utm_content: tipoOferta,
      },
      metadata_extra: {
        empresa,
        plano_slug: planoSlug,
        tipo_oferta: tipoOferta,
      },
      ip: "127.0.0.1",
      fbp: null,
      fbc: null,
    };
  }, [nome, email, telefone, empresa, metodo, valorCentavos, planoSlug, tipoOferta]);

  async function simularPagamentoAprovado() {
    try {
      setCarregando(true);
      setErro("");
      setResposta("");

      const response = await fetch("/api/webhooks/atomopay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok) {
        setErro(json?.error || "Erro ao simular pagamento.");
        return;
      }

      setResposta(JSON.stringify(json, null, 2));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro inesperado.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
        padding: "32px 20px",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: "24px",
        }}
      >
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "24px",
            boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08)",
            padding: "28px",
          }}
        >
          <div style={{ marginBottom: "28px" }}>
            <p
              style={{
                margin: 0,
                color: "#4338ca",
                fontWeight: 800,
                fontSize: "12px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Ambiente de teste
            </p>

            <h1
              style={{
                marginTop: "10px",
                marginBottom: "10px",
                fontSize: "34px",
                lineHeight: 1.1,
                color: "#0f172a",
              }}
            >
              Checkout Fake
            </h1>

            <p
              style={{
                margin: 0,
                color: "#475569",
                fontSize: "15px",
                lineHeight: 1.6,
              }}
            >
              Use esta página para simular pagamentos aprovados e testar o
              fluxo do webhook, criação de empresa e envio do convite por email.
            </p>
          </div>

          <div style={{ display: "grid", gap: "18px" }}>
            <div>
              <label style={labelStyle}>Nome</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do cliente"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@email.com"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Telefone</label>
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(31) 99999-9999"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Empresa / título da oferta</label>
              <input
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                placeholder="Nome da empresa"
                style={inputStyle}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "14px",
              }}
            >
              <div>
                <label style={labelStyle}>Plano slug</label>
                <input
                  value={planoSlug}
                  onChange={(e) => setPlanoSlug(e.target.value)}
                  placeholder="basico"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Tipo de oferta</label>
                <select
                  value={tipoOferta}
                  onChange={(e) =>
                    setTipoOferta(e.target.value as "normal" | "vip" | "jv")
                  }
                  style={inputStyle}
                >
                  <option value="normal">normal</option>
                  <option value="vip">vip</option>
                  <option value="jv">jv</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Valor</label>
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="49,90"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Método de pagamento</label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "12px",
                }}
              >
                {[
                  { value: "pix", label: "Pix" },
                  { value: "credit_card", label: "Cartão" },
                  { value: "billet", label: "Boleto" },
                ].map((item) => {
                  const ativo = metodo === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setMetodo(item.value as MetodoPagamento)}
                      style={{
                        height: "48px",
                        borderRadius: "16px",
                        border: ativo
                          ? "2px solid #4338ca"
                          : "1px solid #cbd5e1",
                        background: ativo ? "#eef2ff" : "#ffffff",
                        color: ativo ? "#312e81" : "#0f172a",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                marginTop: "8px",
              }}
            >
              <button
                type="button"
                onClick={simularPagamentoAprovado}
                disabled={carregando}
                style={{
                  height: "52px",
                  border: "none",
                  borderRadius: "16px",
                  padding: "0 22px",
                  background: carregando ? "#94a3b8" : "#0f172a",
                  color: "#ffffff",
                  fontWeight: 800,
                  fontSize: "15px",
                  cursor: carregando ? "not-allowed" : "pointer",
                }}
              >
                {carregando ? "Simulando..." : "Simular pagamento aprovado"}
              </button>

              <button
                type="button"
                onClick={() => setMostrarPayload((prev) => !prev)}
                style={{
                  height: "52px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "16px",
                  padding: "0 18px",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {mostrarPayload ? "Ocultar payload" : "Ver payload"}
              </button>
            </div>

            {erro ? (
              <div
                style={{
                  marginTop: "8px",
                  borderRadius: "18px",
                  padding: "16px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#b91c1c",
                  fontSize: "14px",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {erro}
              </div>
            ) : null}

            {resposta ? (
              <div
                style={{
                  marginTop: "8px",
                  borderRadius: "18px",
                  padding: "16px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  color: "#166534",
                }}
              >
                <p style={{ marginTop: 0, fontWeight: 800 }}>
                  Resposta da API:
                </p>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: "13px",
                    lineHeight: 1.6,
                  }}
                >
                  {resposta}
                </pre>
              </div>
            ) : null}
          </div>
        </section>

        <aside
          style={{
            display: "grid",
            gap: "24px",
            alignSelf: "start",
          }}
        >
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "24px",
              boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08)",
              padding: "24px",
            }}
          >
            <p
              style={{
                marginTop: 0,
                marginBottom: "16px",
                color: "#0f172a",
                fontSize: "18px",
                fontWeight: 800,
              }}
            >
              Resumo do teste
            </p>

            <div style={{ display: "grid", gap: "12px" }}>
              <ResumoLinha label="Cliente" valor={nome || "-"} />
              <ResumoLinha label="Email" valor={email || "-"} />
              <ResumoLinha label="Telefone" valor={telefone || "-"} />
              <ResumoLinha label="Empresa" valor={empresa || "-"} />
              <ResumoLinha label="Plano" valor={planoSlug || "-"} />
              <ResumoLinha label="Oferta" valor={tipoOferta || "-"} />
              <ResumoLinha
                label="Método"
                valor={
                  metodo === "pix"
                    ? "Pix"
                    : metodo === "credit_card"
                    ? "Cartão"
                    : "Boleto"
                }
              />
              <ResumoLinha
                label="Valor"
                valor={`R$ ${(valorCentavos / 100).toFixed(2).replace(".", ",")}`}
              />
            </div>
          </section>

          {mostrarPayload ? (
            <section
              style={{
                background: "#0f172a",
                borderRadius: "24px",
                padding: "20px",
                color: "#e2e8f0",
                overflow: "hidden",
              }}
            >
              <p
                style={{
                  marginTop: 0,
                  marginBottom: "14px",
                  fontWeight: 800,
                  fontSize: "16px",
                }}
              >
                Payload enviado
              </p>

              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "12px",
                  lineHeight: 1.6,
                }}
              >
                {JSON.stringify(payload, null, 2)}
              </pre>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function ResumoLinha({
  label,
  valor,
}: {
  label: string;
  valor: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "16px",
        borderBottom: "1px solid #e2e8f0",
        paddingBottom: "10px",
      }}
    >
      <span style={{ color: "#64748b", fontSize: "14px" }}>{label}</span>
      <strong
        style={{
          color: "#0f172a",
          fontSize: "14px",
          textAlign: "right",
          wordBreak: "break-word",
        }}
      >
        {valor}
      </strong>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "8px",
  fontSize: "14px",
  fontWeight: 700,
  color: "#0f172a",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "50px",
  borderRadius: "16px",
  border: "1px solid #cbd5e1",
  padding: "0 14px",
  fontSize: "15px",
  color: "#0f172a",
  outline: "none",
  boxSizing: "border-box",
  background: "#ffffff",
};