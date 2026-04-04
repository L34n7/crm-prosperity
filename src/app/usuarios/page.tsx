"use client";

import { useEffect, useState } from "react";

type Setor = {
  id: string;
  nome: string;
};

type Usuario = {
  id: string;
  auth_user_id: string | null;
  nome: string;
  email: string;
  perfil: "super_admin" | "admin_empresa" | "supervisor" | "atendente";
  nivel: "basico" | "avancado" | null;
  status: "ativo" | "inativo" | "bloqueado";
  telefone: string | null;
  empresa_id: string | null;
  setor_id: string | null;
  setores?: {
    id: string;
    nome: string;
  } | null;
};

type EmpresaOpcao = {
  id: string;
  nome_fantasia: string;
};

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState("atendente");
  const [nivel, setNivel] = useState("basico");
  const [setorId, setSetorId] = useState("");
  const [telefone, setTelefone] = useState("");

  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editPerfil, setEditPerfil] = useState("atendente");
  const [editNivel, setEditNivel] = useState("basico");
  const [editSetorId, setEditSetorId] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editStatus, setEditStatus] = useState("ativo");

  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [editEmpresaId, setEditEmpresaId] = useState("");

  async function carregarUsuarios() {
    setErro("");

    const res = await fetch("/api/usuarios");
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar usuários");
      return;
    }

    setUsuarios(data.usuarios || []);
  }

  async function carregarSetores() {
    const res = await fetch("/api/setores");
    const data = await res.json();

    if (!res.ok) return;

    setSetores(data.setores || []);
  }

  async function criarUsuario() {
    setMensagem("");
    setErro("");

    if (!nome.trim()) {
      setErro("Digite o nome do usuário.");
      return;
    }

    if (!email.trim()) {
      setErro("Digite o email do usuário.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome,
        email,
        perfil,
        nivel: perfil === "atendente" ? nivel : null,
        setor_id: setorId || null,
        telefone,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao convidar usuário");
      setLoading(false);
      return;
    }

    setMensagem(data.message || "Usuário convidado com sucesso.");
    setNome("");
    setEmail("");
    setPerfil("atendente");
    setNivel("basico");
    setSetorId("");
    setTelefone("");
    setLoading(false);
    carregarUsuarios();
  }

  function iniciarEdicao(usuario: Usuario) {
    setEditandoId(usuario.id);
    setEditNome(usuario.nome);
    setEditPerfil(usuario.perfil);
    setEditNivel(usuario.nivel || "basico");
    setEditSetorId(usuario.setor_id || "");
    setEditTelefone(usuario.telefone || "");
    setEditStatus(usuario.status);
    setEditEmpresaId(usuario.empresa_id || "");
    setMensagem("");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditNome("");
    setEditPerfil("atendente");
    setEditNivel("basico");
    setEditSetorId("");
    setEditTelefone("");
    setEditStatus("ativo");
    setEditEmpresaId("");
  }

  async function salvarEdicao() {
    if (!editandoId) return;

    setMensagem("");
    setErro("");

    if (!editNome.trim()) {
      setErro("Digite o nome do usuário.");
      return;
    }

    const res = await fetch(`/api/usuarios/${editandoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: editNome,
        perfil: editPerfil,
        nivel: editPerfil === "atendente" ? editNivel : null,
        setor_id: editSetorId || null,
        telefone: editTelefone,
        status: editStatus,
        empresa_id: editEmpresaId || null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao atualizar usuário");
      return;
    }

    setMensagem(data.message || "Usuário atualizado com sucesso.");
    cancelarEdicao();
    carregarUsuarios();
  }

  async function alternarStatus(usuario: Usuario) {
    setMensagem("");
    setErro("");

    const novoStatus = usuario.status === "ativo" ? "inativo" : "ativo";

    const res = await fetch(`/api/usuarios/${usuario.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: usuario.nome,
        perfil: usuario.perfil,
        nivel: usuario.nivel,
        setor_id: usuario.setor_id,
        telefone: usuario.telefone,
        status: novoStatus,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao alterar status");
      return;
    }

    setMensagem(
      `Usuário ${novoStatus === "ativo" ? "ativado" : "inativado"} com sucesso.`
    );
    carregarUsuarios();
  }

  async function carregarEmpresas() {
    const res = await fetch("/api/empresas/opcoes");
    const data = await res.json();

    if (!res.ok) return;

    setEmpresas(data.empresas || []);
  }

  useEffect(() => {
    carregarUsuarios();
    carregarSetores();
    carregarEmpresas();
  }, []);

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-bold">Usuários</h1>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Convidar novo usuário</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Nome</label>
              <input
                type="text"
                className="w-full rounded-lg border px-3 py-2"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input
                type="email"
                className="w-full rounded-lg border px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@empresa.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Perfil</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={perfil}
                onChange={(e) => setPerfil(e.target.value)}
              >
                <option value="admin_empresa">Admin da empresa</option>
                <option value="supervisor">Supervisor</option>
                <option value="atendente">Atendente</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Nível</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={nivel}
                onChange={(e) => setNivel(e.target.value)}
                disabled={perfil !== "atendente"}
              >
                <option value="basico">Básico</option>
                <option value="avancado">Avançado</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Empresa</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={empresaId}
                onChange={(e) => setEmpresaId(e.target.value)}
              >
                <option value="">Selecione uma empresa</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nome_fantasia}
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
              <label className="mb-1 block text-sm font-medium">Telefone</label>
              <input
                type="text"
                className="w-full rounded-lg border px-3 py-2"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="31999999999"
              />
            </div>
          </div>

          <button
            onClick={criarUsuario}
            disabled={loading}
            className="mt-4 rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {loading ? "Enviando convite..." : "Convidar usuário"}
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
          <h2 className="mb-4 text-lg font-semibold">Lista de usuários</h2>

          <div className="space-y-4">
            {usuarios.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum usuário cadastrado ainda.</p>
            ) : (
              usuarios.map((usuario) => (
                <div key={usuario.id} className="rounded-xl border p-4">
                  {editandoId === usuario.id ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium">Nome</label>
                        <input
                          type="text"
                          className="w-full rounded-lg border px-3 py-2"
                          value={editNome}
                          onChange={(e) => setEditNome(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">Perfil</label>
                        <select
                          className="w-full rounded-lg border px-3 py-2"
                          value={editPerfil}
                          onChange={(e) => setEditPerfil(e.target.value)}
                        >
                          <option value="admin_empresa">Admin da empresa</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="atendente">Atendente</option>
                          <option value="super_admin">Super admin</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">Nível</label>
                        <select
                          className="w-full rounded-lg border px-3 py-2"
                          value={editNivel}
                          onChange={(e) => setEditNivel(e.target.value)}
                          disabled={editPerfil !== "atendente"}
                        >
                          <option value="basico">Básico</option>
                          <option value="avancado">Avançado</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">Empresa</label>
                        <select
                          className="w-full rounded-lg border px-3 py-2"
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
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">Setor</label>
                        <select
                          className="w-full rounded-lg border px-3 py-2"
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
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">Telefone</label>
                        <input
                          type="text"
                          className="w-full rounded-lg border px-3 py-2"
                          value={editTelefone}
                          onChange={(e) => setEditTelefone(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium">Status</label>
                        <select
                          className="w-full rounded-lg border px-3 py-2"
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                        >
                          <option value="ativo">Ativo</option>
                          <option value="inativo">Inativo</option>
                          <option value="bloqueado">Bloqueado</option>
                        </select>
                      </div>

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
                        <h3 className="text-base font-semibold">{usuario.nome}</h3>
                        <p className="text-sm text-gray-600">{usuario.email}</p>
                        <p className="mt-2 text-sm">
                          <strong>Perfil:</strong> {usuario.perfil}
                        </p>
                        <p className="text-sm">
                          <strong>Nível:</strong> {usuario.nivel ?? "—"}
                        </p>
                        <p className="text-sm">
                          <strong>Empresa:</strong>{" "}
                          {empresas.find((empresa) => empresa.id === usuario.empresa_id)?.nome_fantasia ?? "—"}
                        </p>
                        <p className="text-sm">
                          <strong>Setor:</strong> {usuario.setores?.nome ?? "Sem setor"}
                        </p>
                        <p className="text-sm">
                          <strong>Status:</strong> {usuario.status}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => iniciarEdicao(usuario)}
                          className="rounded-lg border px-3 py-2 text-sm"
                        >
                          Editar
                        </button>

                        <button
                          onClick={() => alternarStatus(usuario)}
                          className="rounded-lg border px-3 py-2 text-sm"
                        >
                          {usuario.status === "ativo" ? "Inativar" : "Ativar"}
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