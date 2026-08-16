"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  CheckCircle2,
  Link2,
  LoaderCircle,
  Search,
  TriangleAlert,
  Unlink,
  UserPlus,
  X,
} from "lucide-react";
import styles from "./CadastroPacienteModalV2.module.css";

type Campo = {
  id?: string;
  chave: string;
  nome: string;
  tipo: "texto" | "texto_longo" | "numero" | "data" | "booleano" | "select";
  escopo: "pessoa" | "paciente";
  obrigatorio?: boolean;
  opcoes?: string[];
  ativo?: boolean;
};

type PessoaContato = {
  id: string;
  tipo_pessoa?: string | null;
  nome?: string | null;
  nome_social?: string | null;
  cpf_cnpj?: string | null;
  data_nascimento?: string | null;
  email?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  observacoes?: string | null;
  dados_personalizados?: Record<string, unknown> | null;
};

type ContatoDisponivel = {
  id: string;
  pessoa_id: string | null;
  nome: string | null;
  whatsapp_profile_name: string | null;
  telefone: string;
  email: string | null;
  empresa: string | null;
  origem: string | null;
  campanha: string | null;
  status_lead: string | null;
  classificacao: string | null;
  observacoes: string | null;
  ultima_interacao_at: string | null;
  pessoa: PessoaContato | null;
};

type FormPaciente = {
  nome: string;
  nome_social: string;
  telefone: string;
  email: string;
  cpf_cnpj: string;
  data_nascimento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  observacoes: string;
  convenio: string;
  numero_carteirinha: string;
  responsavel_nome: string;
  numero_prontuario: string;
  dados_pessoa: Record<string, unknown>;
  dados_paciente: Record<string, unknown>;
};

type CadastroPacienteModalProps = {
  aberto: boolean;
  nichoNome: string;
  podeCarregarCampos: boolean;
  onClose: () => void;
  onCreated: (pacienteId: string, mensagem: string) => void | Promise<void>;
};

const FORM_INICIAL: FormPaciente = {
  nome: "",
  nome_social: "",
  telefone: "",
  email: "",
  cpf_cnpj: "",
  data_nascimento: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  observacoes: "",
  convenio: "",
  numero_carteirinha: "",
  responsavel_nome: "",
  numero_prontuario: "",
  dados_pessoa: {},
  dados_paciente: {},
};

function digitos(valor: unknown) {
  return String(valor ?? "").replace(/\D/g, "");
}

function normalizarCampos(campos: Campo[]) {
  const unicos = new Map<string, Campo>();
  campos.forEach((campo) => {
    if (campo?.ativo === false) return;
    if (!campo?.chave || !campo?.nome || !campo?.escopo) return;
    unicos.set(`${campo.escopo}:${campo.chave}`, campo);
  });
  return Array.from(unicos.values());
}

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function formatarDataHora(valor: string | null | undefined) {
  if (!valor) return "Sem interação registrada";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Sem interação registrada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

export default function CadastroPacienteModalV2({
  aberto,
  nichoNome,
  podeCarregarCampos,
  onClose,
  onCreated,
}: CadastroPacienteModalProps) {
  const [form, setForm] = useState<FormPaciente>(FORM_INICIAL);
  const [campos, setCampos] = useState<Campo[]>([]);
  const [carregandoCampos, setCarregandoCampos] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultadosContato, setResultadosContato] = useState<ContatoDisponivel[]>([]);
  const [buscandoContato, setBuscandoContato] = useState(false);
  const [buscaContatoExecutada, setBuscaContatoExecutada] = useState(false);
  const [contatoSelecionado, setContatoSelecionado] = useState<ContatoDisponivel | null>(null);

  const camposPessoa = useMemo(
    () => campos.filter((campo) => campo.escopo === "pessoa"),
    [campos],
  );
  const camposPaciente = useMemo(
    () => campos.filter((campo) => campo.escopo === "paciente"),
    [campos],
  );

  useEffect(() => {
    if (!aberto) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !salvando) onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [aberto, onClose, salvando]);

  useEffect(() => {
    if (!aberto) return;

    setForm(FORM_INICIAL);
    setErro("");
    setResultadosContato([]);
    setBuscaContatoExecutada(false);
    setContatoSelecionado(null);

    if (!podeCarregarCampos) {
      setCampos([]);
      return;
    }

    let ativo = true;
    setCarregandoCampos(true);

    void fetch("/api/pessoas?limite=1", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data?.ok) return [] as Campo[];
        const padrao = Array.isArray(data.campos_padrao) ? data.campos_padrao : [];
        const personalizados = Array.isArray(data.campos_personalizados)
          ? data.campos_personalizados
          : [];
        return normalizarCampos([...padrao, ...personalizados] as Campo[]);
      })
      .then((resultado) => {
        if (ativo) setCampos(resultado);
      })
      .catch(() => {
        if (ativo) setCampos([]);
      })
      .finally(() => {
        if (ativo) setCarregandoCampos(false);
      });

    return () => {
      ativo = false;
    };
  }, [aberto, podeCarregarCampos]);

  useEffect(() => {
    if (!aberto || contatoSelecionado) return;

    const telefone = digitos(form.telefone);
    if (telefone.length < 3) {
      setResultadosContato([]);
      setBuscaContatoExecutada(false);
      setBuscandoContato(false);
      return;
    }

    let ativo = true;
    const timer = window.setTimeout(() => {
      setBuscandoContato(true);
      const params = new URLSearchParams({ busca: telefone });

      void fetch(`/api/pacientes/contatos-disponiveis?${params}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok || !data?.ok) {
            throw new Error(data?.error || "Não foi possível consultar os contatos.");
          }
          return Array.isArray(data.contatos) ? data.contatos : [];
        })
        .then((contatos) => {
          if (!ativo) return;
          setResultadosContato(contatos as ContatoDisponivel[]);
          setBuscaContatoExecutada(true);
        })
        .catch((error) => {
          if (!ativo) return;
          setResultadosContato([]);
          setBuscaContatoExecutada(true);
          if (error instanceof Error && !error.message.includes("permissão")) {
            setErro(error.message);
          }
        })
        .finally(() => {
          if (ativo) setBuscandoContato(false);
        });
    }, 260);

    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [aberto, contatoSelecionado, form.telefone]);

  function atualizarTelefone(valor: string) {
    if (
      contatoSelecionado &&
      digitos(valor) !== digitos(contatoSelecionado.telefone)
    ) {
      setContatoSelecionado(null);
    }
    setForm((atual) => ({ ...atual, telefone: valor }));
  }

  function selecionarContato(contato: ContatoDisponivel) {
    const pessoa = contato.pessoa;
    setContatoSelecionado(contato);
    setResultadosContato([]);
    setBuscaContatoExecutada(false);
    setErro("");

    setForm((atual) => ({
      ...atual,
      nome:
        pessoa?.nome?.trim() ||
        contato.nome?.trim() ||
        contato.whatsapp_profile_name?.trim() ||
        atual.nome,
      nome_social: pessoa?.nome_social?.trim() || atual.nome_social,
      telefone: contato.telefone || atual.telefone,
      email: pessoa?.email?.trim() || contato.email?.trim() || atual.email,
      cpf_cnpj: pessoa?.cpf_cnpj?.trim() || atual.cpf_cnpj,
      data_nascimento: pessoa?.data_nascimento?.trim() || atual.data_nascimento,
      cep: pessoa?.cep?.trim() || atual.cep,
      logradouro: pessoa?.logradouro?.trim() || atual.logradouro,
      numero: pessoa?.numero?.trim() || atual.numero,
      complemento: pessoa?.complemento?.trim() || atual.complemento,
      bairro: pessoa?.bairro?.trim() || atual.bairro,
      cidade: pessoa?.cidade?.trim() || atual.cidade,
      estado: pessoa?.estado?.trim() || atual.estado,
      observacoes:
        pessoa?.observacoes?.trim() || contato.observacoes?.trim() || atual.observacoes,
      dados_pessoa: {
        ...atual.dados_pessoa,
        ...comoObjeto(pessoa?.dados_personalizados),
      },
    }));
  }

  function desvincularContato() {
    setContatoSelecionado(null);
    setResultadosContato([]);
    setBuscaContatoExecutada(false);
  }

  function atualizarCampoDinamico(campo: Campo, valor: unknown) {
    if (campo.escopo === "paciente") {
      setForm((atual) => ({
        ...atual,
        dados_paciente: { ...atual.dados_paciente, [campo.chave]: valor },
      }));
      return;
    }
    setForm((atual) => ({
      ...atual,
      dados_pessoa: { ...atual.dados_pessoa, [campo.chave]: valor },
    }));
  }

  function valorCampo(campo: Campo) {
    const fonte = campo.escopo === "paciente" ? form.dados_paciente : form.dados_pessoa;
    return fonte[campo.chave];
  }

  function renderCampo(campo: Campo) {
    const valor = valorCampo(campo);
    const label = (
      <span>
        {campo.nome}
        {campo.obrigatorio ? <em> *</em> : null}
      </span>
    );

    if (campo.tipo === "booleano") {
      return (
        <label key={`${campo.escopo}:${campo.chave}`} className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={Boolean(valor)}
            onChange={(event) => atualizarCampoDinamico(campo, event.target.checked)}
          />
          {label}
        </label>
      );
    }

    if (campo.tipo === "texto_longo") {
      return (
        <label key={`${campo.escopo}:${campo.chave}`} className={`${styles.field} ${styles.fullField}`}>
          {label}
          <textarea
            value={String(valor ?? "")}
            required={campo.obrigatorio}
            onChange={(event) => atualizarCampoDinamico(campo, event.target.value)}
          />
        </label>
      );
    }

    if (campo.tipo === "select") {
      return (
        <label key={`${campo.escopo}:${campo.chave}`} className={styles.field}>
          {label}
          <select
            value={String(valor ?? "")}
            required={campo.obrigatorio}
            onChange={(event) => atualizarCampoDinamico(campo, event.target.value)}
          >
            <option value="">Selecione</option>
            {(campo.opcoes ?? []).map((opcao) => (
              <option key={opcao} value={opcao}>{opcao}</option>
            ))}
          </select>
        </label>
      );
    }

    return (
      <label key={`${campo.escopo}:${campo.chave}`} className={styles.field}>
        {label}
        <input
          type={campo.tipo === "data" ? "date" : campo.tipo === "numero" ? "number" : "text"}
          value={String(valor ?? "")}
          required={campo.obrigatorio}
          onChange={(event) => atualizarCampoDinamico(campo, event.target.value)}
        />
      </label>
    );
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.nome.trim()) {
      setErro("Informe o nome do paciente.");
      return;
    }

    setSalvando(true);
    setErro("");

    try {
      const response = await fetch("/api/pacientes/cadastrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contato_id: contatoSelecionado?.id ?? null,
          nome: form.nome,
          nome_social: form.nome_social,
          telefone: form.telefone,
          email: form.email,
          cpf_cnpj: form.cpf_cnpj,
          data_nascimento: form.data_nascimento,
          cep: form.cep,
          logradouro: form.logradouro,
          numero: form.numero,
          complemento: form.complemento,
          bairro: form.bairro,
          cidade: form.cidade,
          estado: form.estado,
          observacoes: form.observacoes,
          dados_personalizados: form.dados_pessoa,
          paciente: {
            numero_prontuario: form.numero_prontuario,
            convenio: form.convenio,
            numero_carteirinha: form.numero_carteirinha,
            responsavel_nome: form.responsavel_nome,
            dados_personalizados: form.dados_paciente,
          },
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao cadastrar paciente.");
      }

      const pacienteId = String(data.paciente_id ?? "").trim();
      if (!pacienteId) {
        throw new Error("Paciente cadastrado, mas o vínculo clínico não foi retornado.");
      }

      setForm(FORM_INICIAL);
      setContatoSelecionado(null);
      await onCreated(
        pacienteId,
        data.message || "Paciente cadastrado com sucesso.",
      );
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao cadastrar paciente.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return null;

  const telefoneDigitado = digitos(form.telefone);
  const semVinculoProvavel = !contatoSelecionado && telefoneDigitado.length === 0;

  return (
    <div className={styles.overlay} onMouseDown={() => !salvando && onClose()}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cadastro-paciente-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerIdentity}>
            <span className={styles.iconWrap}><UserPlus size={20} strokeWidth={2.2} /></span>
            <div>
              <span className={styles.eyebrow}>Novo paciente · {nichoNome}</span>
              <h2 id="cadastro-paciente-title">Cadastrar paciente</h2>
              <p>Comece pelo telefone para aproveitar um contato já existente e manter todo o CRM conectado.</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={salvando}
            aria-label="Fechar cadastro de paciente"
          >
            <X size={20} strokeWidth={2.2} />
          </button>
        </header>

        <form className={styles.form} onSubmit={salvar}>
          <div className={styles.body}>
            {erro ? <div className={styles.error}>{erro}</div> : null}

            <section className={`${styles.section} ${styles.linkSection}`}>
              <div className={styles.sectionTitle}>
                <span>01</span>
                <div>
                  <h3>Vincular ao contato</h3>
                  <p>Digite o número. Mostramos somente contatos que ainda não possuem cadastro de paciente.</p>
                </div>
              </div>

              <div className={styles.phoneSearch}>
                <Search size={18} />
                <input
                  autoFocus
                  value={form.telefone}
                  onChange={(event) => atualizarTelefone(event.target.value)}
                  placeholder="Telefone / WhatsApp"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label="Buscar contato pelo telefone"
                />
                {buscandoContato ? <LoaderCircle className={styles.spinner} size={18} /> : null}
              </div>

              {contatoSelecionado ? (
                <div className={styles.selectedContact}>
                  <div className={styles.selectedContactTitle}>
                    <span><CheckCircle2 size={17} /> Contato vinculado</span>
                    <button type="button" onClick={desvincularContato} disabled={salvando}>
                      <Unlink size={14} /> Desvincular
                    </button>
                  </div>
                  <strong>
                    {contatoSelecionado.pessoa?.nome ||
                      contatoSelecionado.nome ||
                      contatoSelecionado.whatsapp_profile_name ||
                      "Contato"}
                  </strong>
                  <div className={styles.contactFacts}>
                    <span><b>WhatsApp</b>{contatoSelecionado.telefone}</span>
                    <span><b>E-mail</b>{contatoSelecionado.pessoa?.email || contatoSelecionado.email || "Não informado"}</span>
                    <span><b>Origem</b>{contatoSelecionado.origem || "Não identificada"}</span>
                    <span><b>Campanha</b>{contatoSelecionado.campanha || "Não informada"}</span>
                    <span><b>Empresa</b>{contatoSelecionado.empresa || "Não informada"}</span>
                    <span><b>Última interação</b>{formatarDataHora(contatoSelecionado.ultima_interacao_at)}</span>
                  </div>
                  {contatoSelecionado.observacoes ? (
                    <p className={styles.contactNote}>{contatoSelecionado.observacoes}</p>
                  ) : null}
                </div>
              ) : null}

              {!contatoSelecionado && resultadosContato.length > 0 ? (
                <div className={styles.contactResults}>
                  {resultadosContato.map((contato) => (
                    <button
                      key={contato.id}
                      type="button"
                      onClick={() => selecionarContato(contato)}
                    >
                      <span className={styles.resultIcon}><Link2 size={16} /></span>
                      <span className={styles.resultBody}>
                        <strong>{contato.pessoa?.nome || contato.nome || contato.whatsapp_profile_name || "Contato"}</strong>
                        <small>{contato.telefone}{contato.email ? ` · ${contato.email}` : ""}</small>
                        <small>{contato.origem || "Origem não identificada"}{contato.campanha ? ` · ${contato.campanha}` : ""}</small>
                      </span>
                      <span className={styles.resultAction}>Vincular</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {!contatoSelecionado && buscaContatoExecutada && !buscandoContato && resultadosContato.length === 0 && telefoneDigitado.length >= 3 ? (
                <div className={styles.newContactHint}>
                  <UserPlus size={16} />
                  Nenhum contato disponível com esse número. Ao salvar, o sistema criará e vinculará um novo contato automaticamente.
                </div>
              ) : null}

              {semVinculoProvavel ? (
                <div className={styles.linkWarning}>
                  <TriangleAlert size={16} />
                  Sem telefone ou contato selecionado, o paciente será criado sem vínculo e ficará sinalizado na lista.
                </div>
              ) : null}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                <span>02</span>
                <div>
                  <h3>Identificação</h3>
                  <p>Ao selecionar um contato, os dados disponíveis são preenchidos automaticamente.</p>
                </div>
              </div>
              <div className={styles.grid}>
                <label className={`${styles.field} ${styles.fullField}`}>
                  <span>Nome completo <em>*</em></span>
                  <input
                    value={form.nome}
                    required
                    onChange={(event) => setForm((atual) => ({ ...atual, nome: event.target.value }))}
                    placeholder="Nome do paciente"
                  />
                </label>
                <label className={styles.field}>
                  <span>Nome social</span>
                  <input value={form.nome_social} onChange={(event) => setForm((atual) => ({ ...atual, nome_social: event.target.value }))} />
                </label>
                <label className={styles.field}>
                  <span>E-mail</span>
                  <input type="email" value={form.email} onChange={(event) => setForm((atual) => ({ ...atual, email: event.target.value }))} />
                </label>
                <label className={styles.field}>
                  <span>CPF / documento</span>
                  <input value={form.cpf_cnpj} onChange={(event) => setForm((atual) => ({ ...atual, cpf_cnpj: event.target.value }))} />
                </label>
                <label className={styles.field}>
                  <span>Data de nascimento</span>
                  <input type="date" value={form.data_nascimento} onChange={(event) => setForm((atual) => ({ ...atual, data_nascimento: event.target.value }))} />
                </label>
                {camposPessoa.map(renderCampo)}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                <span>03</span>
                <div>
                  <h3>Endereço</h3>
                  <p>Informações da pessoa centralizadas no cadastro, compartilhadas com os demais módulos do CRM.</p>
                </div>
              </div>
              <div className={styles.grid}>
                <label className={styles.field}><span>CEP</span><input value={form.cep} inputMode="numeric" onChange={(event) => setForm((atual) => ({ ...atual, cep: event.target.value }))} /></label>
                <label className={`${styles.field} ${styles.wideField}`}><span>Logradouro</span><input value={form.logradouro} onChange={(event) => setForm((atual) => ({ ...atual, logradouro: event.target.value }))} /></label>
                <label className={styles.field}><span>Número</span><input value={form.numero} onChange={(event) => setForm((atual) => ({ ...atual, numero: event.target.value }))} /></label>
                <label className={styles.field}><span>Complemento</span><input value={form.complemento} onChange={(event) => setForm((atual) => ({ ...atual, complemento: event.target.value }))} /></label>
                <label className={styles.field}><span>Bairro</span><input value={form.bairro} onChange={(event) => setForm((atual) => ({ ...atual, bairro: event.target.value }))} /></label>
                <label className={styles.field}><span>Cidade</span><input value={form.cidade} onChange={(event) => setForm((atual) => ({ ...atual, cidade: event.target.value }))} /></label>
                <label className={styles.field}><span>UF</span><input value={form.estado} maxLength={2} onChange={(event) => setForm((atual) => ({ ...atual, estado: event.target.value.toUpperCase() }))} /></label>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                <span>04</span>
                <div>
                  <h3>Dados do paciente</h3>
                  <p>Informações administrativas da extensão clínica.</p>
                </div>
              </div>
              <div className={styles.grid}>
                <label className={styles.field}><span>Convênio</span><input value={form.convenio} onChange={(event) => setForm((atual) => ({ ...atual, convenio: event.target.value }))} /></label>
                <label className={styles.field}><span>Nº da carteirinha</span><input value={form.numero_carteirinha} onChange={(event) => setForm((atual) => ({ ...atual, numero_carteirinha: event.target.value }))} /></label>
                <label className={styles.field}><span>Responsável</span><input value={form.responsavel_nome} onChange={(event) => setForm((atual) => ({ ...atual, responsavel_nome: event.target.value }))} placeholder="Quando aplicável" /></label>
                <label className={styles.field}><span>Nº do prontuário</span><input value={form.numero_prontuario} onChange={(event) => setForm((atual) => ({ ...atual, numero_prontuario: event.target.value }))} placeholder="Deixe em branco para gerar automaticamente" /></label>
                {camposPaciente.map(renderCampo)}
              </div>
              {carregandoCampos ? <p className={styles.loadingFields}>Carregando campos configurados para a clínica...</p> : null}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionTitle}>
                <span>05</span>
                <div>
                  <h3>Observações gerais</h3>
                  <p>Anotações administrativas. Evoluções clínicas permanecem no prontuário.</p>
                </div>
              </div>
              <label className={`${styles.field} ${styles.fullField}`}>
                <span>Observações</span>
                <textarea value={form.observacoes} onChange={(event) => setForm((atual) => ({ ...atual, observacoes: event.target.value }))} placeholder="Informações úteis para a equipe" />
              </label>
            </section>
          </div>

          <footer className={styles.footer}>
            <div className={styles.footerStatus}>
              {contatoSelecionado || telefoneDigitado ? (
                <span className={styles.footerLinked}><Link2 size={14} /> Vínculo de contato será mantido</span>
              ) : (
                <span className={styles.footerWarning}><TriangleAlert size={14} /> Sem contato vinculado</span>
              )}
            </div>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={salvando}>Cancelar</button>
            <button type="submit" className={styles.saveButton} disabled={salvando}>
              {salvando ? <LoaderCircle className={styles.spinner} size={17} /> : <UserPlus size={17} />}
              {salvando ? "Cadastrando..." : "Cadastrar paciente"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
