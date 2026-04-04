"use client";

import { useEffect, useState } from "react";

type Plano = {
  id: string;
  nome: string;
  slug: string;
};

type Empresa = {
  id: string;
  nome_fantasia: string;
  razao_social: string | null;
  documento: string | null;
  email: string;
  telefone: string | null;
  nome_responsavel: string | null;
  status: "ativa" | "inativa" | "suspensa" | "cancelada";
  timezone: string;
  logo_url: string | null;
  observacoes: string | null;
  plano_id: string;
  planos?: {
    id: string;
    nome: string;
    slug: string;
  } | null;
};

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);

  const [nomeFantasia, setNomeFantasia] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nomeResponsavel, setNomeResponsavel] = useState("");
  const [planoId, setPlanoId] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [logoUrl, setLogoUrl] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNomeFantasia, setEditNomeFantasia] = useState("");
  const [editRazaoSocial, setEditRazaoSocial] = useState("");
  const [editDocumento, setEditDocumento] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editNomeResponsavel, setEditNomeResponsavel] = useState("");
  const [editPlanoId, setEditPlanoId] = useState("");
  const [editTimezone, setEditTimezone] = useState("America/Sao_Paulo");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [editStatus, setEditStatus] = useState<"ativa" | "inativa" | "suspensa" | "cancelada">("ativa");

  async function carregarEmpresas() {
    setErro("");

    const res = await fetch("/api/empresas");
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar empresas");
      return;
    }

    setEmpresas(data.empresas || []);
  }

  async function carregarPlanos() {
    const res = await fetch("/api/planos");

    if (!res.ok) return;

    const data = await res.json();
    setPlanos(data.planos || []);
  }

  async function criarEmpresa() {
    setMensagem("");
    setErro("");

    if (!nomeFantasia.trim()) {
      setErro("Digite o nome fantasia.");
      return;
    }

    if (!email.trim()) {
      setErro("Digite o email.");
      return;
    }

    if (!planoId) {
      setErro("Selecione um plano.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/empresas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome_fantasia: nomeFantasia,
        razao_social: razaoSocial,
        documento,
        email,
        telefone,
        nome_responsavel: nomeResponsavel,
        plano_id: planoId,
        timezone,
        logo_url: logoUrl,
        observacoes,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao criar empresa");
      setLoading(false);
      return;
    }

    setMensagem(data.message || "Empresa criada com sucesso.");
    setNomeFantasia("");
    setRazaoSocial("");
    setDocumento("");
    setEmail("");
    setTelefone("");
    setNomeResponsavel("");
    setPlanoId("");
    setTimezone("America/Sao_Paulo");
    setLogoUrl("");
    setObservacoes("");
    setLoading(false);
    carregarEmpresas();
  }

  function iniciarEdicao(empresa: Empresa) {
    setEditandoId(empresa.id);
    setEditNomeFantasia(empresa.nome_fantasia);
    setEditRazaoSocial(empresa.razao_social || "");
    setEditDocumento(empresa.documento || "");
    setEditEmail(empresa.email);
    setEditTelefone(empresa.telefone || "");
    setEditNomeResponsavel(empresa.nome_responsavel || "");
    setEditPlanoId(empresa.plano_id);
    setEditTimezone(empresa.timezone || "America/Sao_Paulo");
    setEditLogoUrl(empresa.logo_url || "");
    setEditObservacoes(empresa.observacoes || "");
    setEditStatus(empresa.status);
    setMensagem("");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
  }

  async function salvarEdicao() {
    if (!editandoId) return;

    setMensagem("");
    setErro("");

    const res = await fetch(`/api/empresas/${editandoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome_fantasia: editNomeFantasia,
        razao_social: editRazaoSocial,
        documento: editDocumento,
        email: editEmail,
        telefone: editTelefone,
        nome_responsavel: editNomeResponsavel,
        plano_id: editPlanoId,
        timezone: editTimezone,
        logo_url: editLogoUrl,
        observacoes: editObservacoes,
        status: editStatus,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao atualizar empresa");
      return;
    }

    setMensagem(data.message || "Empresa atualizada com sucesso.");
    setEditandoId(null);
    carregarEmpresas();
  }

  useEffect(() => {
    carregarEmpresas();
    carregarPlanos();
  }, []);

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold">Empresas</h1>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Criar empresa</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <input className="rounded-lg border px-3 py-2" placeholder="Nome fantasia" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} />
            <input className="rounded-lg border px-3 py-2" placeholder="Razão social" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
            <input className="rounded-lg border px-3 py-2" placeholder="Documento" value={documento} onChange={(e) => setDocumento(e.target.value)} />
            <input className="rounded-lg border px-3 py-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="rounded-lg border px-3 py-2" placeholder="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            <input className="rounded-lg border px-3 py-2" placeholder="Nome do responsável" value={nomeResponsavel} onChange={(e) => setNomeResponsavel(e.target.value)} />
            <select className="rounded-lg border px-3 py-2" value={planoId} onChange={(e) => setPlanoId(e.target.value)}>
              <option value="">Selecione um plano</option>
              {planos.map((plano) => (
                <option key={plano.id} value={plano.id}>
                  {plano.nome}
                </option>
              ))}
            </select>
            <input className="rounded-lg border px-3 py-2" placeholder="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            <input className="rounded-lg border px-3 py-2 md:col-span-2" placeholder="URL da logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
            <textarea className="rounded-lg border px-3 py-2 md:col-span-2" placeholder="Observações" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
          </div>

          <button
            onClick={criarEmpresa}
            disabled={loading}
            className="mt-4 rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {loading ? "Criando..." : "Criar empresa"}
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
          <h2 className="mb-4 text-lg font-semibold">Lista de empresas</h2>

          <div className="space-y-4">
            {empresas.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma empresa cadastrada ainda.</p>
            ) : (
              empresas.map((empresa) => (
                <div key={empresa.id} className="rounded-xl border p-4">
                  {editandoId === empresa.id ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <input className="rounded-lg border px-3 py-2" value={editNomeFantasia} onChange={(e) => setEditNomeFantasia(e.target.value)} />
                      <input className="rounded-lg border px-3 py-2" value={editRazaoSocial} onChange={(e) => setEditRazaoSocial(e.target.value)} />
                      <input className="rounded-lg border px-3 py-2" value={editDocumento} onChange={(e) => setEditDocumento(e.target.value)} />
                      <input className="rounded-lg border px-3 py-2" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                      <input className="rounded-lg border px-3 py-2" value={editTelefone} onChange={(e) => setEditTelefone(e.target.value)} />
                      <input className="rounded-lg border px-3 py-2" value={editNomeResponsavel} onChange={(e) => setEditNomeResponsavel(e.target.value)} />
                      <select className="rounded-lg border px-3 py-2" value={editPlanoId} onChange={(e) => setEditPlanoId(e.target.value)}>
                        <option value="">Selecione um plano</option>
                        {planos.map((plano) => (
                          <option key={plano.id} value={plano.id}>
                            {plano.nome}
                          </option>
                        ))}
                      </select>
                      <select className="rounded-lg border px-3 py-2" value={editStatus} onChange={(e) => setEditStatus(e.target.value as any)}>
                        <option value="ativa">Ativa</option>
                        <option value="inativa">Inativa</option>
                        <option value="suspensa">Suspensa</option>
                        <option value="cancelada">Cancelada</option>
                      </select>
                      <input className="rounded-lg border px-3 py-2 md:col-span-2" value={editTimezone} onChange={(e) => setEditTimezone(e.target.value)} />
                      <input className="rounded-lg border px-3 py-2 md:col-span-2" value={editLogoUrl} onChange={(e) => setEditLogoUrl(e.target.value)} />
                      <textarea className="rounded-lg border px-3 py-2 md:col-span-2" rows={3} value={editObservacoes} onChange={(e) => setEditObservacoes(e.target.value)} />

                      <div className="md:col-span-2 flex gap-2">
                        <button onClick={salvarEdicao} className="rounded-lg bg-black px-4 py-2 text-white">
                          Salvar
                        </button>
                        <button onClick={cancelarEdicao} className="rounded-lg border px-4 py-2">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-base font-semibold">{empresa.nome_fantasia}</h3>
                        <p className="text-sm text-gray-600">{empresa.email}</p>
                        <p className="mt-2 text-sm"><strong>Plano:</strong> {empresa.planos?.nome ?? "—"}</p>
                        <p className="text-sm"><strong>Responsável:</strong> {empresa.nome_responsavel ?? "—"}</p>
                        <p className="text-sm"><strong>Status:</strong> {empresa.status}</p>
                      </div>

                      <div>
                        <button
                          onClick={() => iniciarEdicao(empresa)}
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