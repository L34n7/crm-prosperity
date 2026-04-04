"use client";

import { useEffect, useState } from "react";

type EmpresaOpcao = {
  id: string;
  nome_fantasia: string;
};

type Contato = {
  id: string;
  empresa_id: string;
  nome: string | null;
  telefone: string;
  email: string | null;
  origem: string | null;
  campanha: string | null;
  status_lead: "novo" | "em_atendimento" | "qualificado" | "cliente" | "perdido";
  observacoes: string | null;
  created_at: string;
};

export default function ContatosPage() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [origem, setOrigem] = useState("");
  const [campanha, setCampanha] = useState("");
  const [statusLead, setStatusLead] = useState("novo");
  const [observacoes, setObservacoes] = useState("");
  const [empresaId, setEmpresaId] = useState("");

  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");

  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editOrigem, setEditOrigem] = useState("");
  const [editCampanha, setEditCampanha] = useState("");
  const [editStatusLead, setEditStatusLead] = useState<
    "novo" | "em_atendimento" | "qualificado" | "cliente" | "perdido"
  >("novo");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [editEmpresaId, setEditEmpresaId] = useState("");

  async function carregarEmpresas() {
    const res = await fetch("/api/empresas/opcoes");
    const data = await res.json();

    if (!res.ok) return;

    setEmpresas(data.empresas || []);
  }

  async function carregarContatos() {
    setErro("");

    const params = new URLSearchParams();

    if (filtroStatus) {
      params.set("status_lead", filtroStatus);
    }

    if (busca.trim()) {
      params.set("busca", busca.trim());
    }

    const queryString = params.toString();
    const url = queryString ? `/api/contatos?${queryString}` : "/api/contatos";

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar contatos");
      return;
    }

    setContatos(data.contatos || []);
  }

  async function criarContato() {
    setMensagem("");
    setErro("");

    if (!telefone.trim()) {
      setErro("Digite o telefone do contato.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/contatos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome,
        telefone,
        email,
        origem,
        campanha,
        status_lead: statusLead,
        observacoes,
        empresa_id: empresaId || null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao criar contato");
      setLoading(false);
      return;
    }

    setMensagem(data.message || "Contato criado com sucesso.");
    setNome("");
    setTelefone("");
    setEmail("");
    setOrigem("");
    setCampanha("");
    setStatusLead("novo");
    setObservacoes("");
    setEmpresaId("");
    setLoading(false);
    carregarContatos();
  }

  function iniciarEdicao(contato: Contato) {
    setEditandoId(contato.id);
    setEditNome(contato.nome || "");
    setEditTelefone(contato.telefone || "");
    setEditEmail(contato.email || "");
    setEditOrigem(contato.origem || "");
    setEditCampanha(contato.campanha || "");
    setEditStatusLead(contato.status_lead);
    setEditObservacoes(contato.observacoes || "");
    setEditEmpresaId(contato.empresa_id || "");
    setMensagem("");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditNome("");
    setEditTelefone("");
    setEditEmail("");
    setEditOrigem("");
    setEditCampanha("");
    setEditStatusLead("novo");
    setEditObservacoes("");
    setEditEmpresaId("");
  }

  async function salvarEdicao() {
    if (!editandoId) return;

    setMensagem("");
    setErro("");

    if (!editTelefone.trim()) {
      setErro("Digite o telefone do contato.");
      return;
    }

    const res = await fetch(`/api/contatos/${editandoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: editNome,
        telefone: editTelefone,
        email: editEmail,
        origem: editOrigem,
        campanha: editCampanha,
        status_lead: editStatusLead,
        observacoes: editObservacoes,
        empresa_id: editEmpresaId || null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao atualizar contato");
      return;
    }

    setMensagem(data.message || "Contato atualizado com sucesso.");
    cancelarEdicao();
    carregarContatos();
  }

  useEffect(() => {
    carregarEmpresas();
  }, []);

  useEffect(() => {
    carregarContatos();
  }, [filtroStatus]);

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold">Contatos</h1>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Criar contato</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Nome</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do contato"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Telefone *</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="31999999999"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@contato.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Origem</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                placeholder="WhatsApp, Instagram, Site..."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Campanha</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={campanha}
                onChange={(e) => setCampanha(e.target.value)}
                placeholder="Nome da campanha"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Status do lead</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={statusLead}
                onChange={(e) => setStatusLead(e.target.value)}
              >
                <option value="novo">Novo</option>
                <option value="em_atendimento">Em atendimento</option>
                <option value="qualificado">Qualificado</option>
                <option value="cliente">Cliente</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Empresa</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={empresaId}
                onChange={(e) => setEmpresaId(e.target.value)}
              >
                <option value="">Usar empresa do usuário atual</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nome_fantasia}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Observações</label>
              <textarea
                className="w-full rounded-lg border px-3 py-2"
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Observações sobre o contato"
              />
            </div>
          </div>

          <button
            onClick={criarContato}
            disabled={loading}
            className="mt-4 rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {loading ? "Criando..." : "Criar contato"}
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

        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Filtros</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Buscar</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome, telefone ou email"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Status</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="novo">Novo</option>
                <option value="em_atendimento">Em atendimento</option>
                <option value="qualificado">Qualificado</option>
                <option value="cliente">Cliente</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>
          </div>

          <button
            onClick={carregarContatos}
            className="mt-4 rounded-lg border px-4 py-2"
          >
            Buscar
          </button>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Lista de contatos</h2>

          <div className="space-y-4">
            {contatos.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum contato cadastrado ainda.</p>
            ) : (
              contatos.map((contato) => (
                <div key={contato.id} className="rounded-xl border p-4">
                  {editandoId === contato.id ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <input
                        className="rounded-lg border px-3 py-2"
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        placeholder="Nome"
                      />
                      <input
                        className="rounded-lg border px-3 py-2"
                        value={editTelefone}
                        onChange={(e) => setEditTelefone(e.target.value)}
                        placeholder="Telefone"
                      />
                      <input
                        className="rounded-lg border px-3 py-2"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="Email"
                      />
                      <input
                        className="rounded-lg border px-3 py-2"
                        value={editOrigem}
                        onChange={(e) => setEditOrigem(e.target.value)}
                        placeholder="Origem"
                      />
                      <input
                        className="rounded-lg border px-3 py-2"
                        value={editCampanha}
                        onChange={(e) => setEditCampanha(e.target.value)}
                        placeholder="Campanha"
                      />
                      <select
                        className="rounded-lg border px-3 py-2"
                        value={editStatusLead}
                        onChange={(e) =>
                          setEditStatusLead(
                            e.target.value as
                              | "novo"
                              | "em_atendimento"
                              | "qualificado"
                              | "cliente"
                              | "perdido"
                          )
                        }
                      >
                        <option value="novo">Novo</option>
                        <option value="em_atendimento">Em atendimento</option>
                        <option value="qualificado">Qualificado</option>
                        <option value="cliente">Cliente</option>
                        <option value="perdido">Perdido</option>
                      </select>

                      <select
                        className="rounded-lg border px-3 py-2"
                        value={editEmpresaId}
                        onChange={(e) => setEditEmpresaId(e.target.value)}
                      >
                        <option value="">Selecione uma empresa</option>
                        {empresas.map((empresa) => (
                          <option key={empresa.id} value={empresa.id}>
                            {empresa.nome_fantasia}
                          </option>
                        ))}
                      </select>

                      <textarea
                        className="rounded-lg border px-3 py-2 md:col-span-2"
                        rows={3}
                        value={editObservacoes}
                        onChange={(e) => setEditObservacoes(e.target.value)}
                        placeholder="Observações"
                      />

                      <div className="md:col-span-2 flex gap-2">
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
                        <h3 className="text-base font-semibold">
                          {contato.nome || "Sem nome"}
                        </h3>
                        <p className="text-sm text-gray-600">{contato.telefone}</p>
                        <p className="text-sm text-gray-600">
                          {contato.email || "Sem email"}
                        </p>
                        <p className="mt-2 text-sm">
                          <strong>Status:</strong> {contato.status_lead}
                        </p>
                        <p className="text-sm">
                          <strong>Origem:</strong> {contato.origem || "—"}
                        </p>
                        <p className="text-sm">
                          <strong>Campanha:</strong> {contato.campanha || "—"}
                        </p>
                      </div>

                      <div>
                        <button
                          onClick={() => iniciarEdicao(contato)}
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