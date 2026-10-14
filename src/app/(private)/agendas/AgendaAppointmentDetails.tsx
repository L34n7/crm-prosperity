"use client";
import { CalendarDays, CheckCircle2, Pencil } from "lucide-react";
import AgendaAppointmentHero from "./AgendaAppointmentHero";
import AgendaAppointmentMainSections from "./AgendaAppointmentMainSections";
import AgendaAppointmentRelatedSection from "./AgendaAppointmentRelatedSection";
import AgendaAppointmentSecondarySections from "./AgendaAppointmentSecondarySections";
import type { AgendaAppointmentDetail } from "./AgendaAppointmentDetails.types";
import styles from "./AgendaAppointmentDetails.module.css";
export type { AgendaAppointmentDetail } from "./AgendaAppointmentDetails.types";
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
  onRealize?: () => void;
};
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
  onRealize,
}: Props) {
  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-details-title"
      >
        <AgendaAppointmentHero
          appointment={appointment}
          statusLabels={statusLabels}
          onClose={onClose}
        />
        <div className={styles.body}>
          <AgendaAppointmentMainSections
            appointment={appointment}
            calendarName={calendarName}
            customerLabel={customerLabel}
            isHealthNiche={isHealthNiche}
          />
          <AgendaAppointmentRelatedSection
            links={appointment.vinculos}
            relatedTypeLabels={relatedTypeLabels}
          />
          <AgendaAppointmentSecondarySections
            appointment={appointment}
            customerLabel={customerLabel}
          />
        </div>
        <footer className={styles.footer}>
          <span>Última visualização dos dados atuais do calendário.</span>
          <div>
            {googleCalendarUrl ? (
              <a
                className={styles.googleButton}
                href={googleCalendarUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <CalendarDays size={17} /> Abrir no Google Calendar
              </a>
            ) : null}
            {onRealize ? (
              <button
                type="button"
                className={styles.realizeButton}
                onClick={onRealize}
              >
                <CheckCircle2 size={16} /> Registrar resultado
              </button>
            ) : null}
            {onEdit ? (
              <button
                type="button"
                className={styles.editButton}
                onClick={onEdit}
              >
                <Pencil size={16} /> Editar agendamento
              </button>
            ) : null}
          </div>
        </footer>
      </aside>
    </div>
  );
}
