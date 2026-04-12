"use client";

import { useEffect, useMemo, useState } from "react";
import CrmShell from "@/components/CrmShell";
import Header from "@/components/Header";
import styles from "./permissoes.module.css";

type ConfiguracaoEmpresa = {
  empresa_id: string;

  permitir_transferir_sem_assumir: boolean;
  permitir_transferir_para_mesmo_setor: boolean;
  limpar_responsavel_ao_transferir: boolean;
  voltar_fila_ao_transferir: boolean;

  atendente_pode_transferir: boolean;
  supervisor_pode_transferir: boolean;
  administrador_pode_transferir: boolean;

  atendente_pode_atribuir: boolean;
  supervisor_pode_atribuir: boolean;
  administrador_pode_atribuir: boolean;

  atendente_pode_assumir: boolean;
  supervisor_pode_assumir: boolean;
  administrador_pode_assumir: boolean;

  permitir_assumir_conversa_em_fila: boolean;
  permitir_assumir_conversa_sem_responsavel: boolean;
  permitir_assumir_conversa_ja_atribuida: boolean;
};

type ConfiguracaoUsuario = {
  pode_transferir: boolean | null;
  pode_atribuir: boolean | null;
  pode_assumir: boolean | null;

  permitir_transferir_sem_assumir: boolean | null;

  permitir_assumir_conversa_em_fila: boolean | null;
  permitir_assumir_conversa_sem_responsavel: boolean | null;
  permitir_assumir_conversa_ja_atribuida: boolean | null;
};

type UsuarioItem = {
  id: string;
  nome: string | null;
  email: string | null;
  perfis: string[];
  setores: string[];
  configuracao_usuario: ConfiguracaoUsuario;
};

type ApiResponse = {
  ok: boolean;
  empresa: ConfiguracaoEmpresa;
  usuarios: UsuarioItem[];
};

type OverrideValue = "inherit" | "true" | "false";

const overrideToValue = (value: boolean | null | undefined): OverrideValue => {
  if (value === true) return "true";
  if (value === false) return "false";
  return "inherit";
};

const valueToOverride = (value: OverrideValue): boolean | null => {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
};

function CardBoolean({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.settingCard}>
      <div className={styles.settingText}>
        <span className={styles.settingLabel}>{label}</span>
        <span className={styles.settingHint}>{hint}</span>
      </div>

      <span className={styles.switchWrap}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={styles.switchInput}
        />
        <span className={styles.switchSlider} />
      </span>
    </label>
  );
}

function OverrideSelect({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: OverrideValue;
  onChange: (value: OverrideValue) => void;
}) {
  return (
    <label className={styles.overrideField}>
      <span className={styles.overrideLabel}>{label}</span>
      <span className={styles.overrideHint}>{hint}</span>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value as OverrideValue)}
      >
        <option value="inherit">Usar padrão da empresa</option>
        <option value="true">Permitir</option>
        <option value="false">Bloquear</option>
      </select>
    </label>
  );
}

function getIniciais(nome?: string | null) {
  const valor = nome?.trim() || "Usuário";
  const partes = valor.split(" ").filter(Boolean);

  if (partes.length === 0) return "US";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

export default function PermissoesPage() {
  const [loading, setLoading] = useState(true);
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false);
  const [salvandoUsuarioId, setSalvandoUsuarioId] = useState<string | null>(null);

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [busca, setBusca] = useState("");

  const [empresa, setEmpresa] = useState<ConfiguracaoEmpresa | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([]);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  async function carregarDados() {
    try {
      setLoading(true);
      setErro("");

      const res = await fetch("/api/configuracoes/permissoes", {
        cache: "no-store",
      });

      const data = (await res.json()) as ApiResponse & { error?: string };

      if (!res.ok || !data.ok) {
        setErro(data.error || "Erro ao carregar configurações");
        return;
      }

      setEmpresa(data.empresa);
      setUsuarios(data.usuarios || []);
    } catch {
      setErro("Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return usuarios;

    return usuarios.filter((usuario) => {
      const nome = (usuario.nome || "").toLowerCase();
      const email = (usuario.email || "").toLowerCase();
      const perfis = usuario.perfis.join(" ").toLowerCase();
      const setores = usuario.setores.join(" ").toLowerCase();

      return (
        nome.includes(termo) ||
        email.includes(termo) ||
        perfis.includes(termo) ||
        setores.includes(termo)
      );
    });
  }, [usuarios, busca]);

  function atualizarEmpresa<K extends keyof ConfiguracaoEmpresa>(
    campo: K,
    valor: ConfiguracaoEmpresa[K]
  ) {
    if (!empresa) return;
    setEmpresa({ ...empresa, [campo]: valor });
  }

  function atualizarUsuario(
    usuarioId: string,
    campo: keyof ConfiguracaoUsuario,
    valor: boolean | null
  ) {
    setUsuarios((atual) =>
      atual.map((usuario) =>
        usuario.id === usuarioId
          ? {
              ...usuario,
              configuracao_usuario: {
                ...usuario.configuracao_usuario,
                [campo]: valor,
              },
            }
          : usuario
      )
    );
  }

  async function salvarEmpresa() {
    if (!empresa) return;

    try {
      setSalvandoEmpresa(true);
      setErro("");
      setSucesso("");

      const res = await fetch("/api/configuracoes/permissoes/empresa", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(empresa),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao salvar configuração da empresa");
        return;
      }

      setSucesso("Configurações da empresa salvas com sucesso.");
      await carregarDados();
    } catch {
      setErro("Erro ao salvar configuração da empresa");
    } finally {
      setSalvandoEmpresa(false);
    }
  }

  async function salvarUsuario(usuario: UsuarioItem) {
    try {
      setSalvandoUsuarioId(usuario.id);
      setErro("");
      setSucesso("");

      const res = await fetch(
        `/api/configuracoes/permissoes/usuarios/${usuario.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(usuario.configuracao_usuario),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao salvar exceção do usuário");
        return;
      }

      setSucesso(
        `Exceções do usuário ${usuario.nome || "sem nome"} salvas com sucesso.`
      );
      await carregarDados();
    } catch {
      setErro("Erro ao salvar exceção do usuário");
    } finally {
      setSalvandoUsuarioId(null);
    }
  }

  function toggleExpandir(usuarioId: string) {
    setExpandidoId((atual) => (atual === usuarioId ? null : usuarioId));
  }

  if (loading) {
    return (
      <CrmShell>
        <Header
          title="Permissões"
          subtitle="Configurações de regras de atendimento e exceções por usuário."
        />
        <div className={styles.pageContent}>
          <div className={styles.loadingCard}>Carregando configurações...</div>
        </div>
      </CrmShell>
    );
  }

  if (!empresa) {
    return (
      <CrmShell>
        <Header
          title="Permissões"
          subtitle="Configurações de regras de atendimento e exceções por usuário."
        />
        <div className={styles.pageContent}>
          <div className={styles.errorCard}>
            {erro || "Não foi possível carregar as configurações."}
          </div>
        </div>
      </CrmShell>
    );
  }

  return (
    <CrmShell>
      <Header
        title="Permissões e regras"
        subtitle="Configure o padrão da empresa e personalize exceções específicas por usuário."
      />

      <div className={styles.pageContent}>
        {erro && <div className={styles.errorAlert}>{erro}</div>}
        {sucesso && <div className={styles.successAlert}>{sucesso}</div>}

        <section className={styles.heroCard}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>Configuração central</p>
            <h2 className={styles.heroTitle}>Padrão da empresa</h2>
            <p className={styles.heroDescription}>
              Essas regras definem o comportamento padrão da operação para todos
              os usuários. As exceções individuais devem ser usadas apenas em
              casos especiais.
            </p>
          </div>

          <button
            className={styles.primaryButton}
            onClick={salvarEmpresa}
            disabled={salvandoEmpresa}
          >
            {salvandoEmpresa ? "Salvando..." : "Salvar padrão da empresa"}
          </button>
        </section>

        <section className={styles.explainGrid}>
          <div className={styles.explainCard}>
            <h3 className={styles.explainTitle}>Padrão da empresa</h3>
            <p className={styles.explainText}>
              Define o comportamento geral por perfil, setor e fluxo operacional.
            </p>
          </div>

          <div className={styles.explainCard}>
            <h3 className={styles.explainTitle}>Exceção por usuário</h3>
            <p className={styles.explainText}>
              Permite liberar ou bloquear ações específicas para pessoas
              selecionadas.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Fluxo operacional</p>
              <h2 className={styles.sectionTitle}>Transferência de conversas</h2>
              <p className={styles.sectionDescription}>
                Regras que definem quem pode transferir e como a transferência
                deve acontecer.
              </p>
            </div>
          </div>

          <div className={styles.settingsGrid}>
            <CardBoolean
              label="Atendente pode transferir"
              hint="Libera a ação de transferir para usuários com perfil de atendente."
              checked={empresa.atendente_pode_transferir}
              onChange={(v) => atualizarEmpresa("atendente_pode_transferir", v)}
            />
            <CardBoolean
              label="Supervisor pode transferir"
              hint="Supervisores poderão transferir conversas dos setores aos quais pertencem."
              checked={empresa.supervisor_pode_transferir}
              onChange={(v) => atualizarEmpresa("supervisor_pode_transferir", v)}
            />
            <CardBoolean
              label="Administrador pode transferir"
              hint="Administradores poderão transferir conversas da empresa."
              checked={empresa.administrador_pode_transferir}
              onChange={(v) => atualizarEmpresa("administrador_pode_transferir", v)}
            />
            <CardBoolean
              label="Permitir transferir sem assumir antes"
              hint="Se desligado, o usuário precisa assumir a conversa antes de transferir."
              checked={empresa.permitir_transferir_sem_assumir}
              onChange={(v) =>
                atualizarEmpresa("permitir_transferir_sem_assumir", v)
              }
            />
            <CardBoolean
              label="Permitir transferir para o mesmo setor"
              hint="Evita transferências inúteis para o mesmo setor."
              checked={empresa.permitir_transferir_para_mesmo_setor}
              onChange={(v) =>
                atualizarEmpresa("permitir_transferir_para_mesmo_setor", v)
              }
            />
            <CardBoolean
              label="Limpar responsável ao transferir"
              hint="Ao mudar de setor, remove o responsável atual."
              checked={empresa.limpar_responsavel_ao_transferir}
              onChange={(v) =>
                atualizarEmpresa("limpar_responsavel_ao_transferir", v)
              }
            />
            <CardBoolean
              label="Voltar para fila ao transferir"
              hint="Quando ativado, a conversa volta para fila após a transferência."
              checked={empresa.voltar_fila_ao_transferir}
              onChange={(v) => atualizarEmpresa("voltar_fila_ao_transferir", v)}
            />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Distribuição</p>
              <h2 className={styles.sectionTitle}>Atribuição de responsável</h2>
              <p className={styles.sectionDescription}>
                Controle quem pode redistribuir conversas para outros usuários.
              </p>
            </div>
          </div>

          <div className={styles.settingsGrid}>
            <CardBoolean
              label="Atendente pode atribuir"
              hint="Permite redistribuir conversas para outro usuário do setor."
              checked={empresa.atendente_pode_atribuir}
              onChange={(v) => atualizarEmpresa("atendente_pode_atribuir", v)}
            />
            <CardBoolean
              label="Supervisor pode atribuir"
              hint="Supervisores poderão redistribuir conversas."
              checked={empresa.supervisor_pode_atribuir}
              onChange={(v) => atualizarEmpresa("supervisor_pode_atribuir", v)}
            />
            <CardBoolean
              label="Administrador pode atribuir"
              hint="Administradores poderão definir responsáveis."
              checked={empresa.administrador_pode_atribuir}
              onChange={(v) => atualizarEmpresa("administrador_pode_atribuir", v)}
            />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Posse da conversa</p>
              <h2 className={styles.sectionTitle}>Assumir conversa</h2>
              <p className={styles.sectionDescription}>
                Defina em quais cenários os usuários podem assumir uma conversa.
              </p>
            </div>
          </div>

          <div className={styles.settingsGrid}>
            <CardBoolean
              label="Atendente pode assumir"
              hint="Libera a ação de assumir para atendentes."
              checked={empresa.atendente_pode_assumir}
              onChange={(v) => atualizarEmpresa("atendente_pode_assumir", v)}
            />
            <CardBoolean
              label="Supervisor pode assumir"
              hint="Libera a ação de assumir para supervisores."
              checked={empresa.supervisor_pode_assumir}
              onChange={(v) => atualizarEmpresa("supervisor_pode_assumir", v)}
            />
            <CardBoolean
              label="Administrador pode assumir"
              hint="Libera a ação de assumir para administradores."
              checked={empresa.administrador_pode_assumir}
              onChange={(v) => atualizarEmpresa("administrador_pode_assumir", v)}
            />
            <CardBoolean
              label="Permitir assumir conversa em fila"
              hint="Mostra e libera a ação para conversas em fila."
              checked={empresa.permitir_assumir_conversa_em_fila}
              onChange={(v) =>
                atualizarEmpresa("permitir_assumir_conversa_em_fila", v)
              }
            />
            <CardBoolean
              label="Permitir assumir conversa sem responsável"
              hint="Define se usuários podem assumir conversas sem responsável."
              checked={empresa.permitir_assumir_conversa_sem_responsavel}
              onChange={(v) =>
                atualizarEmpresa("permitir_assumir_conversa_sem_responsavel", v)
              }
            />
            <CardBoolean
              label="Permitir assumir conversa já atribuída"
              hint="Se ativado, um usuário poderá assumir conversa que já está com outro responsável."
              checked={empresa.permitir_assumir_conversa_ja_atribuida}
              onChange={(v) =>
                atualizarEmpresa("permitir_assumir_conversa_ja_atribuida", v)
              }
            />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.userSectionHeader}>
            <div>
              <p className={styles.eyebrow}>Exceções</p>
              <h2 className={styles.sectionTitle}>Exceções por usuário</h2>
              <p className={styles.sectionDescription}>
                Use apenas quando quiser sair do padrão da empresa para uma pessoa
                específica.
              </p>
            </div>

            <div className={styles.searchField}>
              <label className={styles.searchLabel}>Buscar usuário</label>
              <input
                className={styles.searchInput}
                placeholder="Buscar por nome, email, perfil ou setor..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          {usuariosFiltrados.length === 0 ? (
            <div className={styles.emptyCard}>Nenhum usuário encontrado.</div>
          ) : (
            <div className={styles.userList}>
              {usuariosFiltrados.map((usuario) => {
                const expandido = expandidoId === usuario.id;

                return (
                  <article key={usuario.id} className={styles.userCard}>
                    <div className={styles.userSummary}>
                      <div className={styles.userLeft}>
                        <div className={styles.avatar}>
                          {getIniciais(usuario.nome)}
                        </div>

                        <div className={styles.userIdentity}>
                          <div className={styles.userTopRow}>
                            <h3 className={styles.userName}>
                              {usuario.nome || "Usuário sem nome"}
                            </h3>
                          </div>

                          <p className={styles.userEmail}>
                            {usuario.email || "Sem e-mail"}
                          </p>

                          <div className={styles.userMeta}>
                            <span className={styles.metaChip}>
                              Perfis: {usuario.perfis.join(", ") || "Sem perfil"}
                            </span>
                            <span className={styles.metaChip}>
                              Setores: {usuario.setores.join(", ") || "Sem setor"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.userRight}>
                        <button
                          className={styles.secondaryButton}
                          onClick={() => toggleExpandir(usuario.id)}
                        >
                          {expandido ? "Recolher" : "Expandir"}
                        </button>

                        <button
                          className={styles.secondaryButton}
                          onClick={() => salvarUsuario(usuario)}
                          disabled={salvandoUsuarioId === usuario.id}
                        >
                          {salvandoUsuarioId === usuario.id
                            ? "Salvando..."
                            : "Salvar exceções"}
                        </button>
                      </div>
                    </div>

                    {expandido && (
                      <div className={styles.userExpanded}>
                        <div className={styles.overrideGrid}>
                          <OverrideSelect
                            label="Pode transferir"
                            hint="Controla a ação de transferir para este usuário."
                            value={overrideToValue(
                              usuario.configuracao_usuario.pode_transferir
                            )}
                            onChange={(v) =>
                              atualizarUsuario(
                                usuario.id,
                                "pode_transferir",
                                valueToOverride(v)
                              )
                            }
                          />

                          <OverrideSelect
                            label="Pode atribuir"
                            hint="Controla a redistribuição de conversas para este usuário."
                            value={overrideToValue(
                              usuario.configuracao_usuario.pode_atribuir
                            )}
                            onChange={(v) =>
                              atualizarUsuario(
                                usuario.id,
                                "pode_atribuir",
                                valueToOverride(v)
                              )
                            }
                          />

                          <OverrideSelect
                            label="Pode assumir"
                            hint="Controla a ação de assumir conversa para este usuário."
                            value={overrideToValue(
                              usuario.configuracao_usuario.pode_assumir
                            )}
                            onChange={(v) =>
                              atualizarUsuario(
                                usuario.id,
                                "pode_assumir",
                                valueToOverride(v)
                              )
                            }
                          />

                          <OverrideSelect
                            label="Transferir sem assumir antes"
                            hint="Permite exceção individual nessa regra."
                            value={overrideToValue(
                              usuario.configuracao_usuario.permitir_transferir_sem_assumir
                            )}
                            onChange={(v) =>
                              atualizarUsuario(
                                usuario.id,
                                "permitir_transferir_sem_assumir",
                                valueToOverride(v)
                              )
                            }
                          />

                          <OverrideSelect
                            label="Assumir conversa em fila"
                            hint="Permite exceção individual para conversas em fila."
                            value={overrideToValue(
                              usuario.configuracao_usuario
                                .permitir_assumir_conversa_em_fila
                            )}
                            onChange={(v) =>
                              atualizarUsuario(
                                usuario.id,
                                "permitir_assumir_conversa_em_fila",
                                valueToOverride(v)
                              )
                            }
                          />

                          <OverrideSelect
                            label="Assumir conversa sem responsável"
                            hint="Permite exceção individual para conversa sem responsável."
                            value={overrideToValue(
                              usuario.configuracao_usuario
                                .permitir_assumir_conversa_sem_responsavel
                            )}
                            onChange={(v) =>
                              atualizarUsuario(
                                usuario.id,
                                "permitir_assumir_conversa_sem_responsavel",
                                valueToOverride(v)
                              )
                            }
                          />

                          <OverrideSelect
                            label="Assumir conversa já atribuída"
                            hint="Permite exceção individual para assumir conversa de outro usuário."
                            value={overrideToValue(
                              usuario.configuracao_usuario
                                .permitir_assumir_conversa_ja_atribuida
                            )}
                            onChange={(v) =>
                              atualizarUsuario(
                                usuario.id,
                                "permitir_assumir_conversa_ja_atribuida",
                                valueToOverride(v)
                              )
                            }
                          />
                        </div>
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