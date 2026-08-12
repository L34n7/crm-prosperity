"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  History,
  Link2,
  MapPin,
  MessageCircle,
  Pencil,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import styles from "./AgendaAppointmentDetails.module.css";

type DetailLink = {
  entidade_tipo: string;
  entidade_id: string;
  titulo: string;
  subtitulo: string;
  imagem_url: string;
  principal: boolean;
  dados_json: Record<string, string>;
};

type DetailParticipant = {
  nome: string;
  email: string;
  telefone: string;
  papel: string;
  status: string;
};

type DetailReminder = {
  canal: string;
  antecedencia_minutos: number;
  destinatario_tipo: string;
  ativo: boolean;
  status?: string;
  agendado_para?: string;
};

type DetailHistory = {
  id: string;
  usuario_id?: string | null;
  acao: string;
  descricao?: string;
  usuario_nome?: string;
  status_novo?: string;
  created_at: string;
};

export type AgendaAppointmentDetail = {
  id: string;
  contato_id: string | null;
  conversa_id: string | null;
  titulo: string;
  nome_cliente: string | null;
  telefone_cliente: string | null;
  email_cliente: string | null;
  inicio_at: string;
  fim_at: string;
  status: string;
  origem: string;
  observacoes: string | null;
  local: string | null;
  link_reuniao: string | null;
  prioridade: string;
  confirmacao_status: string;
  resultado: string | null;
  observacoes_internas: string | null;
  metadata_json?: {
    confirmacao_whatsapp?: { respondido_em?: string | null } | null;
  } | null;
  contato: { nome: string | null; telefone: string | null; email: string | null } | null;
  responsavel: { nome: string; email: string | null } | null;
  tipo: { nome: string; cor: string } | null;
  vinculos: DetailLink[];
  participantes: DetailParticipant[];
  lembretes: DetailReminder[];
  historico: DetailHistory[];
};

type Props = {
  appointment: AgendaAppointmentDetail;
  calendarName?: string | null;
  customerLabel: string;
  isHealthNiche: boolean;
  statusLabels: Record<string, string>;
  relatedTypeLabels: Record<string, string>;
  googleCalendarUrl?: string | null;
  onClose: () => void;
  onEdit?: () => void;
};

const dateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Não informado";

const time = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

function autorHistorico(
  item: DetailHistory,
  appointment: AgendaAppointmentDetail
) {
  const respondidoEm =
    appointment.metadata_json?.confirmacao_whatsapp?.respondido_em;
  const diferencaConfirmacao = respondidoEm
    ? Math.abs(
        new Date(item.created_at).getTime() - new Date(respondidoEm).getTime()
      )
    : Number.POSITIVE_INFINITY;
  const confirmadoPeloContato =
    item.acao === "status_alterado" &&
    item.status_novo === "confirmado" &&
    (item.usuario_id == null || diferencaConfirmacao <= 5 * 60 * 1000);

  if (!confirmadoPeloContato) return item.usuario_nome || "Sistema";

  const nome = appointment.contato?.nome || appointment.nome_cliente;
  return nome ? `${nome} (contato)` : "Contato";
}

const duration = (start: string, end: string) => {
  const minutes = Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
};

const originLabel = (value: string) => {
  if (value === "automacao") return "Automação";
  if (value === "api") return "API";
  if (value === "google") return "Google";
  return "Manual";
};

const reminderLabel = (minutes: number) => {
  if (minutes >= 1440 && minutes % 1440 === 0)
    return `${minutes / 1440} dia${minutes === 1440 ? "" : "s"} antes`;
  if (minutes >= 60 && minutes % 60 === 0)
    return `${minutes / 60} hora${minutes === 60 ? "" : "s"} antes`;
  return `${minutes} min antes`;
};

const channelLabel = (value: string) => {
  if (value === "whatsapp") return "WhatsApp";
  if (value === "email") return "E-mail";
  return "Sistema";
};

const recipientLabel = (value: string, customerLabel: string) => {
  if (value === "cliente") return customerLabel;
  if (value === "participantes") return "Participantes";
  return "Responsável";
};

function DetailValue({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className={styles.detailValue}>
      <span>{label}</span>
      <strong>{value || "Não informado"}</strong>
    </div>
  );
}

export default function AgendaAppointmentDetails({
  appointment,
  calendarName,
  customerLabel,
  isHealthNiche,
  statusLabels,
  relatedTypeLabels,
  googleCalendarUrl,
  onClose,
  onEdit,
}: Props) {
  const customerName =
    appointment.nome_cliente || appointment.contato?.nome || `${customerLabel} não informado`;
  const customerPhone = appointment.telefone_cliente || appointment.contato?.telefone || "";
  const customerEmail = appointment.email_cliente || appointment.contato?.email || "";
  const clinicalLink = appointment.vinculos.find(
    (item) => item.dados_json?.pessoa_id || item.dados_json?.paciente_id,
  );
  const customerHref = isHealthNiche
    ? clinicalLink?.dados_json?.pessoa_id
      ? `/cadastros?pessoa_id=${clinicalLink.dados_json.pessoa_id}`
      : appointment.contato_id
        ? `/cadastros?contato_id=${appointment.contato_id}`
        : clinicalLink?.dados_json?.paciente_id
          ? `/prontuarios?paciente_id=${clinicalLink.dados_json.paciente_id}`
          : ""
    : appointment.contato_id
      ? `/contatos?contato=${appointment.contato_id}`
      : "";
  const conversationHref = appointment.conversa_id
    ? `/conversas?id=${appointment.conversa_id}`
    : "";

  return (
    <div className={styles.overlay} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="appointment-details-title">
        <header className={styles.hero}>
          <div className={styles.heroGlow} />
          <div className={styles.heroTop}>
            <div className={styles.heroIcon}><CalendarDays size={22} /></div>
            <div className={styles.heroCopy}>
              <div className={styles.badges}>
                <span className={styles.statusBadge}>{statusLabels[appointment.status] || appointment.status}</span>
                {appointment.tipo ? (
                  <span className={styles.typeBadge} style={{ "--appointment-color": appointment.tipo.cor } as React.CSSProperties}>
                    {appointment.tipo.nome}
                  </span>
                ) : null}
              </div>
              <h2 id="appointment-details-title">{appointment.titulo}</h2>
              <p>{dateTime(appointment.inicio_at)} · {duration(appointment.inicio_at, appointment.fim_at)}</p>
            </div>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar detalhes">
              <X size={18} />
            </button>
          </div>
          <div className={styles.scheduleStrip}>
            <div><CalendarDays size={17} /><span><small>Início</small><strong>{dateTime(appointment.inicio_at)}</strong></span></div>
            <div><Clock3 size={17} /><span><small>Término</small><strong>{time(appointment.fim_at)}</strong></span></div>
            <div><CheckCircle2 size={17} /><span><small>Confirmação</small><strong>{statusLabels[appointment.confirmacao_status] || appointment.confirmacao_status || "Pendente"}</strong></span></div>
          </div>
        </header>

        <div className={styles.body}>
          <section className={styles.section}>
            <div className={styles.sectionTitle}><CalendarDays size={17} /><div><h3>Informações do compromisso</h3><p>Dados principais e organização do agendamento.</p></div></div>
            <div className={styles.detailsGrid}>
              <DetailValue label="Calendário" value={calendarName} />
              <DetailValue label="Responsável" value={appointment.responsavel?.nome} />
              <DetailValue label="Prioridade" value={appointment.prioridade ? appointment.prioridade[0].toUpperCase() + appointment.prioridade.slice(1) : "Normal"} />
              <DetailValue label="Origem" value={originLabel(appointment.origem)} />
            </div>
            {appointment.local || appointment.link_reuniao ? (
              <div className={styles.linkRows}>
                {appointment.local ? <div><MapPin size={16} /><span><small>Local / endereço</small><strong>{appointment.local}</strong></span></div> : null}
                {appointment.link_reuniao ? <a href={appointment.link_reuniao} target="_blank" rel="noopener noreferrer"><Link2 size={16} /><span><small>Reunião online</small><strong>Abrir link da reunião</strong></span><ExternalLink size={14} /></a> : null}
              </div>
            ) : null}
            {appointment.observacoes ? <div className={styles.note}><FileText size={16} /><div><span>Observações</span><p>{appointment.observacoes}</p></div></div> : null}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}><UserRound size={17} /><div><h3>{customerLabel}</h3><p>Contato principal relacionado ao compromisso.</p></div></div>
            <div className={styles.customerCard}>
              <div className={styles.avatar}>{customerName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—"}</div>
              {customerHref ? (
                <Link className={styles.customerBody} href={customerHref} target="_blank" rel="noopener noreferrer">
                  <strong>{customerName}</strong>
                  <span>{customerPhone || "Telefone não informado"}{customerEmail ? ` · ${customerEmail}` : ""}</span>
                </Link>
              ) : (
                <div className={styles.customerBody}><strong>{customerName}</strong><span>{customerPhone || "Telefone não informado"}{customerEmail ? ` · ${customerEmail}` : ""}</span></div>
              )}
              <div className={styles.inlineActions}>
                {conversationHref ? <Link href={conversationHref} target="_blank" rel="noopener noreferrer" title="Abrir conversa no CRM"><MessageCircle size={17} /><span>Conversa</span></Link> : null}
                {customerPhone ? <a href={`https://wa.me/55${customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp"><MessageCircle size={16} /></a> : null}
                {customerHref ? <Link href={customerHref} target="_blank" rel="noopener noreferrer" title={`Abrir ${customerLabel.toLowerCase()}`}><ExternalLink size={16} /></Link> : null}
              </div>
            </div>
          </section>

          {appointment.vinculos.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionTitle}><Link2 size={17} /><div><h3>Registros relacionados</h3><p>Imóveis, prontuários, odontogramas e outros vínculos.</p></div></div>
              <div className={styles.relatedList}>
                {appointment.vinculos.map((link, index) => {
                  const isProperty = link.entidade_tipo === "imovel";
                  const address = [
                    [link.dados_json?.logradouro, link.dados_json?.numero].filter(Boolean).join(", "),
                    link.dados_json?.complemento,
                    link.dados_json?.bairro,
                    [link.dados_json?.cidade, link.dados_json?.estado].filter(Boolean).join(" - "),
                    link.dados_json?.cep ? `CEP ${link.dados_json.cep}` : "",
                  ].filter(Boolean).join(" · ");
                  const content = <>
                    <div className={`${styles.relatedVisual} ${isProperty ? styles.propertyVisual : ""}`}>{link.imagem_url ? <Image loader={({ src }) => src} unoptimized src={link.imagem_url} alt="" width={112} height={92} /> : <FileText size={24} />}</div>
                    <div className={styles.relatedBody}>
                      <div><span>{relatedTypeLabels[link.entidade_tipo] || link.entidade_tipo}</span>{link.principal ? <span>Principal</span> : null}</div>
                      <strong>{link.titulo || "Registro relacionado"}</strong>
                      {isProperty ? <>
                        <p className={styles.propertyAddress}><MapPin size={15} />{address || link.subtitulo || "Endereço não informado"}</p>
                        <div className={styles.propertyMeta}>
                          {link.dados_json?.codigo ? <span>Cód. {link.dados_json.codigo}</span> : null}
                          {link.dados_json?.tipo ? <span>{link.dados_json.tipo}</span> : null}
                          {link.dados_json?.finalidade ? <span>{link.dados_json.finalidade}</span> : null}
                          {link.dados_json?.valor ? <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(link.dados_json.valor))}</span> : null}
                        </div>
                      </> : <p>{link.subtitulo || "Sem informações adicionais"}</p>}
                    </div>
                    {link.dados_json?.href ? <span className={styles.openRelated}>Abrir <ExternalLink size={15} /></span> : null}
                  </>;
                  return link.dados_json?.href ? (
                    <Link key={`${link.entidade_tipo}-${link.entidade_id}-${index}`} className={`${styles.relatedCard} ${isProperty ? styles.propertyCard : ""}`} href={link.dados_json.href} target="_blank" rel="noopener noreferrer">{content}</Link>
                  ) : (
                    <article key={`${link.entidade_tipo}-${link.entidade_id}-${index}`} className={styles.relatedCard}>{content}</article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {appointment.participantes.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionTitle}><UsersRound size={17} /><div><h3>Participantes</h3><p>Pessoas adicionais neste compromisso.</p></div></div>
              <div className={styles.compactList}>{appointment.participantes.map((participant, index) => <div key={`${participant.nome}-${index}`}><div className={styles.smallAvatar}><UserRound size={15} /></div><span><strong>{participant.nome}</strong><small>{[participant.papel, participant.email, participant.telefone].filter(Boolean).join(" · ") || "Participante"}</small></span>{participant.status ? <em>{participant.status}</em> : null}</div>)}</div>
            </section>
          ) : null}

          {appointment.lembretes.length > 0 ? (
            <section className={styles.section}>
              <div className={styles.sectionTitle}><Bell size={17} /><div><h3>Lembretes</h3><p>Avisos configurados para este agendamento.</p></div></div>
              <div className={styles.compactList}>{appointment.lembretes.map((reminder, index) => <div key={`${reminder.canal}-${index}`}><div className={styles.smallAvatar}><Bell size={15} /></div><span><strong>{channelLabel(reminder.canal)} · {reminderLabel(reminder.antecedencia_minutos)}</strong><small>Para {recipientLabel(reminder.destinatario_tipo, customerLabel)}{reminder.agendado_para ? ` · ${dateTime(reminder.agendado_para)}` : ""}</small></span>{reminder.status ? <em>{reminder.status}</em> : null}</div>)}</div>
            </section>
          ) : null}

          {appointment.resultado || appointment.observacoes_internas ? (
            <section className={styles.section}>
              <div className={styles.sectionTitle}><CheckCircle2 size={17} /><div><h3>Resultado e informações internas</h3><p>Registro final do atendimento.</p></div></div>
              <div className={styles.internalGrid}><DetailValue label="Resultado" value={appointment.resultado} />{appointment.observacoes_internas ? <div className={styles.internalNote}><span>Observações internas</span><p>{appointment.observacoes_internas}</p></div> : null}</div>
            </section>
          ) : null}

          <section className={styles.section}>
            <div className={styles.sectionTitle}><History size={17} /><div><h3>Histórico</h3><p>Movimentações registradas neste agendamento.</p></div></div>
            {appointment.historico.length > 0 ? <div className={styles.timeline}>{appointment.historico.map((item) => <div key={item.id}><span /><div><strong>{item.acao.replaceAll("_", " ")}</strong><p>{item.descricao || "Alteração registrada."}</p><small>{autorHistorico(item, appointment)} · {dateTime(item.created_at)}</small></div></div>)}</div> : <div className={styles.empty}>Sem alterações registradas.</div>}
          </section>
        </div>

        <footer className={styles.footer}>
          <span>Última visualização dos dados atuais do calendário.</span>
          <div>{googleCalendarUrl ? <a className={styles.googleButton} href={googleCalendarUrl} target="_blank" rel="noopener noreferrer"><CalendarDays size={17} /> Abrir no Google Calendar</a> : null}<button type="button" className={styles.secondaryButton} onClick={onClose}>Fechar</button>{onEdit ? <button type="button" className={styles.editButton} onClick={onEdit}><Pencil size={16} /> Editar agendamento</button> : null}</div>
        </footer>
      </aside>
    </div>
  );
}
