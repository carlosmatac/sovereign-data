"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Share2, Copy, Link2, Link2Off, Loader2, Lock } from "lucide-react";
import {
  shareReport,
  unshareReport,
} from "@/app/(dashboard)/reports/[id]/actions";

interface ShareReportButtonProps {
  reportId: string;
  currentToken: string | null;
  hasPassword: boolean;
}

export function ShareReportButton({
  reportId,
  currentToken,
  hasPassword,
}: ShareReportButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [sharing, setSharing] = useState(false);

  const shareUrl = currentToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/shared/${currentToken}`
    : null;

  const handleShare = async () => {
    setSharing(true);
    const result = await shareReport(reportId, password || undefined);
    setSharing(false);

    if (result.error) {
      toast.error("Failed to share report", { description: result.error });
      return;
    }

    toast.success(
      password ? "Report shared with password protection" : "Report shared"
    );
    setPassword("");
    startTransition(() => router.refresh());
  };

  const handleUnshare = async () => {
    const result = await unshareReport(reportId);
    if (result.error) {
      toast.error("Failed to revoke sharing", { description: result.error });
      return;
    }
    toast.success("Sharing link revoked");
    startTransition(() => router.refresh());
  };

  const handleCopy = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="mr-2 h-4 w-4" />
          {currentToken ? "Shared" : "Share"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share Report</DialogTitle>
          <DialogDescription>
            {currentToken
              ? "This report is currently shared via a public link."
              : "Create a public link anyone can use to view this report."}
          </DialogDescription>
        </DialogHeader>

        {currentToken ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Shareable link</Label>
              <div className="flex gap-2">
                <Input value={shareUrl ?? ""} readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {hasPassword && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Password protected
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={handleUnshare}
                disabled={isPending}
              >
                <Link2Off className="mr-2 h-4 w-4" />
                Revoke Link
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="share-password">
                Password{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="share-password"
                type="password"
                placeholder="Leave blank for no password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If set, viewers must enter this password to see the report.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleShare} disabled={sharing}>
                {sharing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-2 h-4 w-4" />
                )}
                Create Link
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
