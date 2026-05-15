import { createClient } from "@/lib/supabase/server";
import { NetworkExplorerV2 } from "@/components/network/network-explorer-v2";

export default async function NetworkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <NetworkExplorerV2 />
    </div>
  );
}
