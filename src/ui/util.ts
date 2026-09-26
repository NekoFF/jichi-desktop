/** Kleine gemeinsame Helfer der Oberfläche. */

import { useSyncExternalStore } from "react";
import {
  agent,
  onSprache,
  sprache,
  t,
  type Snapshot,
  type Sprache,
} from "../core/index.ts";

export const useAgent = (): Snapshot =>
  useSyncExternalStore(agent.subscribe, agent.getSnapshot);

/**
 * Die Sprache der Oberfläche, und neu zeichnen, wenn sie wechselt. Die Wurzel
 * ruft das; jede Komponente hinter `memo()` ruft es selbst, sonst bliebe sie
 * in der alten Sprache stehen.
 */
export const useSprache = (): Sprache => useSyncExternalStore(onSprache, sprache);

export const IS_MAC = /Mac/i.test(navigator.userAgent);
/** Die Tastenkombination so, wie sie auf dieser Plattform heisst. */
export const kurz = (taste: string) => (IS_MAC ? `⌘${taste}` : `${t("Strg")}+${taste}`);

export const kurzTaste = (taste: string) =>
  IS_MAC ? `⌘${taste}` : `${t("Strg")}+${taste.replace("⇧", `${t("Umschalt")}+`)}`;

export const nachricht = (ursache: unknown) =>
  ursache instanceof Error ? ursache.message : String(ursache);
