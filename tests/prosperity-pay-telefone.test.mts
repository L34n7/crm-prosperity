import assert from "node:assert/strict";
import test from "node:test";
import {
  getValidBuyerPhoneOrNull,
  shouldFillMissingCompanyPhone,
} from "../src/lib/checkout/buyer-validation.ts";

test("telefone obrigatório do cadastro é normalizado antes de criar empresa", () => {
  assert.equal(getValidBuyerPhoneOrNull("(31) 99999-1234"), "31999991234");
  assert.equal(getValidBuyerPhoneOrNull("+55 (31) 99999-1234"), "5531999991234");
  assert.equal(getValidBuyerPhoneOrNull("98991774037"), "98991774037");
});

test("webhook não usa telefones ausentes ou inválidos", () => {
  for (const value of [null, "", "123", "11111111111", "123456789012345"]) {
    assert.equal(getValidBuyerPhoneOrNull(value), null);
  }
});

test("somente empresa sem telefone pode ser preenchida pelo lead", () => {
  assert.equal(shouldFillMissingCompanyPhone(null, "98991774037"), true);
  assert.equal(shouldFillMissingCompanyPhone("", "98991774037"), true);
  assert.equal(shouldFillMissingCompanyPhone("  ", "(31) 99999-1234"), true);
  assert.equal(shouldFillMissingCompanyPhone("31999998888", "98991774037"), false);
  assert.equal(shouldFillMissingCompanyPhone(null, null), false);
});
