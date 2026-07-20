"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleDollarSign,
  CreditCard,
  RefreshCw,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import styles from "./growth.module.css";

export type GrowthDetailRow = {
  id: string;
  empresa: string;
  responsavel?: string;
  email?: string;
  plano?: string;
  data?: string;
  valor?: string;
  status?: string;
  observacao?: string;
};

export type GrowthCardData = {
  id: string;
  label: string;
  value: string;
  detail: string;
  icon: "users" | "refresh" | "money" | "card" | "wallet" | "trend" | "alert";
  modalTitle: string;
  modalDescription: string;
  rows: GrowthDetailRow[];
};

const icons = {
  users: Users,
  refresh: RefreshCw,
  money: CircleDollarSign,
  card: CreditCard,
  wallet: WalletCards,
  trend: TrendingUp,
  alert: AlertTriangle,
};

function statusClass(status?: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("bloque")) return "danger";
  if (normalized.includes("venc")) return "warning";
  if (normalized.includes("ativa") || normalized.includes("confirm")) return "success";
  return "neutral";
}

export default function GrowthKpiCards({ cards }: { cards: GrowthCardData[] }) {
  const [active, setActive] = useState<GrowthCardData | null>(null);

  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => event.key === "Escape" && setActive(null);
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [active]);

  const pendingValue = useMemo(() => {
    if (!active || active.id !== "aguardando-renovacao") return null;
    return active.rows.reduce((total, row) => {
      const raw = String(row.valor || "").replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
      const value = Number(raw);
      return Number.isFinite(value) ? total + value : total;
    }, 0);
  }, [active]);

  return (
    <>
      <section className="gk-grid">
        {cards.map((card) => {
          const Icon = icons[card.icon];
          return (
            <button
              key={card.id}
              type="button"
              className={`gk-card gk-card-${card.icon}`}
              onClick={() => setActive(card)}
              aria-label={`Abrir detalhes de ${card.label}`}
              aria-haspopup="dialog"
            >
              <span className="gk-icon"><Icon size={22} /></span>
              <span className="gk-label">{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
              <em>Ver detalhes <span aria-hidden>→</span></em>
            </button>
          );
        })}
      </section>

      {active && (
        <div className="gk-overlay" onMouseDown={() => setActive(null)}>
          <section
            className="gk-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="growth-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className={styles.eyebrow}>Detalhamento</span>
                <h2 id="growth-modal-title">{active.modalTitle}</h2>
                <p>{active.modalDescription}</p>
              </div>
              <button type="button" onClick={() => setActive(null)} aria-label="Fechar modal"><X size={20} /></button>
            </header>

            <div className="gk-summary">
              <div><span>Total</span><strong>{active.value}</strong></div>
              <div><span>Registros</span><strong>{active.rows.length}</strong></div>
              {pendingValue != null && <div><span>Valor pendente</span><strong>{pendingValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>}
            </div>

            {active.rows.length === 0 ? (
              <p className={styles.empty}>Nenhum registro encontrado.</p>
            ) : (
              <>
                <div className="gk-table-wrap">
                  <table>
                    <thead><tr><th>Empresa</th><th>Responsável</th><th>Plano / oferta</th><th>Data</th><th>Valor</th><th>Situação</th></tr></thead>
                    <tbody>
                      {active.rows.map((row, index) => (
                        <tr key={`${row.id}-${index}`}>
                          <td><strong>{row.empresa}</strong><small>{row.email || ""}</small></td>
                          <td>{row.responsavel || "Não informado"}</td>
                          <td>{row.plano || "Não informado"}</td>
                          <td>{row.data || "Não informado"}</td>
                          <td>{row.valor || "—"}</td>
                          <td><span className={`gk-status ${statusClass(row.status)}`}>{row.status || row.observacao || "Confirmado"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="gk-mobile-list">
                  {active.rows.map((row, index) => (
                    <article key={`${row.id}-mobile-${index}`}>
                      <div className="gk-mobile-head">
                        <div><strong>{row.empresa}</strong><small>{row.email || "Sem e-mail informado"}</small></div>
                        <span className={`gk-status ${statusClass(row.status)}`}>{row.status || row.observacao || "Confirmado"}</span>
                      </div>
                      <dl>
                        <div><dt>Responsável</dt><dd>{row.responsavel || "Não informado"}</dd></div>
                        <div><dt>Plano / oferta</dt><dd>{row.plano || "Não informado"}</dd></div>
                        <div><dt>Data</dt><dd>{row.data || "Não informado"}</dd></div>
                        <div><dt>Valor</dt><dd>{row.valor || "—"}</dd></div>
                      </dl>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <style jsx>{`
        .gk-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.gk-card{position:relative;display:grid;min-width:0;gap:8px;padding:18px;text-align:left;font:inherit;background:linear-gradient(145deg,rgba(255,255,255,.98),rgba(248,250,252,.92));border:1px solid rgba(148,163,184,.24);border-radius:20px;box-shadow:0 12px 30px rgba(15,23,42,.06);cursor:pointer;overflow:hidden;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}.gk-card:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:var(--accent)}.gk-card:hover{transform:translateY(-3px);box-shadow:0 18px 36px rgba(15,23,42,.12);border-color:color-mix(in srgb,var(--accent) 35%,transparent)}.gk-card-users{--accent:#2563eb;--soft:#dbeafe}.gk-card-refresh{--accent:#f59e0b;--soft:#fef3c7}.gk-card-money{--accent:#8b5cf6;--soft:#ede9fe}.gk-card-card{--accent:#10b981;--soft:#d1fae5}.gk-card-wallet{--accent:#0f172a;--soft:#e2e8f0}.gk-card-trend{--accent:#06b6d4;--soft:#cffafe}.gk-card-alert{--accent:#ef4444;--soft:#fee2e2}.gk-icon{display:grid;place-items:center;width:42px;height:42px;color:var(--accent);background:var(--soft);border-radius:14px}.gk-label{color:#64748b;font-size:.82rem;font-weight:800}.gk-card strong{color:#0f172a;font-size:clamp(1.35rem,2.4vw,1.7rem);line-height:1.15;overflow-wrap:anywhere}.gk-card small{color:#94a3b8;font-size:.78rem;line-height:1.45}.gk-card em{display:flex;align-items:center;justify-content:space-between;margin-top:3px;color:var(--accent);font-size:.74rem;font-style:normal;font-weight:900}.gk-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:rgba(2,6,23,.76);backdrop-filter:blur(10px)}.gk-modal{display:grid;width:min(1120px,100%);max-height:86vh;padding:24px;background:linear-gradient(145deg,#fff,#f8fafc);border:1px solid rgba(255,255,255,.7);border-radius:24px;box-shadow:0 30px 80px rgba(2,6,23,.35);overflow:hidden}.gk-modal header{display:flex;justify-content:space-between;gap:18px;padding-bottom:16px;border-bottom:1px solid #e2e8f0}.gk-modal h2{margin:5px 0;color:#0f172a}.gk-modal p{margin:0;color:#64748b;line-height:1.5}.gk-modal header button{display:grid;place-items:center;flex:0 0 auto;width:40px;height:40px;color:#475569;background:#f1f5f9;border:0;border-radius:12px;cursor:pointer}.gk-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:16px 0}.gk-summary>div{display:grid;gap:4px;padding:13px;background:#fff;border:1px solid #e2e8f0;border-radius:14px}.gk-summary span{color:#64748b;font-size:.72rem;font-weight:800;text-transform:uppercase}.gk-summary strong{color:#0f172a;font-size:1.3rem}.gk-table-wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:16px}.gk-table-wrap table{width:100%;border-collapse:collapse;background:#fff}.gk-table-wrap th,.gk-table-wrap td{padding:12px 10px;text-align:left;white-space:nowrap;border-bottom:1px solid #edf2f7}.gk-table-wrap th{color:#64748b;font-size:.7rem;letter-spacing:.05em;text-transform:uppercase}.gk-table-wrap td{color:#334155;font-size:.82rem}.gk-table-wrap td small{display:block;color:#94a3b8}.gk-status{display:inline-flex;padding:5px 9px;font-size:.72rem;font-weight:900;border-radius:999px}.gk-status.success{color:#047857;background:#d1fae5}.gk-status.warning{color:#b45309;background:#fef3c7}.gk-status.danger{color:#b91c1c;background:#fee2e2}.gk-status.neutral{color:#475569;background:#e2e8f0}.gk-mobile-list{display:none}
        @media(max-width:1050px){.gk-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:720px){.gk-grid{grid-template-columns:1fr;gap:10px}.gk-card{padding:15px;border-radius:17px}.gk-overlay{align-items:end;padding:0}.gk-modal{width:100%;max-height:92vh;padding:16px;border-radius:24px 24px 0 0;overflow-y:auto}.gk-modal header{position:sticky;top:-16px;z-index:2;padding-top:4px;background:linear-gradient(145deg,#fff,#f8fafc)}.gk-summary{grid-template-columns:1fr 1fr}.gk-summary>div:last-child:nth-child(3){grid-column:1/-1}.gk-table-wrap{display:none}.gk-mobile-list{display:grid;gap:12px}.gk-mobile-list article{display:grid;gap:14px;padding:15px;background:#fff;border:1px solid #e2e8f0;border-radius:17px;box-shadow:0 8px 20px rgba(15,23,42,.06)}.gk-mobile-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.gk-mobile-head>div{min-width:0}.gk-mobile-head strong{display:block;color:#0f172a;overflow-wrap:anywhere}.gk-mobile-head small{display:block;margin-top:3px;color:#94a3b8;overflow-wrap:anywhere}.gk-mobile-list dl{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0}.gk-mobile-list dl div{min-width:0}.gk-mobile-list dt{color:#94a3b8;font-size:.68rem;font-weight:800;text-transform:uppercase}.gk-mobile-list dd{margin:3px 0 0;color:#334155;font-size:.82rem;overflow-wrap:anywhere}}
        @media(prefers-color-scheme:dark){.gk-card,.gk-modal{background:linear-gradient(145deg,#111827,#0f172a);border-color:#1e293b}.gk-card strong,.gk-modal h2,.gk-summary strong,.gk-mobile-head strong{color:#f8fafc}.gk-card small,.gk-modal p{color:#94a3b8}.gk-summary>div,.gk-table-wrap table,.gk-mobile-list article{background:#111827;border-color:#1e293b}.gk-table-wrap{border-color:#1e293b}.gk-table-wrap th,.gk-table-wrap td{border-color:#1e293b}.gk-table-wrap td,.gk-mobile-list dd{color:#cbd5e1}.gk-modal header{border-color:#1e293b}.gk-modal header button{color:#cbd5e1;background:#1e293b}@media(max-width:720px){.gk-modal header{background:linear-gradient(145deg,#111827,#0f172a)}}}
      `}</style>
    </>
  );
}
