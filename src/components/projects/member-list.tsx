"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Mail,
  UserPlus,
  Shield,
  Pencil,
  Eye,
  Trash2,
  Clock,
  Loader2,
} from "lucide-react";
import type { UserRole } from "@/types/database";
import {
  inviteTeamMember,
  updateMemberRole,
  removeMember,
} from "@/app/(dashboard)/projects/[id]/members/actions";

interface MemberRow {
  id: string;
  user_id: string | null;
  role: UserRole;
  invited_email: string | null;
  created_at: string;
  profile: {
    full_name: string | null;
    id: string;
  } | null;
  email: string | null;
}

interface MemberListProps {
  projectId: string;
  members: MemberRow[];
}

const ROLE_CONFIG: Record<UserRole, { label: string; icon: typeof Shield; variant: "default" | "secondary" | "outline" }> = {
  owner: { label: "Owner", icon: Shield, variant: "default" },
  editor: { label: "Editor", icon: Pencil, variant: "secondary" },
  viewer: { label: "Viewer", icon: Eye, variant: "outline" },
};

export function MemberList({ projectId, members }: MemberListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviting, setInviting] = useState(false);

  // Remove dialog state
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    const result = await inviteTeamMember(projectId, inviteEmail, inviteRole);
    setInviting(false);

    if (result.error) {
      toast.error("Invitation failed", { description: result.error });
      return;
    }

    const message =
      result.status === "added"
        ? "Member added to project"
        : "Invitation email sent";
    toast.success(message);
    setInviteEmail("");
    startTransition(() => router.refresh());
  };

  const handleRoleChange = async (memberId: string, newRole: UserRole) => {
    const result = await updateMemberRole(projectId, memberId, newRole);
    if (result.error) {
      toast.error("Failed to update role", { description: result.error });
      return;
    }
    toast.success("Role updated");
    startTransition(() => router.refresh());
  };

  const handleRemove = async () => {
    if (!removeTarget) return;

    const result = await removeMember(projectId, removeTarget.id);
    setRemoveTarget(null);

    if (result.error) {
      toast.error("Failed to remove member", { description: result.error });
      return;
    }
    toast.success("Member removed");
    startTransition(() => router.refresh());
  };

  const activeMembers = members.filter((m) => m.user_id !== null);
  const pendingInvites = members.filter((m) => m.user_id === null);

  return (
    <div className="space-y-8">
      {/* Invite Form */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-medium">Invite Team Member</h3>
        <form onSubmit={handleInvite} className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label htmlFor="invite-email" className="text-xs text-muted-foreground">
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="pl-9"
                required
              />
            </div>
          </div>
          <div className="w-32 space-y-1">
            <label className="text-xs text-muted-foreground">Role</label>
            <Select
              value={inviteRole}
              onValueChange={(v) => setInviteRole(v as "editor" | "viewer")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
            {inviting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Invite
          </Button>
        </form>
      </div>

      {/* Active Members */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          Members ({activeMembers.length})
        </h3>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className="w-40">Role</TableHead>
                <TableHead className="w-36">Joined</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeMembers.map((member) => {
                const config = ROLE_CONFIG[member.role];
                const displayName =
                  member.profile?.full_name || member.email || "Unknown";

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{displayName}</p>
                        {member.email && member.profile?.full_name && (
                          <p className="text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.role === "owner" ? (
                        <Badge variant={config.variant}>
                          <config.icon className="mr-1 h-3 w-3" />
                          {config.label}
                        </Badge>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(v) =>
                            handleRoleChange(member.id, v as UserRole)
                          }
                          disabled={isPending}
                        >
                          <SelectTrigger className="h-8 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(member.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {member.role !== "owner" && (
                        <Dialog
                          open={removeTarget?.id === member.id}
                          onOpenChange={(open) =>
                            setRemoveTarget(open ? member : null)
                          }
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Remove Team Member</DialogTitle>
                              <DialogDescription>
                                Are you sure you want to remove{" "}
                                <span className="font-medium text-foreground">
                                  {displayName}
                                </span>{" "}
                                from this project? They will lose access to all
                                project interviews and data.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() => setRemoveTarget(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={handleRemove}
                              >
                                Remove Member
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Pending Invitations ({pendingInvites.length})
          </h3>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-40">Role</TableHead>
                  <TableHead className="w-36">Invited</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((invite) => {
                  const config = ROLE_CONFIG[invite.role];
                  return (
                    <TableRow key={invite.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {invite.invited_email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant}>
                          <config.icon className="mr-1 h-3 w-3" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(invite.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Dialog
                          open={removeTarget?.id === invite.id}
                          onOpenChange={(open) =>
                            setRemoveTarget(open ? invite : null)
                          }
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Revoke Invitation</DialogTitle>
                              <DialogDescription>
                                Cancel the pending invitation for{" "}
                                <span className="font-medium text-foreground">
                                  {invite.invited_email}
                                </span>
                                ? They will not be able to join this project.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() => setRemoveTarget(null)}
                              >
                                Keep
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={handleRemove}
                              >
                                Revoke
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
