"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Lock,
  Loader2,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface SharedReport {
  title: string;
  template: string;
  content: string;
  created_at: string;
  project_name: string;
  country: string | null;
}

type PageState =
  | { kind: "loading" }
  | { kind: "password_required" }
  | { kind: "report"; data: SharedReport }
  | { kind: "error"; message: string };

export default function SharedReportPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);

  const fetchReport = useCallback(async (pwd?: string) => {
    try {
      const url = new URL(`/api/shared/${token}`, window.location.origin);
      if (pwd) url.searchParams.set("password", pwd);

      const res = await fetch(url.toString());
      const data = await res.json();

      if (res.status === 401) {
        setState({ kind: "password_required" });
      } else if (!res.ok) {
        setState({ kind: "error", message: data.error ?? "Report not found" });
      } else {
        setState({ kind: "report", data });
      }
    } catch {
      setState({ kind: "error", message: "Failed to load report" });
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void fetchReport();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchReport]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setChecking(true);
    await fetchReport(password.trim());
    setChecking(false);
  };

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <AlertTriangle className="mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Report Not Available</h2>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              {state.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.kind === "password_required") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Password Required</CardTitle>
            <CardDescription>
              This report is password protected. Enter the password to view it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={!password.trim() || checking}
              >
                {checking ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="mr-2 h-4 w-4" />
                )}
                View Report
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const report = state.data;

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Branding */}
      <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
        <img src="/aksum_white.svg" alt="Aksum" className="h-4 w-4" />
        <span className="font-medium">Aksum</span>
        <span>·</span>
        <span>Shared Report</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">{report.title}</h1>
        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{report.project_name}</span>
          <Badge variant="secondary" className="text-xs">
            {report.template.replace(/_/g, " ")}
          </Badge>
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(report.created_at).toLocaleDateString()}
          </span>
          {report.country && <span>{report.country}</span>}
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Report Content */}
      <article className="prose prose-sm dark:prose-invert mx-auto max-w-none rounded-lg border bg-background p-8">
        <ReactMarkdown>{report.content}</ReactMarkdown>
      </article>

      {/* Footer */}
      <div className="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">
        <p>
          Generated by Aksum Knowledge Platform ·{" "}
          {new Date(report.created_at).toLocaleDateString()}
        </p>
        <p className="mt-1">CONFIDENTIAL — Shared for authorized viewing only</p>
      </div>
    </div>
  );
}
