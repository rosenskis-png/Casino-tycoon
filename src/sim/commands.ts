// Command bus (FOUNDATIONS §1): the UI's only way to change the game. Each system contributes its own commands:
// it declares their shapes by augmenting CommandTypes and lists handlers in its `commands` table. A command
// validates against current state, then applies at the next tick boundary. Results go to the runtime log.
import type { Game } from "./game";
import type { System } from "./registry";

/**
 * Command payloads by type. Systems add entries with module augmentation:
 * `declare module "./commands" { interface CommandTypes { hire: { role: string } } }`
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CommandTypes {}

export type CommandType = keyof CommandTypes;
export type Command = { [K in CommandType]: { type: K } & CommandTypes[K] }[CommandType];
export type CommandOf<K extends CommandType> = Extract<Command, { type: K }>;

export interface CommandHandler<C> {
  /** Returns a player-readable reason when the command can't happen, else null. */
  validate(g: Game, c: C): string | null;
  apply(g: Game, c: C): void;
}
export type CommandTable<K extends CommandType> = { [P in K]: CommandHandler<CommandOf<P>> };

/** Collects every system's handlers; a command type claimed twice is a programming error. */
export function collectCommands(systems: System[]): Map<string, CommandHandler<Command>> {
  const out = new Map<string, CommandHandler<Command>>();
  for (const s of systems)
    for (const [type, h] of Object.entries(s.commands ?? {})) {
      if (out.has(type)) throw new Error(`command ${type} registered twice (${s.id})`);
      out.set(type, h as CommandHandler<Command>);
    }
  return out;
}
