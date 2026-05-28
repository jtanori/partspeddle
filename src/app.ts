import express from 'express';
import { logger } from './shared/observability/logger.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.get('/health/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
});

app.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'live' });
});

app.listen(PORT, () => {
  logger.info(`VINTRACK API listening on port ${PORT}`);
});

export { app };
