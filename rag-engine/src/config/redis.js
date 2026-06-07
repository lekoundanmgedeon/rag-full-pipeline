import Redis from 'ioredis';
import 'dotenv/config';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  lazyConnect:          true,
});

redis.on('error', (err) => console.error('Redis error:', err.message));

export const QUEUES = { INGESTION: 'rag:ingestion', EMBEDDING: 'rag:embedding' };
