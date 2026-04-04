"use client";

import { useEffect, useState } from "react";

type ConversaOpcao = {
  id: string;
  assunto: string | null;
  status: string;
  contatos?: {
    nome: string | null;
    telefone: string;
  } | null;
};

type Mensagem = {
  id: string;
  conversa_id: string;
  remetente_tipo: "contato" | "bot" | "ia" | "usuario" | "sistema";
  remetente_id: string | null;
  conteudo: string;
  tipo_mensagem: string;
  origem: "recebida" | "enviada" | "automatica";
  status_envio: "pendente" | "enviada" | "entregue" | "lida" | "falha";
  created_at: string;
};

export default function MensagensPage() {
  const [conversas, setConversas] = useState<ConversaOpcao[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [conversaId, setConversaId] = useState("");

  const [conteudo, setConteudo] = useState("");
  const [remetenteTipo, setRemetenteTipo] = useState("usuario");
  const [origem, setOrigem] = useState("enviada");
  const [statusEnvio, setStatusEnvio] = useState("enviada");

  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editConteudo, setEditConteudo] = useState("");

  async function carregarConversas() {
    const res = await fetch("/api/conversas");
    const data = await res.json();

    if (!res.ok) return;

    setConversas(data.conversas || []);
  }

  async function carregarMensagens(conversaIdAtual?: string) {
    const id = conversaIdAtual || conversaId;

    if (!id) {
      setMensagens([]);
      return;
    }

    setErro("");

    const res = await fetch(`/api/mensagens?conversa_id=${id}`);
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar mensagens");
      return;
    }

    setMensagens(data.mensagens || []);
  }

  async function criarMensagem() {
    setMensagem("");
    setErro("");

    if (!conversaId) {
      setErro("Selecione uma conversa.");
      return;
    }

    if (!conteudo.trim()) {
      setErro("Digite o conteúdo da mensagem.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/mensagens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversa_id: conversaId,
        remetente_tipo: remetenteTipo,
        conteudo,
        tipo_mensagem: "texto",
        origem,
        status_envio: statusEnvio,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao criar mensagem");
      setLoading(false);
      return;
    }

    setMensagem(data.message || "Mensagem criada com sucesso.");
    setConteudo("");
    setLoading(false);
    carregarMensagens();
  }

  function iniciarEdicao(msg: Mensagem) {
    setEditandoId(msg.id);
    setEditConteudo(msg.conteudo);
    setMensagem("");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditConteudo("");
  }

  async function salvarEdicao() {
    if (!editandoId) return;

    setMensagem("");
    setErro("");

    if (!editConteudo.trim()) {
      setErro("Digite o conteúdo da mensagem.");
      return;
    }

    const res = await fetch(`/api/mensagens/${editandoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conteudo: editConteudo,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao atualizar mensagem");
      return;
    }

    setMensagem(data.message || "Mensagem atualizada com sucesso.");
    cancelarEdicao();
    carregarMensagens();
  }

  useEffect(() => {
    carregarConversas();
  }, []);

  useEffect(() => {
    carregarMensagens();
  }, [conversaId]);

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-bold">Mensagens</h1>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Selecionar conversa</h2>

          <select
            className="w-full rounded-lg border px-3 py-2"
            value={conversaId}
            onChange={(e) => setConversaId(e.target.value)}
          >
            <option value="">Selecione uma conversa</option>
            {conversas.map((conversa) => (
              <option key={conversa.id} value={conversa.id}>
                {(conversa.assunto || "Sem assunto") +
                  " - " +
                  (conversa.contatos?.nome || "Sem nome") +
                  " - " +
                  (conversa.contatos?.telefone || "")}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Criar mensagem</h2>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Remetente</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={remetenteTipo}
                onChange={(e) => setRemetenteTipo(e.target.value)}
              >
                <option value="usuario">Usuário</option>
                <option value="contato">Contato</option>
                <option value="bot">Bot</option>
                <option value="ia">IA</option>
                <option value="sistema">Sistema</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Origem</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
              >
                <option value="enviada">Enviada</option>
                <option value="recebida">Recebida</option>
                <option value="automatica">Automática</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Status envio</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={statusEnvio}
                onChange={(e) => setStatusEnvio(e.target.value)}
              >
                <option value="pendente">Pendente</option>
                <option value="enviada">Enviada</option>
                <option value="entregue">Entregue</option>
                <option value="lida">Lida</option>
                <option value="falha">Falha</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium">Conteúdo</label>
            <textarea
              className="w-full rounded-lg border px-3 py-2"
              rows={4}
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder="Digite a mensagem"
            />
          </div>

          <button
            onClick={criarMensagem}
            disabled={loading}
            className="mt-4 rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {loading ? "Enviando..." : "Criar mensagem"}
          </button>
        </div>

        {mensagem && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {mensagem}
          </div>
        )}

        {erro && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Timeline de mensagens</h2>

          <div className="space-y-4">
            {!conversaId ? (
              <p className="text-sm text-gray-500">Selecione uma conversa para ver as mensagens.</p>
            ) : mensagens.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma mensagem cadastrada ainda.</p>
            ) : (
              mensagens.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-xl border p-4 ${
                    msg.origem === "recebida"
                      ? "bg-gray-50"
                      : msg.origem === "automatica"
                      ? "bg-yellow-50"
                      : "bg-white"
                  }`}
                >
                  {editandoId === msg.id ? (
                    <div>
                      <textarea
                        className="w-full rounded-lg border px-3 py-2"
                        rows={4}
                        value={editConteudo}
                        onChange={(e) => setEditConteudo(e.target.value)}
                      />

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={salvarEdicao}
                          className="rounded-lg bg-black px-4 py-2 text-white"
                        >
                          Salvar
                        </button>

                        <button
                          onClick={cancelarEdicao}
                          className="rounded-lg border px-4 py-2"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          {msg.remetente_tipo} • {msg.origem}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                          {msg.conteudo}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                          Status envio: {msg.status_envio}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(msg.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>

                      <div>
                        <button
                          onClick={() => iniciarEdicao(msg)}
                          className="rounded-lg border px-3 py-2 text-sm"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}