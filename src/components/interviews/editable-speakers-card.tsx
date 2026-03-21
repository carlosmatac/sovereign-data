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
      setMap({ ...initialSpeakerMap });
      setClientSig(serverSig);
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
        <CardTitle className="text-base">Speakers</CardTitle>
        {canEdit && (
          <CardDescription>
            Set display names for each detected speaker
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {codes.map((code) => (
            <div
              key={code}
              className="grid gap-2 sm:grid-cols-[minmax(0,5rem)_1fr] sm:items-center sm:gap-3"
            >
              <div className="text-sm text-muted-foreground">
                <span className="sr-only">Diarization track </span>
                <span className="font-mono text-xs" title="Stable speaker id from diarization">
                  {code}
                </span>
              </div>
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
                <p className="text-sm font-medium">{map[code]}</p>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={pending || !isDirty}
            className="w-full sm:w-auto"
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save speaker names
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
