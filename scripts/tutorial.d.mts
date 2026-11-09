// Types for the test that imports scripts/tutorial.mjs.

/** A fenced block of a Markdown text: the info string's first word, the lines between the fences, and the line of the opening fence. */
export interface Block {
  lang: string;
  lines: string[];
  line: number;
}

/** A command a replayed block runs, the lines the tutorial shows under it, and its line in the tutorial. A JSON block's command is its step's hook. */
export interface Command {
  command: string | null;
  expected: string[];
  line: number;
}

/** What a step asks of the PreToolUse hook: a tool call, as Claude Code hands it over. */
export interface Hook {
  tool_name: string;
  file: string;
  tool_input: Record<string, unknown>;
}

export interface Step {
  first?: string;
  hook?: Hook;
  before?: (replay: unknown) => void;
  exits?: Record<string, number | number[]>;
}

export declare const TUTORIAL: string;
export declare const TOOLS: string[];
export declare const STEPS: Step[];
export declare function isReplayed(block: Block): boolean;
export declare function blocksOf(text: string): Block[];
export declare function versionsOf(text: string): Record<string, string>;
export declare function commandsOf(block: Block): Command[];
export declare function normalize(line: string): string;
export declare function lineMatches(expected: string, actual: string): boolean;
export declare function outputMatches(expected: string[], actual: string[]): boolean;
export declare function pair(blocks: Block[], steps?: Step[]): { pairs: { block: Block; step: Step; commands: Command[] }[]; faults: string[] };
export declare function exitOf(step: Step, command: string, seen?: number): number;
export declare function main(argv: string[]): number;
