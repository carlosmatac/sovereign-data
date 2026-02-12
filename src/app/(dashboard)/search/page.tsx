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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Sparkles,
  Shield,
  Mic,
  Loader2,
  Clock,
  User,
  Filter,
} from "lucide-react";
import type { ChunkMetadata } from "@/types/database";

interface SearchResult {
  chunk_id: string;
  interview_id: string;
  content: string;
  speaker: string | null;
  start_time: number | null;
  end_time: number | null;
  metadata: ChunkMetadata;
  similarity: number;
}

interface SearchResponse {
  query: string;
  filters: {
    country: string | null;
    topics: string[];
  };
  results: SearchResult[];
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) throw new Error("Search failed");

      const data = (await res.json()) as SearchResponse;
      setResponse(data);
    } catch {
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (seconds: number | null) => {
    if (seconds === null) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Intelligence Search
        </h1>
        <p className="mt-1 text-muted-foreground">
          Ask questions across all your interviews. Powered by hybrid RAG
          search.
        </p>
      </div>

      {/* Search Input */}
      <div className="mb-8">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder='e.g. "What are the energy infrastructure risks in Nigeria?"'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={!query.trim() || loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Search
          </Button>
        </form>
      </div>

      {/* Applied Filters */}
      {response && (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span>Searched for:</span>
            <Badge variant="outline">{response.query}</Badge>
            {response.filters.country && (
              <Badge variant="secondary">{response.filters.country}</Badge>
            )}
            {response.filters.topics.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {response ? (
        response.results.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {response.results.length} relevant passages found
            </p>
            {response.results.map((result) => (
              <Card key={result.chunk_id} className="hover:shadow-sm">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Speaker + Timestamp */}
                      <div className="mb-2 flex items-center gap-2">
                        {result.speaker && (
                          <span className="flex items-center gap-1 text-xs font-medium text-primary">
                            <User className="h-3 w-3" />
                            {result.speaker}
                          </span>
                        )}
                        {result.start_time !== null && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatTimestamp(result.start_time)}
                            {result.end_time !== null &&
                              ` — ${formatTimestamp(result.end_time)}`}
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      <p className="text-sm leading-relaxed">
                        {result.content}
                      </p>

                      {/* Metadata tags */}
                      {result.metadata.topics &&
                        result.metadata.topics.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {result.metadata.topics.map((t) => (
                              <Badge
                                key={t}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {t}
                              </Badge>
                            ))}
                          </div>
                        )}
                    </div>

                    {/* Similarity Score */}
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-semibold text-primary">
                        {Math.round(result.similarity * 100)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        relevance
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <Search className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">No results found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try broadening your query or searching for different keywords.
              </p>
            </CardContent>
          </Card>
        )
      ) : (
        /* Empty State / Capabilities */
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
                Find relevant insights by meaning, not just keywords.
                Understands context across languages and accents.
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
                Every answer links back to the exact timestamp in the
                original interview audio for verification.
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
                Pre-filtered by country, topic, and project. No
                hallucinations — only intelligence from your verified
                sources.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
