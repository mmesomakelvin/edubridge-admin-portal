import type { ProgramContent } from './content-schema'
import type { Issue } from './validate'

/** Issues the server returned for one specific draft (the reducer makes a new object on every edit). */
export interface ServerIssues {
  draft: ProgramContent
  issues: Issue[]
}

/** Server issues only count while the draft they were about is still on screen. */
export function liveServerIssues(server: ServerIssues | null, draft: ProgramContent): Issue[] {
  return server && server.draft === draft ? server.issues : []
}
