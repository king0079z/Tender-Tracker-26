// Azure PostgreSQL configuration
export const dbConfig = {
  host: process.env.WEBSITE_PRIVATE_IP || process.env.PGHOST || 'tender-tracking-db2.postgres.database.azure.com',
  database: process.env.WEBSITE_DBNAME || process.env.PGDATABASE || 'postgres',
  user: process.env.WEBSITE_DBUSER || process.env.PGUSER || 'abouefletouhm',
  password: process.env.WEBSITE_DBPASSWORD || process.env.PGPASSWORD || process.env.AZURE_POSTGRESQL_PASSWORD,
  port: parseInt(process.env.WEBSITE_DBPORT || process.env.PGPORT || '5432', 10),
  ssl: {
    rejectUnauthorized: false
  },
  // Connection pool configuration
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
};

// Validate configuration
export const validateConfig = () => {
  if (!dbConfig.password || typeof dbConfig.password !== 'string') {
    throw new Error('Database password is not properly configured');
  }
  return true;
};