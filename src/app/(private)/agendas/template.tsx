import type { ReactNode } from "react";
import Header from "@/components/Header";
import AgendaEnhancer from "./AgendaEnhancer";

const styles = `
.agendaTemplateShell > .a2 > header {
  display: none !important;
}

.agendaTemplateShell .a2 .wrap {
  width: 100%;
  max-width: none;
  padding: 8px 24px 28px;
}

.agendaTemplateShell .a2 .head {
  min-height: 70px;
  margin: 0 0 10px;
  padding: 10px 14px;
  border-radius: 18px;
  align-items: center;
}

.agendaTemplateShell .a2 .head > .agendaGoogleHeaderSlot {
  min-width: 260px;
  flex: 1;
}

.agendaGoogleHeaderSummary {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.agendaGoogleStatusDot {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--crm-text-soft);
  box-shadow: 0 0 0 5px var(--crm-surface-muted);
}

.agendaGoogleStatusDot.isConnected {
  background: var(--crm-success-strong);
  box-shadow: 0 0 0 5px var(--crm-success-bg);
}

.agendaGoogleHeaderText {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.agendaGoogleHeaderText strong {
  color: var(--crm-text-strong);
  font-size: 14px;
  font-weight: 900;
}

.agendaGoogleHeaderText small {
  max-width: 360px;
  overflow: hidden;
  color: var(--crm-text-muted);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.agendaTemplateShell .a2 .head .actions {
  gap: 7px;
}

.agendaTemplateShell .a2 .head .btn,
.agendaTemplateShell .a2 .head .select {
  height: 38px;
  min-height: 38px;
  border-radius: 11px;
}

.agendaTemplateShell .a2 .stats {
  height: 52px;
  margin: 0 0 10px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0;
  border: 1px solid var(--crm-border);
  border-radius: 16px;
  background: var(--crm-surface);
  box-shadow: var(--crm-shadow-xs);
  overflow: hidden;
}

.agendaTemplateShell .a2 .stat {
  min-height: 0;
  height: 50px;
  padding: 7px 12px;
  border: 0;
  border-right: 1px solid var(--crm-border);
  border-radius: 0;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agendaTemplateShell .a2 .stat:last-child {
  border-right: 0;
}

.agendaTemplateShell .a2 .stat::before {
  display: none;
}

.agendaTemplateShell .a2 .stat small {
  color: var(--crm-text-muted);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.15;
  text-transform: uppercase;
  letter-spacing: .03em;
}

.agendaTemplateShell .a2 .stat b {
  margin: 0;
  color: var(--crm-text-strong);
  font-size: 20px;
  line-height: 1;
}

.agendaTemplateShell .a2 .layout {
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 10px;
}

.agendaTemplateShell .a2 .aside > .side:nth-child(2) {
  display: none;
}

.agendaTemplateShell .a2 .toolbar {
  min-height: 70px;
  padding: 10px 12px;
}

.agendaTemplateShell .a2 .grid {
  min-width: 840px;
  padding: 0;
  gap: 0;
  background: var(--crm-surface-soft);
}

.agendaTemplateShell .a2 .wd {
  height: 29px;
  padding: 0;
  border-right: 1px solid var(--crm-border);
  background: var(--crm-surface-soft);
  display: grid;
  place-items: center;
}

.agendaTemplateShell .a2 .wd:nth-child(7) {
  border-right: 0;
}

.agendaTemplateShell .a2 .day {
  width: 100%;
  height: 112px;
  min-height: 112px;
  max-height: 112px;
  padding: 5px;
  border: 0;
  border-right: 1px solid var(--crm-border);
  border-bottom: 1px solid var(--crm-border);
  border-radius: 0;
  overflow: hidden;
  transform: none !important;
  box-shadow: none;
}

.agendaTemplateShell .a2 .day:nth-child(7n) {
  border-right: 0;
}

.agendaTemplateShell .a2 .day.selected {
  box-shadow: inset 0 0 0 2px var(--crm-primary);
}

.agendaTemplateShell .a2 .dh {
  min-height: 22px;
  height: 22px;
}

.agendaTemplateShell .a2 .num {
  width: 21px;
  height: 21px;
  font-size: 10px;
}

.agendaTemplateShell .a2 .add {
  width: 21px;
  height: 21px;
  padding: 0;
  border-radius: 6px;
}

.agendaTemplateShell .a2 .event {
  min-height: 20px;
  height: 20px;
  margin-top: 3px;
  padding: 2px 5px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

.agendaTemplateShell .a2 .event b {
  min-width: 0;
  flex: 1;
  font-size: 9px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.agendaTemplateShell .a2 .event span {
  display: none;
}

.agendaTemplateShell .a2 .day > .pill {
  min-height: 16px;
  height: 16px;
  margin-top: 2px;
  padding: 0 3px;
  border: 0;
  background: transparent;
  color: var(--crm-text-strong);
  font-size: 9px;
  font-weight: 900;
}

.agendaTemplateShell .a2 .side {
  padding: 11px;
}

.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard {
  display: grid !important;
  grid-template-columns: auto 1fr;
  gap: 8px 12px;
  margin-top: 14px;
  padding: 13px;
  border: 1px solid var(--crm-primary-border);
  border-radius: 14px;
  background: var(--crm-primary-soft);
  box-shadow: none;
}

.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard h3 {
  margin: 0;
  color: var(--crm-text-strong);
  font-size: 13px;
}

.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard .mini {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.agendaTemplateShell .a2 .modal .agendaGoogleConfigCard .mini:last-child {
  grid-column: 1 / -1;
  margin-top: 0 !important;
}

.agendaGoogleCreateOption {
  margin-top: 14px;
  padding: 13px;
  border: 1px solid var(--crm-primary-border);
  border-radius: 14px;
  background: var(--crm-primary-soft);
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.agendaGoogleCreateIcon {
  width: 38px;
  height: 38px;
  border: 1px solid var(--crm-primary-border);
  border-radius: 12px;
  background: var(--crm-surface);
  color: var(--crm-primary-text);
  display: grid;
  place-items: center;
  font-size: 16px;
  font-weight: 900;
}

.agendaGoogleCreateText {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.agendaGoogleCreateText strong {
  color: var(--crm-text-strong);
  font-size: 12px;
}

.agendaGoogleCreateText span {
  color: var(--crm-text-muted);
  font-size: 10px;
  line-height: 1.35;
}

.agendaGoogleCreateToggle {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--crm-text-strong);
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}

.agendaGoogleCreateToggle input {
  width: 17px;
  height: 17px;
  accent-color: var(--crm-primary-strong);
}

@media (max-width: 1100px) {
  .agendaTemplateShell .a2 .layout {
    grid-template-columns: 1fr;
  }

  .agendaTemplateShell .a2 .aside {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .agendaTemplateShell .a2 .wrap {
    padding: 4px 10px calc(92px + env(safe-area-inset-bottom));
  }

  .agendaTemplateShell .a2 .head {
    align-items: stretch;
    flex-direction: column;
  }

  .agendaTemplateShell .a2 .head > .agendaGoogleHeaderSlot {
    min-width: 0;
  }

  .agendaGoogleHeaderText small {
    max-width: calc(100vw - 80px);
  }

  .agendaTemplateShell .a2 .head .actions {
    width: 100%;
  }

  .agendaTemplateShell .a2 .head .actions .select {
    width: 100%;
  }

  .agendaTemplateShell .a2 .stats {
    display: flex;
    overflow-x: auto;
  }

  .agendaTemplateShell .a2 .stat {
    min-width: 150px;
    flex: 0 0 150px;
  }

  .agendaGoogleCreateOption {
    grid-template-columns: 38px 1fr;
  }

  .agendaGoogleCreateToggle {
    grid-column: 1 / -1;
  }
}
`;

export default function AgendasTemplate({ children }: { children: ReactNode }) {
  return (
    <>
      <Header
        title="Agendamentos"
        subtitle="Organize compromissos, clientes, responsáveis e lembretes em uma agenda completa."
      />
      <style>{styles}</style>
      <AgendaEnhancer />
      <div className="agendaTemplateShell">{children}</div>
    </>
  );
}
