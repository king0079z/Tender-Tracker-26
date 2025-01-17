export interface DatabaseConfig {
  host: string;
  database: string;
  user: string;
  password: string;
  port: number;
  ssl: {
    rejectUnauthorized: boolean;
  };
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  keepAlive?: boolean;
  keepAliveInitialDelayMillis?: number;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  fields?: Array<{
    name: string;
    dataTypeID: number;
  }>;
}