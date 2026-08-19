import assert from "node:assert/strict";
import test from "node:test";
import { buildRecentMessagePage } from "../src/lib/conversas/message-pagination.ts";

test("limita uma conversa extensa às mensagens mais recentes", () => {
  const messagesDescending = Array.from(
    { length: 2_563 },
    (_, index) => 2_563 - index
  );

  const page = buildRecentMessagePage(messagesDescending, 30);

  assert.equal(page.messages.length, 30);
  assert.equal(page.messages[0], 2_534);
  assert.equal(page.messages.at(-1), 2_563);
  assert.equal(page.hasMoreHistory, true);
});

test("mantém ordem cronológica quando não existe mais histórico", () => {
  const page = buildRecentMessagePage([2, 1], 30);

  assert.deepEqual(page.messages, [1, 2]);
  assert.equal(page.hasMoreHistory, false);
});

test("aplica limite seguro quando o valor recebido não é válido", () => {
  const messagesDescending = Array.from(
    { length: 40 },
    (_, index) => 40 - index
  );

  const page = buildRecentMessagePage(messagesDescending, Number.NaN);

  assert.equal(page.messages.length, 30);
  assert.deepEqual(page.messages, Array.from({ length: 30 }, (_, index) => index + 11));
  assert.equal(page.hasMoreHistory, true);
});
