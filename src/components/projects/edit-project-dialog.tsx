"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateProject } from "@/app/(dashboard)/projects/actions";
import { CountrySelect } from "./country-select";

interface EditProjectDialogProps {
  project: {
    id: string;
    name: string;
    description: string | null;
    country: string | null;
    region: string | null;
  };
}

export function EditProjectDialog({ project }: EditProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState(project.country ?? "");
  const [region, setRegion] = useState(project.region ?? "");
  const router = useRouter();

  const handleSubmit = async (formData: FormData) => {
    setLoading(true);
    formData.set("country", country);
    formData.set("region", region);

    const result = await updateProject(project.id, formData);

    if (result?.error) {
      toast.error("Failed to update project", { description: result.error });
      setLoading(false);
      return;
    }

    toast.success("Project updated");
    setOpen(false);
    setLoading(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Edit Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update the project details. Only the owner can make changes.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Project Name *</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={project.name}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              name="description"
              defaultValue={project.description ?? ""}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Country</Label>
              <CountrySelect
                value={country}
                onSelect={(c, r) => { setCountry(c); setRegion(r); }}
              />
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Input
                value={region}
                readOnly
                tabIndex={-1}
                placeholder="Auto-assigned"
                className="bg-muted cursor-default"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
