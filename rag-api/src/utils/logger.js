import { createLogger, format, transports } from 'winston'
import 'dotenv/config'

const { combine, timestamp, colorize, printf, json, errors } = format

const devFmt = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, ...meta }) => {
    const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
    return `${timestamp} ${level}: ${message}${extra}`
  })
)

const prodFmt = combine(timestamp(), errors({ stack: true }), json())

export const logger = createLogger({
  level:      process.env.LOG_LEVEL || 'info',
  format:     process.env.NODE_ENV === 'production' ? prodFmt : devFmt,
  transports: [new transports.Console()],
})

export const logIngestion = (documentId, event, data = {}) =>
  logger.info(event, { documentId, ...data, context: 'ingestion' })
