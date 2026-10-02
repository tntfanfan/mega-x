import type { ReactNode } from "react";
import type { Company } from "../../../lib/api";
import { companyScope } from "../../../lib/workspaceScope";
import { TenantChatProvider } from "../../../components/chat/TenantWorkspace";

export function ChatProvider({ company, children }: { company: Company; children: ReactNode }) {
  return <TenantChatProvider key={company.id} scope={companyScope(company.id)} tenant={company}>{children}</TenantChatProvider>;
}
