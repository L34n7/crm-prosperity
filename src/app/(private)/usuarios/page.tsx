"use client";

import { useEffect, useMemo, useState } from "react";
import { can } from "@/lib/permissoes/frontend";
import CrmShell from "@/components/CrmShell";
import Header from "@/components/Header";
import styles from "./usuarios.module.css";

type Setor = {
  id: string;
  nome: string;
};

type UsuarioSetorVinculo = {
  id?: string;
  usuario_id: string;
  setor_id: string;
  is_principal?: boolean;
  created_at?: string;
};

type PerfilDinamico = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
};

type Usuario = {
  id: string;
  auth_user_id: string | null;
  nome: string;
  email: string;
  perfil?: never;
  nivel: "basico" | "avancado" | null;
  status: "ativo" | "inativo" | "bloqueado";
  telefone: string | null;
  empresa_id: string | null;
  setor_ids?: string[];
  setor_principal_id?: string | null;
  usuarios_setores?: UsuarioSetorVinculo[];
  perfis_dinamicos?: PerfilDinamico[];
  permissoes?: string[];
};

type EmpresaOpcao = {
  id: string;
  nome_fantasia: string;
};

type UsuarioLogado = {
  id: string;
  empresa_id?: string | null;
  permissoes?: string[];
  perfis_dinamicos?: PerfilDinamico[];
};

function normalizarSetoresUsuario(usuario: Usuario) {
  const idsDiretos = Array.isArray(usuario.setor_ids) ? usuario.setor_ids : [];
  const idsVinculos = Array.isArray(usuario.usuarios_setores)
    ? usuario.usuarios_setores.map((item) => item.setor_id)
    : [];

  return Array.from(new Set([...idsDiretos, ...idsVinculos].filter(Boolean)));
}

function getPerfilPrincipal(usuario: Usuario) {
  if (
    Array.isArray(usuario.perfis_dinamicos) &&
    usuario.perfis_dinamicos.length > 0
  ) {
    return usuario.perfis_dinamicos[0] || null;
  }

  return null;
}

function getNomesPerfisDinamicos(usuario: Usuario) {
  if (
    !Array.isArray(usuario.perfis_dinamicos) ||
    usuario.perfis_dinamicos.length === 0
  ) {
    return [];
  }

  return usuario.perfis_dinamicos.map((perfil) => perfil.nome);
}

function getStatusLabel(status: Usuario["status"]) {
  switch (status) {
    case "ativo":
      return "Ativo";
    case "inativo":
      return "Inativo";
    case "bloqueado":
      return "Bloqueado";
    default:
      return status;
  }
}

function getStatusClass(status: Usuario["status"]) {
  switch (status) {
    case "ativo":
      return styles.statusAtivo;
    case "inativo":
      return styles.statusInativo;
    case "bloqueado":
      return styles.statusBloqueado;
    default:
      return styles.statusPadrao;
  }
}

function getIniciais(nome: string) {
  const partes = nome.trim().split(" ").filter(Boolean);

  if (partes.length === 0) return "US";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

export default function UsuariosPage() {
  const [usuarioLogado, setUsuarioLogado] = useState<UsuarioLogado | null>(null);

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [perfisEmpresa, setPerfisEmpresa] = useState<PerfilDinamico[]>([]);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [perfilEmpresaId, setPerfilEmpresaId] = useState("");
  const [nivel, setNivel] = useState("basico");
  const [setorIds, setSetorIds] = useState<string[]>([]);
  const [setorPrincipalId, setSetorPrincipalId] = useState("");
  const [telefone, setTelefone] = useState("");

  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  const [editNome, setEditNome] = useState("");
  const [editPerfilEmpresaId, setEditPerfilEmpresaId] = useState("");
  const [editNivel, setEditNivel] = useState("basico");
  const [editSetorIds, setEditSetorIds] = useState<string[]>([]);
  const [editSetorPrincipalId, setEditSetorPrincipalId] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editStatus, setEditStatus] = useState("ativo");

  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [editEmpresaId, setEditEmpresaId] = useState("");

  async function carregarUsuarioLogado() {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao carregar usuário logado");
        return;
      }

      setUsuarioLogado(data.usuario || null);
    } catch {
      setErro("Erro ao carregar usuário logado");
    }
  }

  async function carregarUsuarios() {
    setErro("");

    const res = await fetch("/api/usuarios", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar usuários");
      return;
    }

    setUsuarios(data.usuarios || []);
  }

  async function carregarSetores() {
    const res = await fetch("/api/setores", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) return;

    setSetores(data.setores || []);
  }

  async function carregarPerfis() {
    const res = await fetch("/api/perfis", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) return;

    const perfis = data.perfis || [];
    setPerfisEmpresa(perfis);

    if (perfis.length > 0) {
      const perfilAtendente = perfis.find(
        (perfilItem: PerfilDinamico) => perfilItem.nome === "Atendente"
      );

      const perfilInicial = perfilAtendente || perfis[0];

      if (perfilInicial) {
        setPerfilEmpresaId(perfilInicial.id);
        setEditPerfilEmpresaId(perfilInicial.id);
      }
    }
  }

  async function carregarEmpresas() {
    const res = await fetch("/api/empresas/opcoes", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) return;

    setEmpresas(data.empresas || []);
  }

  function toggleSetorCriacao(setorId: string) {
    setSetorIds((atual) => {
      const existe = atual.includes(setorId);
      const novaLista = existe
        ? atual.filter((id) => id !== setorId)
        : [...atual, setorId];

      if (!novaLista.includes(setorPrincipalId)) {
        setSetorPrincipalId(novaLista[0] || "");
      }

      return novaLista;
    });
  }

  function toggleSetorEdicao(setorId: string) {
    setEditSetorIds((atual) => {
      const existe = atual.includes(setorId);
      const novaLista = existe
        ? atual.filter((id) => id !== setorId)
        : [...atual, setorId];

      if (!novaLista.includes(editSetorPrincipalId)) {
        setEditSetorPrincipalId(novaLista[0] || "");
      }

      return novaLista;
    });
  }

  function perfilSelecionadoCriacao() {
    return perfisEmpresa.find((item) => item.id === perfilEmpresaId) || null;
  }

  function perfilSelecionadoEdicao() {
    return perfisEmpresa.find((item) => item.id === editPerfilEmpresaId) || null;
  }

  function perfilCriacaoEhAdministrativo() {
    const perfil = perfilSelecionadoCriacao();
    if (!perfil) return false;
    return perfil.nome === "Administrador";
  }

  function perfilEdicaoEhAdministrativo() {
    const perfil = perfilSelecionadoEdicao();
    if (!perfil) return false;
    return perfil.nome === "Administrador";
  }

  function perfilCriacaoEhAtendente() {
    const perfil = perfilSelecionadoCriacao();
    if (!perfil) return false;
    return perfil.nome === "Atendente";
  }

  function perfilEdicaoEhAtendente() {
    const perfil = perfilSelecionadoEdicao();
    if (!perfil) return false;
    return perfil.nome === "Atendente";
  }

  async function criarUsuario() {
    setMensagem("");
    setErro("");

    if (!podeCriarUsuarios) {
      setErro("Você não tem permissão para criar usuários.");
      return;
    }

    if (!nome.trim()) {
      setErro("Digite o nome do usuário.");
      return;
    }

    if (!email.trim()) {
      setErro("Digite o email do usuário.");
      return;
    }

    if (!perfilEmpresaId) {
      setErro("Selecione um perfil dinâmico.");
      return;
    }

    if (setorIds.length === 0 && !perfilCriacaoEhAdministrativo()) {
      setErro("Selecione pelo menos um setor para esse usuário.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nome,
          email,
          perfil_empresa_id: perfilEmpresaId,
          nivel: perfilCriacaoEhAtendente() ? nivel : null,
          setor_ids: setorIds,
          setor_principal_id: setorPrincipalId || setorIds[0] || null,
          telefone,
          empresa_id: empresaId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao convidar usuário");
        return;
      }

      setMensagem(data.message || "Usuário convidado com sucesso.");
      setNome("");
      setEmail("");
      setNivel("basico");
      setSetorIds([]);
      setSetorPrincipalId("");
      setTelefone("");
      setEmpresaId("");

      const perfilAtendente = perfisEmpresa.find(
        (item) => item.nome === "Atendente"
      );
      setPerfilEmpresaId(perfilAtendente?.id || perfisEmpresa[0]?.id || "");

      await carregarUsuarios();
    } catch {
      setErro("Erro ao convidar usuário");
    } finally {
      setLoading(false);
    }
  }

  function iniciarEdicao(usuario: Usuario) {
    if (!podeEditarUsuarios) {
      setErro("Você não tem permissão para editar usuários.");
      return;
    }

    const setoresDoUsuario = normalizarSetoresUsuario(usuario);
    const perfilPrincipal = getPerfilPrincipal(usuario);

    setEditandoId(usuario.id);
    setExpandidoId(usuario.id);
    setEditNome(usuario.nome);
    setEditPerfilEmpresaId(perfilPrincipal?.id || "");
    setEditNivel(usuario.nivel || "basico");
    setEditSetorIds(setoresDoUsuario);
    setEditSetorPrincipalId(usuario.setor_principal_id || setoresDoUsuario[0] || "");
    setEditTelefone(usuario.telefone || "");
    setEditStatus(usuario.status);
    setEditEmpresaId(usuario.empresa_id || "");
    setMensagem("");
    setErro("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditNome("");
    setEditPerfilEmpresaId("");
    setEditNivel("basico");
    setEditSetorIds([]);
    setEditSetorPrincipalId("");
    setEditTelefone("");
    setEditStatus("ativo");
    setEditEmpresaId("");
  }

  async function salvarEdicao() {
    if (!editandoId) return;

    setMensagem("");
    setErro("");

    if (!podeEditarUsuarios) {
      setErro("Você não tem permissão para editar usuários.");
      return;
    }

    if (!editNome.trim()) {
      setErro("Digite o nome do usuário.");
      return;
    }

    if (!editPerfilEmpresaId) {
      setErro("Selecione um perfil dinâmico.");
      return;
    }

    if (editSetorIds.length === 0 && !perfilEdicaoEhAdministrativo()) {
      setErro("Selecione pelo menos um setor para esse usuário.");
      return;
    }

    const res = await fetch(`/api/usuarios/${editandoId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: editNome,
        perfil_empresa_id: editPerfilEmpresaId,
        nivel: perfilEdicaoEhAtendente() ? editNivel : null,
        setor_ids: editSetorIds,
        setor_principal_id: editSetorPrincipalId || editSetorIds[0] || null,
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

    if (!podeEditarUsuarios) {
      setErro("Você não tem permissão para alterar status de usuários.");
      return;
    }

    const novoStatus = usuario.status === "ativo" ? "inativo" : "ativo";
    const setoresDoUsuario = normalizarSetoresUsuario(usuario);
    const setorPrincipal = usuario.setor_principal_id || setoresDoUsuario[0] || null;
    const perfilPrincipal = getPerfilPrincipal(usuario);

    if (!perfilPrincipal?.id) {
      setErro("Esse usuário não possui perfil dinâmico vinculado.");
      return;
    }

    const res = await fetch(`/api/usuarios/${usuario.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome: usuario.nome,
        perfil_empresa_id: perfilPrincipal.id,
        nivel: usuario.nivel,
        setor_ids: setoresDoUsuario,
        setor_principal_id: setorPrincipal,
        telefone: usuario.telefone,
        status: novoStatus,
        empresa_id: usuario.empresa_id,
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

  function toggleExpandir(usuarioId: string) {
    setExpandidoId((atual) => (atual === usuarioId ? null : usuarioId));
  }

  const permissoes = usuarioLogado?.permissoes || [];

  const podeVisualizarUsuarios = can(permissoes, "usuarios.visualizar");
  const podeCriarUsuarios = can(permissoes, "usuarios.criar");
  const podeEditarUsuarios = can(permissoes, "usuarios.editar");

  const setoresSelecionadosCriacao = useMemo(
    () => setores.filter((setor) => setorIds.includes(setor.id)),
    [setores, setorIds]
  );

  const setoresSelecionadosEdicao = useMemo(
    () => setores.filter((setor) => editSetorIds.includes(setor.id)),
    [setores, editSetorIds]
  );

  useEffect(() => {
    carregarUsuarioLogado();
    carregarUsuarios();
    carregarSetores();
    carregarPerfis();
    carregarEmpresas();
  }, []);

  useEffect(() => {
    if (perfilCriacaoEhAdministrativo()) {
      setSetorIds([]);
      setSetorPrincipalId("");
    }
  }, [perfilEmpresaId]);

  useEffect(() => {
    if (perfilEdicaoEhAdministrativo()) {
      setEditSetorIds([]);
      setEditSetorPrincipalId("");
    }
  }, [editPerfilEmpresaId]);

  if (usuarioLogado && !podeVisualizarUsuarios) {
    return (
      <CrmShell>
        <Header
          title="Usuários"
          subtitle="Gerencie usuários, vínculos, perfis dinâmicos e setores."
        />

        <div className={styles.pageContent}>
          <div className={styles.alertError}>
            Você não tem permissão para visualizar usuários.
          </div>
        </div>
      </CrmShell>
    );
  }

  return (
    <CrmShell>
      <Header
        title="Usuários"
        subtitle="Gerencie usuários, vínculos, perfis dinâmicos e setores."
      />

      <div className={styles.pageContent}>
        {podeCriarUsuarios && (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.eyebrow}>Cadastro</p>
                <h2 className={styles.cardTitle}>Convidar novo usuário</h2>
                <p className={styles.cardDescription}>
                  Crie usuários com perfil dinâmico, nível, empresa e setores.
                </p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label}>Nome</label>
                <input
                  type="text"
                  className={styles.input}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome completo"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@empresa.com"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Perfil dinâmico</label>
                <select
                  className={styles.select}
                  value={perfilEmpresaId}
                  onChange={(e) => setPerfilEmpresaId(e.target.value)}
                >
                  <option value="">Selecione um perfil</option>
                  {perfisEmpresa.map((perfilItem) => (
                    <option key={perfilItem.id} value={perfilItem.id}>
                      {perfilItem.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Nível</label>
                <select
                  className={styles.select}
                  value={nivel}
                  onChange={(e) => setNivel(e.target.value)}
                  disabled={!perfilCriacaoEhAtendente()}
                >
                  <option value="basico">Básico</option>
                  <option value="avancado">Avançado</option>
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Empresa</label>
                <select
                  className={styles.select}
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

              <div className={styles.field}>
                <label className={styles.label}>Telefone</label>
                <input
                  type="text"
                  className={styles.input}
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="31999999999"
                />
              </div>
            </div>

            {!perfilCriacaoEhAdministrativo() && (
              <div className={styles.subCard}>
                <div className={styles.subCardHeader}>
                  <h3 className={styles.subCardTitle}>Setores do usuário</h3>
                  <p className={styles.subCardText}>
                    Selecione os setores vinculados e defina o principal.
                  </p>
                </div>

                <div className={styles.checkboxGrid}>
                  {setores.map((setor) => {
                    const marcado = setorIds.includes(setor.id);

                    return (
                      <label key={setor.id} className={styles.checkboxCard}>
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => toggleSetorCriacao(setor.id)}
                        />
                        <span>{setor.nome}</span>
                      </label>
                    );
                  })}
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Setor principal</label>
                  <select
                    className={styles.select}
                    value={setorPrincipalId}
                    onChange={(e) => setSetorPrincipalId(e.target.value)}
                    disabled={setoresSelecionadosCriacao.length === 0}
                  >
                    <option value="">Selecione o setor principal</option>
                    {setoresSelecionadosCriacao.map((setor) => (
                      <option key={setor.id} value={setor.id}>
                        {setor.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className={styles.actionsRow}>
              <button
                onClick={criarUsuario}
                disabled={loading}
                className={styles.primaryButton}
              >
                {loading ? "Enviando convite..." : "Convidar usuário"}
              </button>
            </div>
          </section>
        )}

        {mensagem && <div className={styles.alertSuccess}>{mensagem}</div>}
        {erro && <div className={styles.alertError}>{erro}</div>}

        <section className={styles.card}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Gestão</p>
              <h2 className={styles.cardTitle}>Usuários cadastrados</h2>
              <p className={styles.cardDescription}>
                Cards compactos com visual mais limpo e expansão sob demanda.
              </p>
            </div>

            <span className={styles.infoBadge}>Sem exibir perfil legado</span>
          </div>

          {usuarios.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhum usuário cadastrado ainda.
            </div>
          ) : (
            <div className={styles.userList}>
              {usuarios.map((usuario) => {
                const setoresDoUsuario = normalizarSetoresUsuario(usuario);
                const nomesSetores = setores
                  .filter((setor) => setoresDoUsuario.includes(setor.id))
                  .map((setor) => setor.nome);

                const perfisDinamicos = getNomesPerfisDinamicos(usuario);
                const perfilPrincipal = getPerfilPrincipal(usuario);
                const empresaNome =
                  empresas.find((empresa) => empresa.id === usuario.empresa_id)
                    ?.nome_fantasia ?? "—";
                const setorPrincipalNome =
                  setores.find((setor) => setor.id === usuario.setor_principal_id)
                    ?.nome ?? "Sem setor";
                const expandido = expandidoId === usuario.id;
                const editando = editandoId === usuario.id;

                return (
                  <article key={usuario.id} className={styles.userCard}>
                    <div className={styles.userSummary}>
                      <div className={styles.userLeft}>
                        <div className={styles.avatar}>
                          {getIniciais(usuario.nome)}
                        </div>

                        <div className={styles.userIdentity}>
                          <div className={styles.userNameRow}>
                            <h3 className={styles.userName}>{usuario.nome}</h3>
                            <span
                              className={`${styles.statusBadge} ${getStatusClass(
                                usuario.status
                              )}`}
                            >
                              {getStatusLabel(usuario.status)}
                            </span>
                          </div>

                          <p className={styles.userEmail}>{usuario.email}</p>

                          <div className={styles.summaryMeta}>
                            <span className={styles.metaItem}>
                              <strong>Perfil:</strong>{" "}
                              {perfilPrincipal?.nome || "Sem perfil"}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Empresa:</strong> {empresaNome}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Setor principal:</strong> {setorPrincipalNome}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.userRight}>
                        {podeEditarUsuarios && !editando && (
                          <button
                            onClick={() => iniciarEdicao(usuario)}
                            className={styles.secondaryButton}
                          >
                            Editar
                          </button>
                        )}

                        {!editando && (
                          <button
                            onClick={() => toggleExpandir(usuario.id)}
                            className={styles.expandButton}
                          >
                            {expandido ? "Recolher" : "Expandir"}
                          </button>
                        )}
                      </div>
                    </div>

                    {(expandido || editando) && (
                      <div className={styles.userExpanded}>
                        {editando ? (
                          <div className={styles.editGrid}>
                            <div className={styles.field}>
                              <label className={styles.label}>Nome</label>
                              <input
                                type="text"
                                className={styles.input}
                                value={editNome}
                                onChange={(e) => setEditNome(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Perfil dinâmico</label>
                              <select
                                className={styles.select}
                                value={editPerfilEmpresaId}
                                onChange={(e) => setEditPerfilEmpresaId(e.target.value)}
                              >
                                <option value="">Selecione um perfil</option>
                                {perfisEmpresa.map((perfilItem) => (
                                  <option key={perfilItem.id} value={perfilItem.id}>
                                    {perfilItem.nome}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Nível</label>
                              <select
                                className={styles.select}
                                value={editNivel}
                                onChange={(e) => setEditNivel(e.target.value)}
                                disabled={!perfilEdicaoEhAtendente()}
                              >
                                <option value="basico">Básico</option>
                                <option value="avancado">Avançado</option>
                              </select>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Empresa</label>
                              <select
                                className={styles.select}
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

                            <div className={styles.field}>
                              <label className={styles.label}>Telefone</label>
                              <input
                                type="text"
                                className={styles.input}
                                value={editTelefone}
                                onChange={(e) => setEditTelefone(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Status</label>
                              <select
                                className={styles.select}
                                value={editStatus}
                                onChange={(e) => setEditStatus(e.target.value)}
                              >
                                <option value="ativo">Ativo</option>
                                <option value="inativo">Inativo</option>
                                <option value="bloqueado">Bloqueado</option>
                              </select>
                            </div>

                            {!perfilEdicaoEhAdministrativo() && (
                              <div className={styles.editFullWidth}>
                                <div className={styles.subCard}>
                                  <div className={styles.subCardHeader}>
                                    <h3 className={styles.subCardTitle}>
                                      Setores do usuário
                                    </h3>
                                    <p className={styles.subCardText}>
                                      Atualize os setores vinculados e o setor principal.
                                    </p>
                                  </div>

                                  <div className={styles.checkboxGrid}>
                                    {setores.map((setor) => {
                                      const marcado = editSetorIds.includes(setor.id);

                                      return (
                                        <label
                                          key={setor.id}
                                          className={styles.checkboxCard}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={marcado}
                                            onChange={() =>
                                              toggleSetorEdicao(setor.id)
                                            }
                                          />
                                          <span>{setor.nome}</span>
                                        </label>
                                      );
                                    })}
                                  </div>

                                  <div className={styles.field}>
                                    <label className={styles.label}>
                                      Setor principal
                                    </label>
                                    <select
                                      className={styles.select}
                                      value={editSetorPrincipalId}
                                      onChange={(e) =>
                                        setEditSetorPrincipalId(e.target.value)
                                      }
                                      disabled={setoresSelecionadosEdicao.length === 0}
                                    >
                                      <option value="">
                                        Selecione o setor principal
                                      </option>
                                      {setoresSelecionadosEdicao.map((setor) => (
                                        <option key={setor.id} value={setor.id}>
                                          {setor.nome}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className={styles.editActions}>
                              <button
                                onClick={salvarEdicao}
                                className={styles.primaryButton}
                              >
                                Salvar
                              </button>

                              <button
                                onClick={cancelarEdicao}
                                className={styles.secondaryButton}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.detailsGrid}>
                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Perfis dinâmicos</span>
                              <span className={styles.infoValue}>
                                {perfisDinamicos.length > 0
                                  ? perfisDinamicos.join(", ")
                                  : "Sem perfil"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Nível</span>
                              <span className={styles.infoValue}>
                                {usuario.nivel ?? "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Telefone</span>
                              <span className={styles.infoValue}>
                                {usuario.telefone || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Todos os setores</span>
                              <span className={styles.infoValue}>
                                {nomesSetores.length > 0
                                  ? nomesSetores.join(", ")
                                  : "Sem setor"}
                              </span>
                            </div>
                          </div>
                        )}

                        {!editando && podeEditarUsuarios && (
                          <div className={styles.expandedActions}>
                            <button
                              onClick={() => iniciarEdicao(usuario)}
                              className={styles.secondaryButton}
                            >
                              Editar
                            </button>

                            <button
                              onClick={() => alternarStatus(usuario)}
                              className={styles.secondaryButton}
                            >
                              {usuario.status === "ativo" ? "Inativar" : "Ativar"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </CrmShell>
  );
}