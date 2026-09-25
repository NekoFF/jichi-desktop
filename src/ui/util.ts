/** Kleine gemeinsame Helfer der Oberfläche. */

import { useSyncExternalStore } from "react";
import {
  agent,
  type Snapshot,
} from "../core/index.ts";

export const useAgent = (): Snapshot =>
  useSyncExternalStore(agent.subscribe, agent.getSnapshot);

export const IS_MAC = /Mac/i.test(navigator.userAgent);
/** Die Tastenkombination so, wie sie auf dieser Plattform heisst. */
export const kurz = (taste: string) => (IS_MAC ? `⌘${taste}` : `Strg+${taste}`);

export const kurzTaste = (t: string) => (IS_MAC ? `⌘${t}` : `Strg+${t.replace("⇧", "Umschalt+")}`);

export const nachricht = (ursache: unknown) =>
  ursache instanceof Error ? ursache.message : String(ursache);
