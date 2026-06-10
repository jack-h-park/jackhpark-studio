// Registers a module hook that stubs out CSS imports (including CSS modules)
// so component test files can be executed under `node --test` without a bundler.
import { register } from "node:module";

register(new URL("css-stub-hooks.mjs", import.meta.url));
