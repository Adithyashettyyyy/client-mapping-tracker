import { MappingDesk } from "@/components/mapping-desk/MappingDesk";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [
    { title: APP_TITLE },
    { name: "description", content: "Client mapping progress and review tracker." },
  ];
}

export default function HomeRoute() {
  return <MappingDesk />;
}
