import { redirect } from "next/navigation";

type OdontogramaLegacyPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OdontogramaLegacyPage({
  searchParams,
}: OdontogramaLegacyPageProps) {
  const paramsOrigem = await searchParams;
  const pacienteIdBruto = paramsOrigem.paciente_id;
  const pacienteId = Array.isArray(pacienteIdBruto)
    ? pacienteIdBruto[0]
    : pacienteIdBruto;
  const paramsDestino = new URLSearchParams({ aba: "odontograma" });

  if (pacienteId) {
    paramsDestino.set("paciente_id", pacienteId);
  }

  redirect(`/prontuarios?${paramsDestino.toString()}`);
}
