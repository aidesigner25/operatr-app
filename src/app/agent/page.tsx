import { AgentWorkspace } from "@/components/agent/AgentWorkspace";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export default function AgentPage() {
  return <DashboardShell><AgentWorkspace /></DashboardShell>;
}
