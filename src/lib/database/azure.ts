import { Client, Pool } from 'pg';
import { DatabaseConfig } from './types';

const config: DatabaseConfig = {
  host: process.env.PGHOST || 'tender-tracking-db2.postgres.database.azure.com',
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'abouefletouhm',
  port: parseInt(process.env.PGPORT || '5432', 10),
  password: process.env.PGPASSWORD || '',
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
};

class AzureDatabase {
  private pool: Pool;
  private static instance: AzureDatabase;
  private isConnected: boolean = false;
  private connectionListeners: Set<(isConnected: boolean) => void> = new Set();
  private reconnectTimer: number | null = null;
  private healthCheckTimer: number | null = null;

  private constructor() {
    this.pool = new Pool(config);
    this.setupPoolErrorHandling();
    this.startHealthCheck();
  }

  private setupPoolErrorHandling() {
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      this.handleConnectionError();
    });

    this.pool.on('connect', () => {
      this.isConnected = true;
      this.notifyListeners(true);
    });
  }

  private startHealthCheck() {
    // Clear existing timer
    if (this.healthCheckTimer) {
      window.clearInterval(this.healthCheckTimer);
    }

    // Start new health check interval
    this.healthCheckTimer = window.setInterval(async () => {
      try {
        const client = await this.pool.connect();
        await client.query('SELECT 1');
        client.release();
        
        if (!this.isConnected) {
          this.isConnected = true;
          this.notifyListeners(true);
        }
      } catch (error) {
        this.handleConnectionError();
      }
    }, 5000); // Check every 5 seconds
  }

  private handleConnectionError() {
    this.isConnected = false;
    this.notifyListeners(false);

    // Attempt to reconnect
    if (!this.reconnectTimer) {
      this.reconnectTimer = window.setTimeout(async () => {
        try {
          await this.connect();
          this.reconnectTimer = null;
        } catch (error) {
          console.error('Reconnection failed:', error);
          this.reconnectTimer = null;
        }
      }, 5000); // Wait 5 seconds before attempting to reconnect
    }
  }

  static getInstance() {
    if (!AzureDatabase.instance) {
      AzureDatabase.instance = new AzureDatabase();
    }
    return AzureDatabase.instance;
  }

  async connect() {
    if (this.isConnected) return true;

    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      this.isConnected = true;
      this.notifyListeners(true);
      console.log('Connected to Azure Database');
      return true;
    } catch (error) {
      this.isConnected = false;
      this.notifyListeners(false);
      console.error('Failed to connect to Azure Database:', error);
      throw error;
    }
  }

  async query(text: string, params?: any[]) {
    if (!this.isConnected) {
      throw new Error('Database is not connected');
    }

    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (error) {
      console.error('Query error:', error);
      if (this.isConnectionError(error)) {
        this.handleConnectionError();
      }
      throw error;
    }
  }

  private isConnectionError(error: any): boolean {
    return error.code === 'ECONNRESET' || 
           error.code === 'EPIPE' || 
           error.code === '57P01' ||
           error.message.includes('connection');
  }

  onConnectionChange(listener: (isConnected: boolean) => void) {
    this.connectionListeners.add(listener);
    // Immediately notify the listener of the current state
    listener(this.isConnected);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  private notifyListeners(isConnected: boolean) {
    this.connectionListeners.forEach(listener => listener(isConnected));
  }

  async end() {
    if (this.healthCheckTimer) {
      window.clearInterval(this.healthCheckTimer);
    }
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
    }
    await this.pool.end();
    this.isConnected = false;
    this.notifyListeners(false);
  }

  getIsConnected() {
    return this.isConnected;
  }
}

export const db = AzureDatabase.getInstance();