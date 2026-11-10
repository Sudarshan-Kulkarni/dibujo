import { randomInt } from "node:crypto";

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const MAX_ID_ATTEMPTS = 100;
const TRAILING_ID = /\s\^([A-Za-z0-9-]+)\s*$/gm;

/** Six random base36 characters, like the block ids Obsidian makes. */
export function randomBlockId(): string {
  let id = "";
  for (let i = 0; i < 6; i++) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return id;
}

/** The block ids at the end of any line in a note. */
export function usedBlockIds(content: string): Set<string> {
  return new Set([...content.matchAll(TRAILING_ID)].flatMap((m) => m[1] ?? []));
}

/** Gets an id from `newId` that isn't in `used`, and adds it to `used`. */
export function freshBlockId(used: Set<string>, newId: () => string): string {
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = newId();
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error("could not generate an unused block id");
}
