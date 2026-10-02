import type { ReactNode } from "react";
import type { Company } from "../../../lib/api";
import { lineScope } from "../../../lib/workspaceScope";
import { TenantChatProvider } from "../../../components/chat/TenantWorkspace";

export function ChatProvider({ line, children }: { line: Company; children: ReactNode }) {
  return <TenantChatProvider key={line.id} scope={lineScope(line.id)} tenant={line}>{children}</TenantChatProvider>;
}
