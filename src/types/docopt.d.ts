declare module 'docopt' {
  export function docopt(
    doc: string,
    options?: { argv?: string[]; help?: boolean; version?: string }
  ): Record<string, any>;
}
