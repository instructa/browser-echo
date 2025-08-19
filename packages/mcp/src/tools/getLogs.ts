import type { z } from 'zod'
import type {
  ErrorEnvelope,
  FetchSuccess,
  TProgressEvent,
} from '../schemas/logs'
import type { McpToolContext } from '../types'
import { FetchRequest } from '../schemas/deepwiki'

export function deepwikiTool({ mcp }: McpToolContext) {
  mcp.tool(
    'get_logs',
    'TODO:IMPLEMENT',
    FetchRequest.shape,
    async (input) => {
      // TODO: Implement
      // return {
      //   content: pages.map(page => ({
      //     type: 'text',
      //     text: `# ${page.path}\n\n${page.markdown}`,
      //   })),
      // }
    },
  )
}