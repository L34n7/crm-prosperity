"use client";

export default function TesteTemplatePage() {
  async function testar() {
    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
  "integracao_whatsapp_id": "b9eecdcd-71f4-47aa-9890-7f78675fd84e",
  "name": "aviso_atendimento_iniciado",
  "category": "UTILITY",
  "language": "pt_BR",
  "components": [
    {
      "type": "BODY",
      "text": "Olá {{1}}, seu atendimento foi iniciado com sucesso. O protocolo gerado foi {{2}}. Guarde esta informação.",
      "example": {
        "body_text": [
          ["João", "ABC-123456"]
        ]
      }
    },
    {
      "type": "FOOTER",
      "text": "Equipe de atendimento"
    }
  ]
}),
      });

      const json = await res.json();

      console.log("Resposta:", json);

      alert(JSON.stringify(json, null, 2));
    } catch (error) {
      console.error(error);
      alert("Erro ao chamar API");
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Teste de Template WhatsApp</h1>

      <button
        onClick={testar}
        style={{
          marginTop: 20,
          padding: "12px 20px",
          background: "black",
          color: "white",
          borderRadius: 8,
          cursor: "pointer"
        }}
      >
        Criar Template
      </button>
    </div>
  );
}