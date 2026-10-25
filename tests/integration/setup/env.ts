import 'dotenv/config';

import { testDatabaseUrl } from './global-setup';

// Every integration test file talks to the test database, never the dev database.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.APP_ENV = 'test';
