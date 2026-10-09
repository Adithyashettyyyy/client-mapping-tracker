import { appBasePath, appPath } from "@agent-native/core/client/api-path";
import { useAgentRouteState } from "@agent-native/core/client/navigation";

import { TAB_ID } from "@/lib/tab-id";

export interface NavigationState {
  view: string;
  path?: string;
  clientId?: string;
  country?: string;
  poc?: string;
  status?: string;
  query?: string;
  creatingClient?: boolean;
}

export function useNavigationState() {
  useAgentRouteState<NavigationState>({
    browserTabId: TAB_ID,
    requestSource: TAB_ID,
    getNavigationState: ({ pathname, searchParams }) => ({
      view: pathname === "/" ? searchParams.get("view") ?? "overview" : viewForPath(pathname),
      path: appPath(pathname),
      ...(searchParams.get("clientId") ? { clientId: searchParams.get("clientId")! } : {}),
      ...(searchParams.get("country") ? { country: searchParams.get("country")! } : {}),
      ...(searchParams.get("poc") ? { poc: searchParams.get("poc")! } : {}),
      ...(searchParams.get("status") ? { status: searchParams.get("status")! } : {}),
      ...(searchParams.get("q") ? { query: searchParams.get("q")! } : {}),
      ...(searchParams.get("new") === "1" ? { creatingClient: true } : {}),
    }),
    getCommandPath: (command) =>
      routerPath(command.path || pathForCommand(command)),
  });
}

function viewForPath(pathname: string): string {
  if (pathname === "/") return "home";
  return "home";
}

function pathForCommand(command: any): string {
  const params = new URLSearchParams();
  if (typeof command?.view === "string" && command.view !== "overview") params.set("view", command.view);
  for (const key of ["clientId", "country", "poc", "status", "q"]) {
    if (typeof command?.[key] === "string" && command[key]) params.set(key, command[key]);
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function routerPath(path: string): string {
  const basePath = appBasePath();
  if (!basePath) return path;
  if (path === basePath) return "/";
  if (path.startsWith(`${basePath}/`)) {
    return path.slice(basePath.length) || "/";
  }
  return path;
}
