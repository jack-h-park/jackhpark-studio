import assert from "node:assert";
import { describe, it } from "node:test";

import {
  isThemePreference,
  LEGACY_THEME_KEYS,
  resolveDarkMode,
  THEME_NOFLASH_SCRIPT,
  THEME_PREFERENCE_KEY,
} from "@/lib/theme";

void describe("resolveDarkMode", () => {
  void it("follows the device when the preference is system", () => {
    assert.strictEqual(resolveDarkMode("system", true), true);
    assert.strictEqual(resolveDarkMode("system", false), false);
  });

  void it("keeps an explicit choice whatever the device says", () => {
    assert.strictEqual(resolveDarkMode("light", true), false);
    assert.strictEqual(resolveDarkMode("dark", false), true);
  });
});

void describe("isThemePreference", () => {
  void it("accepts only the three options", () => {
    for (const value of ["system", "light", "dark"]) {
      assert.ok(isThemePreference(value));
    }
    for (const value of [
      null,
      "",
      "auto",
      "true",
      '{"dark":true,"sys":false}',
    ]) {
      assert.ok(!isThemePreference(value));
    }
  });
});

void describe("THEME_NOFLASH_SCRIPT", () => {
  void it("reads the same key and clears the earlier models' keys", () => {
    assert.ok(THEME_NOFLASH_SCRIPT.includes(`'${THEME_PREFERENCE_KEY}'`));
    for (const key of LEGACY_THEME_KEYS) {
      assert.ok(THEME_NOFLASH_SCRIPT.includes(`"${key}"`));
    }
  });
});
