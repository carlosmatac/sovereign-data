import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Database, Brain } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Platform configuration and security settings.
        </p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-green-600" />
              <div>
                <CardTitle className="text-base">Security & Privacy</CardTitle>
                <CardDescription>
                  Zero Trust data handling policies
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Row Level Security (RLS)</span>
              <Badge className="bg-green-100 text-green-800">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Data Region</span>
              <Badge variant="secondary">EU (Frankfurt)</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">AI Data Retention</span>
              <Badge className="bg-green-100 text-green-800">
                Zero Retention
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Brain className="h-5 w-5 text-purple-600" />
              <div>
                <CardTitle className="text-base">AI Pipeline</CardTitle>
                <CardDescription>
                  Model configuration for the intelligence engine
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Transcription</span>
              <Badge variant="secondary">AssemblyAI Universal-2</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Extraction</span>
              <Badge variant="secondary">GPT-4o-mini</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Embeddings</span>
              <Badge variant="secondary">text-embedding-3-small</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-blue-600" />
              <div>
                <CardTitle className="text-base">Database</CardTitle>
                <CardDescription>
                  Supabase PostgreSQL with pgvector
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Engine</span>
              <Badge variant="secondary">PostgreSQL 16</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Vector Index</span>
              <Badge variant="secondary">HNSW (1536 dim)</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
