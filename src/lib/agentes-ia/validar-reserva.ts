// Nunca use em consultas UUID os campos de uma reserva inexistente.
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarReservaAgenteIa(valor: unknown): boolean {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const reserva = valor as Record<string, unknown>;
  return (
    ["id", "empresa_id", "agente_id", "conversa_id"].every(
      (campo) => typeof reserva[campo] === "string" && UUID_VALIDO.test(reserva[campo] as string),
    ) &&
    typeof reserva.versao === "number" &&
    Number.isInteger(reserva.versao) &&
    reserva.versao > 0
  );
}
