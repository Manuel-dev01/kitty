import postgres from 'postgres';

/** int8 columns round-trip as JS bigint, so money is never a float coming out of the database either. */
export function makeSql(url: string, options: postgres.Options<{}> = {}) {
  return postgres(url, {
    // Neon's pooled URL goes through PgBouncer in transaction mode, which can't hold prepared statements.
    prepare: false,
    ...options,
    types: { bigint: postgres.BigInt },
    onnotice: () => {},
  });
}

export type Sql = ReturnType<typeof makeSql>;

let client: Sql | undefined;

/** Lazily connects on first use, so importing a module never needs a database. */
export function getSql(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    client = makeSql(url);
  }
  return client;
}
