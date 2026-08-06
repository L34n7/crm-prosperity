"use client";

import { Plus, X } from "lucide-react";

export type AgendaDayInterval = {
  id?: string;
  nome: string;
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
};

export type AgendaAvailabilityDay = {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
  intervalos: AgendaDayInterval[];
};

type Props = {
  days: AgendaAvailabilityDay[];
  dayNames: string[];
  onChange: (days: AgendaAvailabilityDay[]) => void;
};

export default function AgendaAvailabilityEditor({
  days,
  dayNames,
  onChange,
}: Props) {
  const updateDay = (index: number, patch: Partial<AgendaAvailabilityDay>) =>
    onChange(
      days.map((day, position) =>
        position === index ? { ...day, ...patch } : day,
      ),
    );

  const updateInterval = (
    dayIndex: number,
    intervalIndex: number,
    patch: Partial<AgendaDayInterval>,
  ) =>
    updateDay(dayIndex, {
      intervalos: days[dayIndex].intervalos.map((interval, position) =>
        position === intervalIndex ? { ...interval, ...patch } : interval,
      ),
    });

  return (
    <div className="availability">
      {days.map((day, dayIndex) => (
        <div className="avDay" key={day.dia_semana}>
          <div className="av">
            <b>{dayNames[day.dia_semana]}</b>
            <input
              type="time"
              value={day.hora_inicio.slice(0, 5)}
              disabled={!day.ativo}
              aria-label={`Início de ${dayNames[day.dia_semana]}`}
              onChange={(event) =>
                updateDay(dayIndex, { hora_inicio: event.target.value })
              }
            />
            <input
              type="time"
              value={day.hora_fim.slice(0, 5)}
              disabled={!day.ativo}
              aria-label={`Fim de ${dayNames[day.dia_semana]}`}
              onChange={(event) =>
                updateDay(dayIndex, { hora_fim: event.target.value })
              }
            />
            <button
              type="button"
              className={`toggle ${day.ativo ? "y" : ""}`}
              aria-label={day.ativo ? "Desativar dia" : "Ativar dia"}
              aria-pressed={day.ativo}
              onClick={() => updateDay(dayIndex, { ativo: !day.ativo })}
            />
          </div>

          {day.ativo ? (
            <div className="avBreaks">
              <div className="avBreakHead">
                <span>Intervalos do dia · {day.intervalos.length}/5</span>
                <button
                  type="button"
                  className="btn avAddBreak"
                  disabled={day.intervalos.length >= 5}
                  onClick={() =>
                    updateDay(dayIndex, {
                      intervalos: [
                        ...day.intervalos,
                        {
                          nome: `Intervalo ${day.intervalos.length + 1}`,
                          hora_inicio: "12:00",
                          hora_fim: "13:00",
                          ativo: true,
                        },
                      ],
                    })
                  }
                >
                  <Plus size={16} />
                  Adicionar intervalo
                </button>
              </div>

              {day.intervalos.map((interval, intervalIndex) => (
                <div className="avBreak" key={interval.id || intervalIndex}>
                  <input
                    value={interval.nome}
                    placeholder="Ex.: Almoço"
                    maxLength={80}
                    aria-label="Nome do intervalo"
                    onChange={(event) =>
                      updateInterval(dayIndex, intervalIndex, {
                        nome: event.target.value,
                      })
                    }
                  />
                  <input
                    type="time"
                    value={interval.hora_inicio.slice(0, 5)}
                    aria-label="Início do intervalo"
                    onChange={(event) =>
                      updateInterval(dayIndex, intervalIndex, {
                        hora_inicio: event.target.value,
                      })
                    }
                  />
                  <input
                    type="time"
                    value={interval.hora_fim.slice(0, 5)}
                    aria-label="Fim do intervalo"
                    onChange={(event) =>
                      updateInterval(dayIndex, intervalIndex, {
                        hora_fim: event.target.value,
                      })
                    }
                  />
                  <button
                    type="button"
                    className="remove"
                    aria-label="Remover intervalo"
                    onClick={() =>
                      updateDay(dayIndex, {
                        intervalos: day.intervalos.filter(
                          (_, position) => position !== intervalIndex,
                        ),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}

              {day.intervalos.length === 0 ? (
                <div className="avBreakEmpty">
                  Nenhum intervalo configurado para este dia.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
