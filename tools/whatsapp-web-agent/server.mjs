import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3784);
const ROOT_DIR = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT_DIR, ".data");
const PROFILE_DIR = path.join(DATA_DIR, "whatsapp-profile");
const TOKEN_FILE = path.join(DATA_DIR, "agent-token.txt");
const WHATSAPP_URL = "https://web.whatsapp.com/";
const MAX_BODY_BYTES = 256 * 1024;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://crmprosperity.com",
  "https://www.crmprosperity.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const allowedOrigins = new Set(
  String(process.env.CRM_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

let browserContext = null;
let whatsappPage = null;
let preparedMessage = null;
let agentToken = "";

async function loadOrCreateToken() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const existing = (await readFile(TOKEN_FILE, "utf8")).trim();
    if (existing) return existing;
  } catch {}

  const nextToken = randomBytes(24).toString("hex");
  await writeFile(TOKEN_FILE, nextToken + "\n", { mode: 0o600 });
  return nextToken;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return allowedOrigins.has(origin);
}

function applyCors(req, res) {
  const origin = String(req.headers.origin || "");

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Prosperity-Agent-Token",
  );
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Cache-Control", "no-store");
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function ensureAuthorized(req, res) {
  const received = String(req.headers["x-prosperity-agent-token"] || "").trim();

  if (!received || received !== agentToken) {
    sendJson(res, 401, { ok: false, error: "Token do agente local inválido." });
    return false;
  }

  return true;
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("Corpo da requisição excede o limite permitido.");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function normalizeCadenceSeconds(value) {
  const numeric = Number(value);
  return [3, 5, 10, 20].includes(numeric) ? numeric : 5;
}

async function waitStage(page, cadenceSeconds) {
  await page.waitForTimeout(normalizeCadenceSeconds(cadenceSeconds) * 1000);
}

async function getWhatsappPage() {
  if (!browserContext) return null;

  const pages = browserContext.pages().filter((item) => !item.isClosed());
  if (
    whatsappPage &&
    !whatsappPage.isClosed() &&
    whatsappPage.url().includes("web.whatsapp.com")
  ) {
    return whatsappPage;
  }

  whatsappPage =
    pages.find((item) => item.url().includes("web.whatsapp.com")) ||
    pages[0] ||
    (await browserContext.newPage());

  return whatsappPage;
}

async function launchBrowser() {
  if (browserContext) {
    const existingPage = await getWhatsappPage();
    if (existingPage) {
      if (!existingPage.url().includes("web.whatsapp.com")) {
        await existingPage.goto(WHATSAPP_URL, { waitUntil: "domcontentloaded" });
      }
      await existingPage.bringToFront();
      return existingPage;
    }
  }

  await mkdir(PROFILE_DIR, { recursive: true });

  browserContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });

  browserContext.on("close", () => {
    browserContext = null;
    whatsappPage = null;
    preparedMessage = null;
  });

  const pages = browserContext.pages();
  whatsappPage = pages[0] || (await browserContext.newPage());

  if (!whatsappPage.url().includes("web.whatsapp.com")) {
    await whatsappPage.goto(WHATSAPP_URL, { waitUntil: "domcontentloaded" });
  }

  await whatsappPage.bringToFront();
  return whatsappPage;
}

async function isWhatsappConnected() {
  const page = await getWhatsappPage();
  if (!page) return false;

  try {
    return await page
      .locator("#pane-side, [data-testid='chat-list']")
      .first()
      .isVisible({ timeout: 1000 });
  } catch {
    return false;
  }
}

async function getStatus() {
  return {
    ok: true,
    browserOpen: Boolean(browserContext),
    whatsappConnected: await isWhatsappConnected(),
    currentChat: preparedMessage?.group || null,
    prepared: Boolean(preparedMessage),
  };
}

async function dismissBlockingDialogs(page) {
  const dialogs = page.locator('[role="dialog"][aria-modal="true"]');
  const count = await dialogs.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const dialog = dialogs.nth(index);

    try {
      if (!(await dialog.isVisible({ timeout: 250 }))) continue;
    } catch {
      continue;
    }

    const primaryActions = [
      dialog.getByRole("button", { name: /^continuar$/i }),
      dialog.getByRole("button", { name: /^continue$/i }),
      dialog.getByText(/^continuar$/i),
      dialog.getByText(/^continue$/i),
    ];

    let dismissed = false;

    for (const action of primaryActions) {
      try {
        const target = action.first();
        if (await target.isVisible({ timeout: 250 })) {
          await target.click({ timeout: 2000 });
          dismissed = true;
          break;
        }
      } catch {}
    }

    if (!dismissed) {
      const closeCandidates = [
        dialog.getByRole("button", { name: /^(fechar|close)$/i }),
        dialog.locator('[aria-label="Fechar"]').first(),
        dialog.locator('[aria-label="Close"]').first(),
        dialog.locator('button').filter({ has: dialog.locator('svg') }).first(),
      ];

      for (const action of closeCandidates) {
        try {
          if (await action.isVisible({ timeout: 250 })) {
            await action.click({ timeout: 2000 });
            dismissed = true;
            break;
          }
        } catch {}
      }
    }

    if (dismissed) {
      await page.waitForTimeout(250);
    }
  }
}

async function findVisibleGroupOption(page) {
  const candidates = [
    page.getByRole("button", { name: /^(grupos|groups)(\s+\d+)?$/i }),
    page.getByRole("tab", { name: /^(grupos|groups)(\s+\d+)?$/i }),
    page.getByRole("menuitem", { name: /^(grupos|groups)(\s+\d+)?$/i }),
    page.getByText(/^(grupos|groups)(\s+\d+)?$/i),
  ];

  for (const candidate of candidates) {
    try {
      const target = candidate.first();
      if (await target.isVisible({ timeout: 300 })) return target;
    } catch {}
  }

  return null;
}

async function openFiltersOverflow(page) {
  const side = page.locator("#side").first();

  const semanticCandidates = [
    side.locator('[aria-haspopup="menu"]'),
    side.locator('[aria-haspopup="listbox"]'),
    side.locator('button[aria-expanded]'),
    side.locator('[role="button"][aria-expanded]'),
  ];

  for (const locator of semanticCandidates) {
    const count = await locator.count().catch(() => 0);

    for (let index = count - 1; index >= 0; index -= 1) {
      const candidate = locator.nth(index);

      try {
        if (!(await candidate.isVisible({ timeout: 150 }))) continue;

        const box = await candidate.boundingBox();
        if (!box || box.y > 190 || box.x > 520) continue;

        await candidate.click({ timeout: 1500 });
        await page.waitForTimeout(180);

        const groupOption = await findVisibleGroupOption(page);
        if (groupOption) return groupOption;

        await page.keyboard.press("Escape").catch(() => {});
      } catch {}
    }
  }

  const topButtons = side.locator('button, [role="button"]');
  const count = await topButtons.count().catch(() => 0);

  for (let index = count - 1; index >= 0; index -= 1) {
    const candidate = topButtons.nth(index);

    try {
      if (!(await candidate.isVisible({ timeout: 120 }))) continue;

      const box = await candidate.boundingBox();
      if (!box || box.y < 85 || box.y > 165 || box.x < 250 || box.x > 520) {
        continue;
      }

      await candidate.click({ timeout: 1200 });
      await page.waitForTimeout(180);

      const groupOption = await findVisibleGroupOption(page);
      if (groupOption) return groupOption;

      await page.keyboard.press("Escape").catch(() => {});
    } catch {}
  }

  return null;
}

async function ensureGroupsFilterActive(page) {
  await dismissBlockingDialogs(page);

  let groupOption = await findVisibleGroupOption(page);

  if (!groupOption) {
    groupOption = await openFiltersOverflow(page);
  }

  if (!groupOption) {
    throw new Error(
      "Não encontrei o filtro de grupos do WhatsApp Web. Abra a lista de conversas e tente novamente.",
    );
  }

  await groupOption.click({ timeout: 3000 });
  await page.waitForTimeout(300);
}

async function listGroups() {
  const page = await launchBrowser();

  if (!(await isWhatsappConnected())) {
    throw new Error("WhatsApp Web ainda não está conectado.");
  }

  await ensureGroupsFilterActive(page);

  const pane = page.locator("#pane-side").first();
  if (!(await pane.isVisible({ timeout: 1500 }))) {
    throw new Error("Não encontrei a lista de conversas do WhatsApp Web.");
  }

  const groups = new Set();
  let previousSize = -1;
  let stablePasses = 0;

  for (let pass = 0; pass < 80; pass += 1) {
    const listItems = pane.locator("div[role='listitem']");
    const rowItems = pane.locator("div[role='row']");
    const listItemCount = await listItems.count().catch(() => 0);
    const rows = listItemCount > 0 ? listItems : rowItems;

    const titles = await rows
      .evaluateAll((rowNodes) =>
        rowNodes
          .map((row) => {
            const candidates = Array.from(row.querySelectorAll("span[title]"))
              .filter((node) => {
                const title = String(node.getAttribute("title") || "").trim();
                if (!title) return false;

                const rect = node.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });

            if (!candidates.length) return "";

            const preferred =
              candidates.find(
                (node) => String(node.getAttribute("dir") || "") === "auto",
              ) || candidates[0];

            return String(preferred.getAttribute("title") || "").trim();
          })
          .filter(Boolean),
      )
      .catch(() => []);

    titles.forEach((title) => groups.add(title));

    if (groups.size === previousSize) {
      stablePasses += 1;
    } else {
      stablePasses = 0;
      previousSize = groups.size;
    }

    if (stablePasses >= 4) break;

    await pane.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.waitForTimeout(220);
  }

  return [...groups].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true }),
  );
}

async function findSearchBox(page) {
  const side = page.locator("#side").first();

  const candidates = [
    side.getByPlaceholder(/pesquisar.*(conversa|grupo)/i).first(),
    side.getByPlaceholder(/search.*(chat|group)/i).first(),
    side.locator("input[placeholder*='Pesquisar' i]").first(),
    side.locator("input[placeholder*='Search' i]").first(),
    side.locator("[contenteditable='true'][role='textbox']").first(),
    side.locator("[role='textbox']").first(),
  ];

  for (const candidate of candidates) {
    try {
      if (await candidate.isVisible({ timeout: 400 })) return candidate;
    } catch {}
  }

  return null;
}

async function findComposer(page) {
  const candidates = [
    page.locator("footer div[contenteditable='true'][role='textbox']").first(),
    page.locator("div[contenteditable='true'][data-tab='10']").first(),
  ];

  for (const candidate of candidates) {
    try {
      if (await candidate.isVisible({ timeout: 500 })) return candidate;
    } catch {}
  }

  return null;
}

async function openGroup(page, group, cadenceSeconds) {
  await ensureGroupsFilterActive(page);
  await waitStage(page, cadenceSeconds);

  const searchBox = await findSearchBox(page);

  if (!searchBox) {
    throw new Error("Não encontrei a busca de conversas do WhatsApp Web.");
  }

  await searchBox.fill("");
  await searchBox.fill(group);
  await waitStage(page, cadenceSeconds);

  const byTitle = page.getByTitle(group, { exact: true }).first();
  let clicked = false;

  try {
    if (await byTitle.isVisible({ timeout: 700 })) {
      await byTitle.click();
      clicked = true;
    }
  } catch {}

  if (!clicked) {
    const exactText = page.getByText(group, { exact: true }).first();
    if (await exactText.isVisible({ timeout: 900 })) {
      await exactText.click();
      clicked = true;
    }
  }

  if (!clicked) {
    throw new Error("Grupo não encontrado: " + group);
  }

  await waitStage(page, cadenceSeconds);
  await searchBox.fill("").catch(() => {});
}

async function prepareMessage(body) {
  const group = String(body?.group || "").trim();
  const message = String(body?.message || "");
  const cadenceSeconds = normalizeCadenceSeconds(body?.cadenceSeconds);

  if (!group) throw new Error("Informe o grupo.");
  if (!message.trim()) throw new Error("Informe a mensagem.");
  if (message.length > 8000) {
    throw new Error("A mensagem excede o limite de 8000 caracteres.");
  }

  const page = await launchBrowser();

  if (!(await isWhatsappConnected())) {
    throw new Error("WhatsApp Web ainda não está conectado.");
  }

  await openGroup(page, group, cadenceSeconds);

  const composer = await findComposer(page);
  if (!composer) {
    throw new Error("Não encontrei o campo de mensagem do grupo.");
  }

  await page.bringToFront();
  await waitStage(page, cadenceSeconds);
  await composer.fill("");
  await composer.fill(message);

  preparedMessage = {
    id: randomUUID(),
    group,
    message,
    cadenceSeconds,
    preparedAt: new Date().toISOString(),
  };

  return {
    ok: true,
    confirmationId: preparedMessage.id,
    group,
    preparedAt: preparedMessage.preparedAt,
  };
}

async function sendPreparedMessage(body) {
  const confirmationId = String(body?.confirmationId || "").trim();

  if (!preparedMessage || preparedMessage.id !== confirmationId) {
    throw new Error("A confirmação não corresponde à mensagem preparada.");
  }

  const page = await getWhatsappPage();
  if (!page) throw new Error("Navegador do WhatsApp Web não está aberto.");

  const composer = await findComposer(page);
  if (!composer) {
    throw new Error("Não encontrei a mensagem preparada no navegador.");
  }

  await page.bringToFront();
  await waitStage(
    page,
    body?.cadenceSeconds ?? preparedMessage.cadenceSeconds,
  );
  await composer.press("Enter");

  const sent = preparedMessage;
  preparedMessage = null;

  return {
    ok: true,
    group: sent.group,
    sentAt: new Date().toISOString(),
  };
}

async function cancelPreparedMessage(body) {
  const confirmationId = String(body?.confirmationId || "").trim();

  if (
    preparedMessage &&
    confirmationId &&
    preparedMessage.id !== confirmationId
  ) {
    throw new Error("A confirmação não corresponde à mensagem preparada.");
  }

  const page = await getWhatsappPage();
  const composer = page ? await findComposer(page) : null;
  await composer?.fill("").catch(() => {});
  preparedMessage = null;

  return { ok: true };
}

async function closeBrowser() {
  preparedMessage = null;

  if (browserContext) {
    await browserContext.close();
  }

  browserContext = null;
  whatsappPage = null;

  return { ok: true };
}

async function route(req, res) {
  applyCors(req, res);

  const origin = String(req.headers.origin || "");
  if (origin && !isAllowedOrigin(origin)) {
    sendJson(res, 403, { ok: false, error: "Origem não autorizada." });
    return;
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!ensureAuthorized(req, res)) return;

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/status") {
    sendJson(res, 200, await getStatus());
    return;
  }

  if (req.method === "POST" && url.pathname === "/browser/start") {
    await launchBrowser();
    sendJson(res, 200, await getStatus());
    return;
  }

  if (req.method === "POST" && url.pathname === "/browser/close") {
    sendJson(res, 200, await closeBrowser());
    return;
  }

  if (req.method === "GET" && url.pathname === "/groups") {
    sendJson(res, 200, { ok: true, groups: await listGroups() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/messages/prepare") {
    sendJson(res, 200, await prepareMessage(await readJsonBody(req)));
    return;
  }

  if (req.method === "POST" && url.pathname === "/messages/send") {
    sendJson(res, 200, await sendPreparedMessage(await readJsonBody(req)));
    return;
  }

  if (req.method === "POST" && url.pathname === "/messages/cancel") {
    sendJson(res, 200, await cancelPreparedMessage(await readJsonBody(req)));
    return;
  }

  sendJson(res, 404, { ok: false, error: "Rota não encontrada." });
}

async function main() {
  agentToken = await loadOrCreateToken();

  const server = createServer((req, res) => {
    route(req, res).catch((error) => {
      console.error("[Prosperity WhatsApp Web Agent]", error);
      if (!res.headersSent) applyCors(req, res);
      sendJson(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno do agente.",
      });
    });
  });

  server.listen(PORT, HOST, () => {
    console.log("");
    console.log("Prosperity WhatsApp Web Agent");
    console.log("---------------------------------------------");
    console.log(`Local: http://${HOST}:${PORT}`);
    console.log(`Token: ${agentToken}`);
    console.log("Origens permitidas:");
    [...allowedOrigins].forEach((origin) => console.log(" - " + origin));
    console.log("---------------------------------------------");
    console.log("A sessão do WhatsApp permanece somente nesta máquina.");
    console.log("");
  });

  const shutdown = async () => {
    console.log("\nEncerrando agente local...");
    if (browserContext) await browserContext.close().catch(() => {});
    server.close(() => process.exit(0));
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

await main();
