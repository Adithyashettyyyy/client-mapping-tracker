import { AgentSidebar } from "@agent-native/toolkit/app/chat";
import { HeaderActionsProvider } from "@agent-native/toolkit/app-shell";

import { TAB_ID } from "@/lib/tab-id";

interface LayoutProps {
  children: React.ReactNode;
}

/** Mapping Desk application shell with a persistent contextual agent rail. */
export function Layout({ children }: LayoutProps) {
  return (
    <HeaderActionsProvider>
      <AgentSidebar position="right" storageKey="mapping-desk" browserTabId={TAB_ID}>
        <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
          <main className="agent-native-app-main min-w-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </main>
        </div>
      </AgentSidebar>
    </HeaderActionsProvider>
  );
}
