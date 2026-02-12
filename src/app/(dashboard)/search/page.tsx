"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, Sparkles, Shield, Mic } from "lucide-react";

export default function SearchPage() {
  const [query, setQuery] = useState("");

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Intelligence Search
        </h1>
        <p className="mt-1 text-muted-foreground">
          Ask questions across all your interviews. Powered by hybrid RAG search.
        </p>
      </div>

      {/* Search Input */}
      <div className="mb-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // TODO: Implement search
          }}
          className="flex gap-3"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="e.g. &quot;What are the energy infrastructure risks in Nigeria?&quot;"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={!query.trim()}>
            <Sparkles className="mr-2 h-4 w-4" />
            Search
          </Button>
        </form>
      </div>

      {/* Empty State / Capabilities */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Search className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">Semantic Search</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Find relevant insights by meaning, not just keywords. Understands
              context across languages and accents.
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Mic className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">Audio Citations</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Every answer links back to the exact timestamp in the original
              interview audio for verification.
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <Shield className="h-5 w-5" />
            </div>
            <CardTitle className="text-base">Grounded Answers</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Pre-filtered by country, topic, and project. No hallucinations —
              only intelligence from your verified sources.
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
