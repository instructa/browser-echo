import { z } from 'zod';

// Shapes for MCP tool params (no casts)
export const GetLogsArgs = {
  level: z.array(z.enum(['log','info','warn','error','debug'])).optional().describe('Filter by log levels'),
  session: z.string().optional().describe('8-char session id prefix'),
  includeStack: z.boolean().optional().default(false).describe('Include stack traces in text view'),
  limit: z.number().int().min(1).max(5000).optional().describe('Max number of entries to return'),
  contains: z.string().optional().describe('Substring filter on entry.text'),
  sinceMs: z.number().nonnegative().optional().describe('Only entries with time >= sinceMs'),
  // New: byte-offset cursor for JSONL files; when provided, return entries whose starting byte offset > sinceId
  sinceId: z.number().int().nonnegative().optional().describe('Return entries with byteOffset > sinceId (file-based mode)'),
  project: z.string().optional().describe('Project name to filter logs')
} satisfies z.ZodRawShape;

export const ClearLogsArgs = {
  session: z.string().optional().describe('8-char session id prefix to clear only one session'),
  project: z.string().optional().describe('Project name to clear only that project\'s logs')
} satisfies z.ZodRawShape;

// Full Zod objects for local inference/validation
export const GetLogsSchema = z.object(GetLogsArgs).strict();
export const ClearLogsSchema = z.object(ClearLogsArgs).strict();

export type TGetLogs = z.infer<typeof GetLogsSchema>;
export type TClearLogs = z.infer<typeof ClearLogsSchema>;