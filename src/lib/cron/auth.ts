type CronAuthOptions = {
  exigirVercelCron?: boolean;
};

export function validarChamadaCron(
  request: Request,
  options: CronAuthOptions = {}
) {
  const authHeader = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent") || "";
  const chamadaComSecret =
    !!process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const chamadaVercelCron = userAgent.includes("vercel-cron");
  const ok =
    chamadaComSecret &&
    (!options.exigirVercelCron || chamadaVercelCron);

  return {
    ok,
    userAgent,
    temAuthorization: Boolean(authHeader),
    chamadaVercelCron,
  };
}
