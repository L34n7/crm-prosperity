type CronAuthOptions = {
  exigirVercelCron?: boolean;
  permitirQstash?: boolean;
};

export function validarChamadaCron(
  request: Request,
  options: CronAuthOptions = {}
) {
  const authHeader = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent") || "";
  const upstashSignature = request.headers.get("upstash-signature");
  const chamadaComSecret =
    !!process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const chamadaVercelCron = userAgent.includes("vercel-cron");
  const chamadaQstash = Boolean(upstashSignature);
  const permitirQstash = options.permitirQstash !== false;
  const origemAgendadorPermitida =
    !options.exigirVercelCron ||
    chamadaVercelCron ||
    (permitirQstash && chamadaQstash);
  const ok = chamadaComSecret && origemAgendadorPermitida;

  return {
    ok,
    userAgent,
    temAuthorization: Boolean(authHeader),
    chamadaVercelCron,
    chamadaQstash,
  };
}
