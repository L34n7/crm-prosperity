"use client";

import { useEffect, useState } from "react";

type EmpresaOpcao = {
  id: string;
  nome_fantasia: string;
};

type ContatoOpcao = {
  id: string;
  nome: string | null;
  telefone: string;
  empresa_id: string;
};

type SetorOpcao = {
  id: string;
  nome: string;
};

type UsuarioOpcao = {
  id: string;
  nome: string;
  email: string;
  empresa_id: string | null;
};

type Conversa = {
  id: string;
  empresa_id: string;
  contato_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  integracao_whatsapp_id: string | null;
  status: "aberta" | "bot" | "fila" | "em_atendimento" | "aguardando_cliente" | "encerrada";
  canal: "whatsapp";
  origem_atendimento: "entrada_cliente" | "bot" | "manual" | "reativacao";
  prioridade: "baixa" | "media" | "alta" | "urgente";
  assunto: string | null;
  created_at: string;
  contatos?: {
    id: string;
    nome: string | null;
    telefone: string;
    email: string | null;
  } | null;
  setores?: {
    id: string;
    nome: string;
  } | null;
  responsavel?: {
    id: string;
    nome: string;
    email: string;
  } | null;
};

export default function ConversasPage() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [contatos, setContatos] = useState<ContatoOpcao[]>([]);
  const [setores, setSetores] = useState<SetorOpcao[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOpcao[]>([]);

  const [empresaId, setEmpresaId] = useState("");
  const [contatoId, setContatoId] = useState("");
  const [setorId, setSetorId] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [status, setStatus] = useState("aberta");
  const [origemAtendimento, setOrigemAtendimento] = useState("manual");
  const [prioridade, setPrioridade] = useState("media");
  const [assunto, setAssunto] = useState("");

  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");

  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editEmpresaId, setEditEmpresaId] = useState("");
  const [editContatoId, setEditContatoId] = useState("");
  const [editSetorId, setEditSetorId] = useState("");
  const [editResponsavelId, setEditResponsavelId] = useState("");
  const [editStatus, setEditStatus] = useState<
    "aberta" | "bot" | "fila" | "em_atendimento" | "aguardando_cliente" | "encerrada"
  >("aberta");
  const [editOrigemAtendimento, setEditOrigemAtendimento] = useState<
    "entrada_cliente" | "bot" | "manual" | "reativacao"
  >("manual");
  const [editPrioridade, setEditPrioridade] = useState<
    "baixa" | "media" | "alta" | "urgente"
  >("media");
  const [editAssunto, setEditAssunto] = useState("");

  async function carregarEmpresas() {
    const res = await fetch("/api/empresas/opcoes");
    const data = await res.json();

    if (!res.ok) return;
    setEmpresas(data.empresas || []);
  }

  async function carregarContatos() {
    const res = await fetch("/api/contatos");
    const data = await res.json();

    if (!res.ok) return;
    setContatos(data.contatos || []);
  }

  async function carregarSetores() {
    const res = await fetch("/api/setores");
    const data = await res.json();

    if (!res.ok) return;
    setSetores(data.setores || []);
  }

  async function carregarUsuarios() {
    const res = await fetch("/api/usuarios");
    const data = await res.json();

    if (!res.ok) return;
    setUsuarios(data.usuarios || []);
  }

  async function carregarConversas() {
    setErro("");

    const params = new URLSearchParams();

    if (filtroStatus) {
      params.set("status", filtroStatus);
    }

    if (filtroPrioridade) {
      params.set("prioridade", filtroPrioridade);
    }

    const queryString = params.toString();
    const url = queryString ? `/api/conversas?${queryString}` : "/api/conversas";

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar conversas");
      return;
    }

    setConversas(data.conversas || []);
  }

  async function criarConversa() {
    setMensagem("");
    setErro("");

    if (!contatoId) {
      setErro("Selecione um contato.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/conversas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        empresa_id: empresaId || null,
        contato_id: contatoId,
        setor_id: setorId || null,
        responsavel_id: responsavelId || null,
        status,
        origem_atendimento: origemAtendimento,
        prioridade,
        assunto,
        canal: "whatsapp",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao criar conversa");
      setLoading(false);
      return;
    }

    setMensagem(data.message || "Conversa criada com sucesso.");
    setEmpresaId("");
    setContatoId("");
    setSetorId("");
    setResponsavelId("");
    setStatus("aberta");
    setOrigemAtendimento("manual");
    setPrioridade("media");
    setAssunto("");
    setLoading(false);
    carregarConversas();
  }

  function iniciarEdicao(conversa: Conversa) {
    setEditandoId(conversa.id);
    setEditEmpresaId(conversa.empresa_id || "");
    setEditContatoId(conversa.contato_id || "");
    setEditSetorId(conversa.setor_id || "");
    setEditResponsavelId(conversa.responsavel_id || "");
    setEditStatus(conversa.status);
    setEditOrigemAtendimento(conversa.origem_atendimento);
    setEditPrioridade(conversa.prioridade);
    setEditAssunto(conversa.assunto || "");
    setMensagem("");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditEmpresaId("");
    setEditContatoId("");
    setEditSetorId("");
    setEditResponsavelId("");
    setEditStatus("aberta");
    setEditOrigemAtendimento("manual");
    setEditPrioridade("media");
    setEditAssunto("");
  }

  async function salvarEdicao() {
    if (!editandoId) return;

    setMensagem("");
    setErro("");

    if (!editContatoId) {
      setErro("Selecione um contato.");
      return;
    }

    const res = await fetch(`/api/conversas/${editandoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        empresa_id: editEmpresaId || null,
        contato_id: editContatoId,
        setor_id: editSetorId || null,
        responsavel_id: editResponsavelId || null,
        status: editStatus,
        origem_atendimento: editOrigemAtendimento,
        prioridade: editPrioridade,
        assunto: editAssunto,
        canal: "whatsapp",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao atualizar conversa");
      return;
    }

    setMensagem(data.message || "Conversa atualizada com sucesso.");
    cancelarEdicao();
    carregarConversas();
  }

  useEffect(() => {
    carregarEmpresas();
    carregarContatos();
    carregarSetores();
    carregarUsuarios();
  }, []);

  useEffect(() => {
    carregarConversas();
  }, [filtroStatus, filtroPrioridade]);

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold">Conversas</h1>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Criar conversa</h2>

          <div className="grid gap-4 md:grid-cols-2">
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

            <div>
              <label className="mb-1 block text-sm font-medium">Contato *</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={contatoId}
                onChange={(e) => setContatoId(e.target.value)}
              >
                <option value="">Selecione um contato</option>
                {contatos.map((contato) => (
                  <option key={contato.id} value={contato.id}>
                    {(contato.nome || "Sem nome") + " - " + contato.telefone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Setor</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={setorId}
                onChange={(e) => setSetorId(e.target.value)}
              >
                <option value="">Sem setor</option>
                {setores.map((setor) => (
                  <option key={setor.id} value={setor.id}>
                    {setor.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Responsável</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={responsavelId}
                onChange={(e) => setResponsavelId(e.target.value)}
              >
                <option value="">Sem responsável</option>
                {usuarios.map((usuario) => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.nome} - {usuario.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Status</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="aberta">Aberta</option>
                <option value="bot">Bot</option>
                <option value="fila">Fila</option>
                <option value="em_atendimento">Em atendimento</option>
                <option value="aguardando_cliente">Aguardando cliente</option>
                <option value="encerrada">Encerrada</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Origem</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={origemAtendimento}
                onChange={(e) => setOrigemAtendimento(e.target.value)}
              >
                <option value="manual">Manual</option>
                <option value="entrada_cliente">Entrada do cliente</option>
                <option value="bot">Bot</option>
                <option value="reativacao">Reativação</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Prioridade</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value)}
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Assunto</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                placeholder="Assunto da conversa"
              />
            </div>
          </div>

          <button
            onClick={criarConversa}
            disabled={loading}
            className="mt-4 rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {loading ? "Criando..." : "Criar conversa"}
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
              <label className="mb-1 block text-sm font-medium">Status</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="aberta">Aberta</option>
                <option value="bot">Bot</option>
                <option value="fila">Fila</option>
                <option value="em_atendimento">Em atendimento</option>
                <option value="aguardando_cliente">Aguardando cliente</option>
                <option value="encerrada">Encerrada</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Prioridade</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={filtroPrioridade}
                onChange={(e) => setFiltroPrioridade(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>

          <button
            onClick={carregarConversas}
            className="mt-4 rounded-lg border px-4 py-2"
          >
            Buscar
          </button>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Lista de conversas</h2>

          <div className="space-y-4">
            {conversas.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma conversa cadastrada ainda.</p>
            ) : (
              conversas.map((conversa) => (
                <div key={conversa.id} className="rounded-xl border p-4">
                  {editandoId === conversa.id ? (
                    <div className="grid gap-4 md:grid-cols-2">
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

                      <select
                        className="rounded-lg border px-3 py-2"
                        value={editContatoId}
                        onChange={(e) => setEditContatoId(e.target.value)}
                      >
                        <option value="">Selecione um contato</option>
                        {contatos.map((contato) => (
                          <option key={contato.id} value={contato.id}>
                            {(contato.nome || "Sem nome") + " - " + contato.telefone}
                          </option>
                        ))}
                      </select>

                      <select
                        className="rounded-lg border px-3 py-2"
                        value={editSetorId}
                        onChange={(e) => setEditSetorId(e.target.value)}
                      >
                        <option value="">Sem setor</option>
                        {setores.map((setor) => (
                          <option key={setor.id} value={setor.id}>
                            {setor.nome}
                          </option>
                        ))}
                      </select>

                      <select
                        className="rounded-lg border px-3 py-2"
                        value={editResponsavelId}
                        onChange={(e) => setEditResponsavelId(e.target.value)}
                      >
                        <option value="">Sem responsável</option>
                        {usuarios.map((usuario) => (
                          <option key={usuario.id} value={usuario.id}>
                            {usuario.nome} - {usuario.email}
                          </option>
                        ))}
                      </select>

                      <select
                        className="rounded-lg border px-3 py-2"
                        value={editStatus}
                        onChange={(e) =>
                          setEditStatus(
                            e.target.value as
                              | "aberta"
                              | "bot"
                              | "fila"
                              | "em_atendimento"
                              | "aguardando_cliente"
                              | "encerrada"
                          )
                        }
                      >
                        <option value="aberta">Aberta</option>
                        <option value="bot">Bot</option>
                        <option value="fila">Fila</option>
                        <option value="em_atendimento">Em atendimento</option>
                        <option value="aguardando_cliente">Aguardando cliente</option>
                        <option value="encerrada">Encerrada</option>
                      </select>

                      <select
                        className="rounded-lg border px-3 py-2"
                        value={editOrigemAtendimento}
                        onChange={(e) =>
                          setEditOrigemAtendimento(
                            e.target.value as
                              | "entrada_cliente"
                              | "bot"
                              | "manual"
                              | "reativacao"
                          )
                        }
                      >
                        <option value="manual">Manual</option>
                        <option value="entrada_cliente">Entrada do cliente</option>
                        <option value="bot">Bot</option>
                        <option value="reativacao">Reativação</option>
                      </select>

                      <select
                        className="rounded-lg border px-3 py-2"
                        value={editPrioridade}
                        onChange={(e) =>
                          setEditPrioridade(
                            e.target.value as "baixa" | "media" | "alta" | "urgente"
                          )
                        }
                      >
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                        <option value="urgente">Urgente</option>
                      </select>

                      <input
                        className="rounded-lg border px-3 py-2 md:col-span-2"
                        value={editAssunto}
                        onChange={(e) => setEditAssunto(e.target.value)}
                        placeholder="Assunto"
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
                          {conversa.assunto || "Sem assunto"}
                        </h3>
                        <p className="text-sm text-gray-600">
                          <strong>Contato:</strong>{" "}
                          {conversa.contatos?.nome || "Sem nome"} -{" "}
                          {conversa.contatos?.telefone || "—"}
                        </p>
                        <p className="text-sm">
                          <strong>Status:</strong> {conversa.status}
                        </p>
                        <p className="text-sm">
                          <strong>Prioridade:</strong> {conversa.prioridade}
                        </p>
                        <p className="text-sm">
                          <strong>Setor:</strong> {conversa.setores?.nome || "—"}
                        </p>
                        <p className="text-sm">
                          <strong>Responsável:</strong>{" "}
                          {conversa.responsavel?.nome || "—"}
                        </p>
                      </div>

                      <div>
                        <button
                          onClick={() => iniciarEdicao(conversa)}
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