import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Promise<{
    paciente_id?: string | string[];
    aba?: string | string[];
  }>;
};

function primeiroValor(valor?: string | string[]) {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function ProntuariosLegacyPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  const pacienteId = primeiroValor(params.paciente_id);
  const aba = primeiroValor(params.aba);

  if (pacienteId) query.set("paciente_id", pacienteId);
  if (aba) query.set("aba", aba);

  const sufixo = query.toString();
  redirect(sufixo ? `/pacientes?${sufixo}` : "/pacientes");
}
