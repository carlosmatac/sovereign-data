"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SpeakerPersonNameInput } from "@/components/interviews/speaker-person-name-input";
import { updateInterviewSpeakerMap } from "@/app/actions/interview-speakers";
import type { SpeakerMap } from "@/types/database";

type Props = {
  interviewId: string;
  projectId: string;
  initialSpeakerMap: SpeakerMap;
  canEdit: boolean;
};

function sortedSpeakerCodes(map: SpeakerMap): string[] {
  return Object.keys(map).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

function signatureForMap(map: SpeakerMap): string {
  return JSON.stringify(
    sortedSpeakerCodes(map).map((k) => [k, map[k]] as const)
  );
}

export function EditableSpeakersCard({
  interviewId,
  projectId,
  initialSpeakerMap,
  canEdit,
}: Props) {
  const router = useRouter();
  const [map, setMap] = useState<SpeakerMap>(() => ({ ...initialSpeakerMap }));
  const [pending, startTransition] = useTransition();
  const serverSig = useMemo(
    () => signatureForMap(initialSpeakerMap),
    [initialSpeakerMap]
  );
  const [clientSig, setClientSig] = useState(serverSig);

  useEffect(() => {
    if (serverSig !== clientSig) {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setMap({ ...initialSpeakerMap });
        setClientSig(serverSig);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [serverSig, clientSig, initialSpeakerMap]);

  const codes = useMemo(() => sortedSpeakerCodes(map), [map]);

  const isDirty = useMemo(
    () => signatureForMap(map) !== serverSig,
    [map, serverSig]
  );

  const onSave = () => {
    startTransition(async () => {
      const result = await updateInterviewSpeakerMap(interviewId, map);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Speaker names saved");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Speakers</CardTitle>
            {canEdit && (
              <CardDescription>
                Set display names for each detected speaker
              </CardDescription>
            )}
          </div>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              onClick={onSave}
              disabled={pending || !isDirty}
              className="h-8 shrink-0 rounded-md px-3 text-xs font-medium"
            >
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {codes.map((code) => (
            <li
              key={code}
              className="flex items-center gap-3 rounded-[8px] border border-border/30 bg-accent/50 px-3 py-2"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[11px] font-semibold text-muted-foreground"
                title="Stable speaker id from diarization"
              >
                <span className="sr-only">Diarization track </span>
                {code}
              </span>
              <div className="min-w-0 flex-1">
                {canEdit ? (
                  <SpeakerPersonNameInput
                    projectId={projectId}
                    id={`speaker-name-${code}`}
                    value={map[code] ?? ""}
                    onChange={(next) =>
                      setMap((prev) => ({ ...prev, [code]: next }))
                    }
                    disabled={pending}
                    placeholder={`Speaker ${code}`}
                    aria-label={`Display name for speaker track ${code}`}
                  />
                ) : (
                  <p className="truncate text-sm font-medium text-foreground/85">
                    {map[code]}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
