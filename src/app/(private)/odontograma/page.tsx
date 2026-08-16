import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Promise<{
    paciente_id?: string | string[];
  }>;
};

export default async function OdontogramaLegacyPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const pacienteId = Array.isArray(params.paciente_id)
    ? params.paciente_id[0]
    : params.paciente_id;

  const query = new URLSearchParams({ aba: "odontograma" });
  if (pacienteId) query.set("paciente_id", pacienteId);

  redirect(`/pacientes?${query.toString()}`);
}
