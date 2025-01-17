import React, { useState, useEffect } from 'react';
import { Database, AlertCircle, XCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { db } from '../lib/database';

interface DatabaseMonitor {
  isAdmin: boolean;
}

export default function DatabaseMonitor({ isAdmin }: DatabaseMonitor) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastErrorTime, setLastErrorTime] = useState<Date | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const unsubscribe = db.onConnectionChange((connected) => {
      setIsConnected(connected);
      if (!connected) {
        setLastErrorTime(new Date());
        setLastError('Database connection lost. Check your network connection or database server status.');
      }
    });

    return () => unsubscribe();
  }, []);

  const handleRetry = async () => {
    try {
      setIsRetrying(true);
      const response = await fetch('/api/health');
      const data = await response.json();
      setIsConnected(data.database === 'connected');
      if (data.database === 'connected') {
        setLastError(null);
        setLastErrorTime(null);
      }
    } catch (error) {
      setLastError('Failed to reconnect to database. Please try again.');
      setLastErrorTime(new Date());
    } finally {
      setIsRetrying(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg shadow-lg ${
          isConnected 
            ? 'bg-green-500 text-white' 
            : 'bg-red-500 text-white animate-pulse'
        }`}
      >
        <Database className="h-5 w-5" />
        <span>{isConnected ? 'Database Connected' : 'Connection Lost'}</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Database Status</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                {isConnected ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )}
                <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              {lastError && (
                <div className="bg-red-50 p-3 rounded-lg">
                  <p className="text-sm text-red-600">{lastError}</p>
                  {lastErrorTime && (
                    <p className="text-xs text-red-500 mt-1">
                      Last error: {lastErrorTime.toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={handleRetry}
                disabled={isRetrying || isConnected}
                className={`w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg ${
                  isRetrying || isConnected
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? 'Retrying...' : 'Retry Connection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}