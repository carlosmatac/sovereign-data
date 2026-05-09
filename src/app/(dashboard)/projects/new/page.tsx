"use client";

import { useState } from "react";
import { createProject } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { CountrySelect } from "@/components/projects/country-select";

export default function NewProjectPage() {
  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");

  const handleSubmit = async (formData: FormData) => {
    setLoading(true);

    if (country) formData.set("country", country);
    if (region) formData.set("region", region);

    const result = await createProject(formData);

    if (result?.error) {
      toast.error("Failed to create project", {
        description: result.error,
      });
      setLoading(false);
      return;
    }

    toast.success("Project created");
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/projects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Projects
        </Link>
      </div>

      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>New Project</CardTitle>
          <CardDescription>
            Create a knowledge project to organize sources by
            country or region.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. Nigeria Energy Sector 2026"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Brief description of the knowledge focus..."
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
                  placeholder="Auto-assigned from country"
                  className="bg-muted cursor-default"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" type="button" asChild>
                <Link href="/projects">Cancel</Link>
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Project
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
