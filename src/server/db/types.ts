import type { Db } from './client';

/** A database handle or an open transaction; services accept either so they compose. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;
