import { z } from 'zod';

// Shapes for MCP tool params (no casts)
export const GetLogsArgs = {
  level: z.array(z.enum(['log','info','warn','error','debug'])).optional().describe('Filter by log levels'),
  session: z.string().optional().describe('8-char session id prefix'),
  includeStack: z.boolean().optional().default(false).describe('Include stack traces in text view'),
  limit: z.number().int().min(1).max(5000).optional().describe('Max number of entries to return'),
  contains: z.string().optional().describe('Substring filter on entry.text'),
  sinceMs: z.number().nonnegative().optional().describe('Only entries with time >= sinceMs'),
  project: z.string().optional().describe('Project name to filter logs')
} satisfies z.ZodRawShape;

export const GetNetworkLogsArgs = {
  session: z.string().optional().describe('8-char session id prefix'),
  project: z.string().optional().describe('Project name to filter network logs'),
  method: z.array(z.enum(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'])).optional().describe('HTTP methods'),
  statusMin: z.number().int().min(0).max(999).optional().describe('Minimum HTTP status'),
  statusMax: z.number().int().min(0).max(999).optional().describe('Maximum HTTP status'),
  urlContains: z.string().optional().describe('Substring match on URL'),
  errorsOnly: z.boolean().optional().default(false).describe('Only error network entries'),
  limit: z.number().int().min(1).max(5000).optional().describe('Max entries to return'),
  sinceMs: z.number().nonnegative().optional().describe('Only entries with time >= sinceMs')
} satisfies z.ZodRawShape;

export const ClearLogsArgs = {
  session: z.string().optional().describe('8-char session id prefix to clear only one session'),
  project: z.string().optional().describe('Project name to clear only that project\'s logs')
} satisfies z.ZodRawShape;

// Full Zod objects for local inference/validation
export const GetLogsSchema = z.object(GetLogsArgs).strict();
export const ClearLogsSchema = z.object(ClearLogsArgs).strict();
export const GetNetworkLogsSchema = z.object(GetNetworkLogsArgs).strict();

export type TGetLogs = z.infer<typeof GetLogsSchema>;
export type TClearLogs = z.infer<typeof ClearLogsSchema>;
export type TGetNetworkLogs = z.infer<typeof GetNetworkLogsSchema>;