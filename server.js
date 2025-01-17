import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import compression from 'compression';
import pg from 'pg';
const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Enable gzip compression
app.use(compression());
app.use(express.json());

// Parse Azure connection string if available
const getAzureDbConfig = () => {
  const connectionString = process.env.AZURE_POSTGRESQL_CONNECTIONSTRING;
  if (connectionString) {
    try {
      // Parse connection string format: postgres://user:password@host:port/database
      const url = new URL(connectionString);
      return {
        host: url.hostname,
        user: url.username,
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1),
        port: parseInt(url.port || '5432', 10)
      };
    } catch (error) {
      console.error('Failed to parse connection string:', error);
    }
  }
  return null;
};

// Database configuration
const azureConfig = getAzureDbConfig();
const dbConfig = {
  host: process.env.WEBSITE_PRIVATE_IP || process.env.PGHOST || azureConfig?.host || 'tender-tracking-db2.postgres.database.azure.com',
  database: process.env.WEBSITE_DBNAME || process.env.PGDATABASE || azureConfig?.database || 'postgres',
  user: process.env.WEBSITE_DBUSER || process.env.PGUSER || azureConfig?.user || 'abouefletouhm',
  password: process.env.WEBSITE_DBPASSWORD || process.env.PGPASSWORD || azureConfig?.password || process.env.AZURE_POSTGRESQL_PASSWORD,
  port: parseInt(process.env.WEBSITE_DBPORT || process.env.PGPORT || (azureConfig?.port?.toString()) || '5432', 10),
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
};

// Ensure password is a string and not undefined
if (!dbConfig.password || typeof dbConfig.password !== 'string') {
  console.error('Database password is not properly configured');
  console.error('Please set one of the following environment variables:');
  console.error('- WEBSITE_DBPASSWORD (Azure Web App setting)');
  console.error('- PGPASSWORD (PostgreSQL environment variable)');
  console.error('- AZURE_POSTGRESQL_PASSWORD (Azure PostgreSQL password)');
  console.error('- AZURE_POSTGRESQL_CONNECTIONSTRING (Full connection string)');
  process.exit(1);
}

// Create a connection pool
const pool = new Pool(dbConfig);

// Health check endpoint with detailed status
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let dbError = null;

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    dbStatus = 'connected';
  } catch (error) {
    console.error('Database health check failed:', error);
    dbError = error.message;
  }

  res.json({
    status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    error: dbError,
    uptime: process.uptime(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      port: PORT,
      host: dbConfig.host,
      database: dbConfig.database,
      user: dbConfig.user,
      isAzure: !!process.env.WEBSITE_PRIVATE_IP
    }
  });
});

// Database query endpoint
app.post('/api/query', async (req, res) => {
  let client;
  try {
    const { text, params } = req.body;
    
    if (!text) {
      return res.status(400).json({
        error: true,
        message: 'Query text is required'
      });
    }

    client = await pool.connect();
    const result = await client.query(text, params);
    res.json({
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields
    });
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ 
      error: true,
      message: error.message
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// Serve static files
app.use(express.static(join(__dirname)));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  if (pool) {
    try {
      await pool.end();
      console.log('Database connection closed');
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initialize server with retry logic
const startServer = async (retryCount = 0, maxRetries = 5) => {
  try {
    // Test database connection before starting server
    console.log('Testing database connection...');
    console.log('Database config:', {
      host: dbConfig.host,
      database: dbConfig.database,
      user: dbConfig.user,
      port: dbConfig.port,
      ssl: dbConfig.ssl,
      hasPassword: !!dbConfig.password
    });
    
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Database connection successful');

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check available at: http://localhost:${PORT}/api/health`);
      console.log('Environment:', {
        nodeEnv: process.env.NODE_ENV,
        port: PORT,
        host: dbConfig.host,
        database: dbConfig.database,
        user: dbConfig.user,
        isAzure: !!process.env.WEBSITE_PRIVATE_IP
      });
    });

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    
    if (retryCount < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      console.log(`Retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return startServer(retryCount + 1, maxRetries);
    }
    
    process.exit(1);
  }
};

startServer();