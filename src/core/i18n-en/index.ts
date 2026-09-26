/**
 * Das englische Wörterbuch: deutscher Text → englischer Text. Ein Teil je
 * Bereich, damit Änderungen nicht alle in einer Datei zusammenstoßen.
 */

import { KERN } from "./kern.ts";
import { EINGABE } from "./eingabe.ts";
import { EINSTELLUNGEN } from "./einstellungen.ts";
import { VERLAUF } from "./verlauf.ts";
import { PANEL } from "./panel.ts";

export const EN: Readonly<Record<string, string>> = {
  ...KERN,
  ...EINGABE,
  ...EINSTELLUNGEN,
  ...VERLAUF,
  ...PANEL,
};
