import { journalDate, parseDateArg } from "../bujo/journal-date.js";
import { loadConfig, requireVault, type VaultConfig } from "../config.js";
import type { Ctx } from "./context.js";

/** Loads the vault config and picks the date: `--date` if given, otherwise the current journal date. */
export function vaultAndDate(
  ctx: Ctx,
  dateArg: string | undefined,
): { config: VaultConfig; date: string } {
  const config = requireVault(loadConfig(ctx.env, ctx.homedir));
  const date =
    dateArg === undefined ? journalDate(ctx.now(), config.dayStartHour) : parseDateArg(dateArg);
  return { config, date };
}
