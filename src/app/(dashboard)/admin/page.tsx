export default function AdminHomePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6 md:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Platform administration
        </h1>
        <p className="text-muted-foreground text-sm">
          Governance tools for operators with the{" "}
          <span className="text-foreground font-medium">
            platform administrator
          </span>{" "}
          role. This area is separate from project roles (owner / editor / viewer).
        </p>
      </div>
      <p className="text-muted-foreground text-sm">
        The entity governance dashboard will be added under{" "}
        <span className="text-foreground font-medium">/admin</span> when that
        feature ships (
        <code className="bg-muted rounded px-1 py-0.5 text-xs">
          admin-entity-governance-dashboard
        </code>
        ).
      </p>
    </div>
  );
}
