"use client";

import { useEffect, useState } from "react";

type Setor = {
  id: string;
  nome: string;
  descricao: string | null;
  status: "ativo" | "inativo";
  ordem_exibicao: number;
  created_at: string;
};

export default function SetoresPage() {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editStatus, setEditStatus] = useState<"ativo" | "inativo">("ativo");

  async function carregarSetores() {
    setErro("");

    const res = await fetch("/api/setores");
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar setores");
      return;
    }

    setSetores(data.setores || []);
  }

  async function criarSetor() {
    setMensagem("");
    setErro("");

    if (!nome.trim()) {
      setErro("Digite o nome do setor.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/setores", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ nome, descricao }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao criar setor");
      setLoading(false);
      return;
    }

    setMensagem("Setor criado com sucesso.");
    setNome("");
    setDescricao("");
    setLoading(false);
    carregarSetores();
  }

  function iniciarEdicao(setor: Setor) {
    setEditandoId(setor.id);
    setEditNome(setor.nome);
    setEditDescricao(setor.descricao || "");
    setEditStatus(setor.status);
    setMensagem("");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditNome("");
    setEditDescricao("");
    setEditStatus("ativo");
  }

  async function salvarEdicao() {
    if (!editandoId) return;

    setMensagem("");
    setErro("");

    if (!editNome.trim()) {
      setErro("Digite o nome do setor.");
      return;
    }

    const res = await fetch(`/api/setores/${editandoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: editNome,
        descricao: editDescricao,
        status: editStatus,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao atualizar setor");
      return;
    }

    setMensagem("Setor atualizado com sucesso.");
    cancelarEdicao();
    carregarSetores();
  }

  async function alternarStatus(setor: Setor) {
    setMensagem("");
    setErro("");

    const novoStatus = setor.status === "ativo" ? "inativo" : "ativo";

    const res = await fetch(`/api/setores/${setor.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: setor.nome,
        descricao: setor.descricao || "",
        status: novoStatus,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao alterar status");
      return;
    }

    setMensagem(
      `Setor ${novoStatus === "ativo" ? "ativado" : "inativado"} com sucesso.`
    );
    carregarSetores();
  }

  useEffect(() => {
    carregarSetores();
  }, []);

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-2xl font-bold">Setores</h1>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Criar novo setor</h2>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Nome</label>
              <input
                type="text"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Ex.: Comercial"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Descrição</label>
              <textarea
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Ex.: Atendimento comercial e vendas"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={3}
              />
            </div>

            <button
              onClick={criarSetor}
              disabled={loading}
              className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
            >
              {loading ? "Criando..." : "Criar setor"}
            </button>
          </div>
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
          <h2 className="mb-4 text-lg font-semibold">Lista de setores</h2>

          <div className="space-y-4">
            {setores.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum setor cadastrado ainda.</p>
            ) : (
              setores.map((setor) => (
                <div key={setor.id} className="rounded-xl border p-4">
                  {editandoId === setor.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Nome
                        </label>
                        <input
                          type="text"
                          className="w-full rounded-lg border px-3 py-2"
                          value={editNome}
                          onChange={(e) => setEditNome(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Descrição
                        </label>
                        <textarea
                          className="w-full rounded-lg border px-3 py-2"
                          rows={3}
                          value={editDescricao}
                          onChange={(e) => setEditDescricao(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">
                          Status
                        </label>
                        <select
                          className="w-full rounded-lg border px-3 py-2"
                          value={editStatus}
                          onChange={(e) =>
                            setEditStatus(e.target.value as "ativo" | "inativo")
                          }
                        >
                          <option value="ativo">Ativo</option>
                          <option value="inativo">Inativo</option>
                        </select>
                      </div>

                      <div className="flex gap-2">
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
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-base font-semibold">{setor.nome}</h3>
                        <p className="mt-1 text-sm text-gray-600">
                          {setor.descricao || "Sem descrição"}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                          Status:{" "}
                          <span
                            className={
                              setor.status === "ativo"
                                ? "font-medium text-green-600"
                                : "font-medium text-red-600"
                            }
                          >
                            {setor.status}
                          </span>
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => iniciarEdicao(setor)}
                          className="rounded-lg border px-3 py-2 text-sm"
                        >
                          Editar
                        </button>

                        <button
                          onClick={() => alternarStatus(setor)}
                          className="rounded-lg border px-3 py-2 text-sm"
                        >
                          {setor.status === "ativo" ? "Inativar" : "Ativar"}
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