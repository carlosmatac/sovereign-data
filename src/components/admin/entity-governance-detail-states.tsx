import Link from "next/link";
import { Button } from "@/components/ui/button";

export function EntityGovernanceNotFound({ id }: { id: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-10 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        Entity not found
      </h1>
      <p className="text-muted-foreground text-sm">
        No row with this ID exists in the database, or it is not visible to the
        governance loader. Use the list to pick a canonical entity.
      </p>
      <p className="font-mono text-xs break-all text-muted-foreground">
        {id}
      </p>
      <Button asChild>
        <Link href="/admin/entities">Back to entity list</Link>
      </Button>
    </div>
  );
}

export function EntityGovernanceLoadError({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 p-10 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        Could not load entity
      </h1>
      <p className="text-muted-foreground text-sm">
        Something went wrong while loading this record. You can return to the
        list and try again.
      </p>
      <p className="text-destructive text-xs break-words">{message}</p>
      <Button asChild>
        <Link href="/admin/entities">Back to entity list</Link>
      </Button>
    </div>
  );
}
