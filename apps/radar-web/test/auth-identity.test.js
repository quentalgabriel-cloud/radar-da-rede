import assert from "node:assert/strict";
import { it } from "node:test";
import { isEmailIdentifier, resolveLoginIdentifier } from "../public/auth-identity.js";

it("maps the administrative username to its Supabase identity", () => {
  assert.equal(resolveLoginIdentifier("SUPERADMIN"), "superadmin@radardarede.invalid");
  assert.equal(resolveLoginIdentifier(" superadmin "), "superadmin@radardarede.invalid");
});

it("preserves regular email login and only allows email signup", () => {
  assert.equal(resolveLoginIdentifier("pessoa@example.com"), "pessoa@example.com");
  assert.equal(isEmailIdentifier("pessoa@example.com"), true);
  assert.equal(isEmailIdentifier("SUPERADMIN"), false);
});
