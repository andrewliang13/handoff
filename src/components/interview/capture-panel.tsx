"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

type CapturePanelProps = {
  disabled: boolean;
  recording: boolean;
  onRecordingStart: () => void;
  onRecordingEnd: () => void;
  onAudio: (file: File) => void;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
};

export function CapturePanel({
  disabled,
  recording,
  onRecordingStart,
  onRecordingEnd,
  onAudio,
  onTranscript,
  onError,
}: CapturePanelProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const aliveRef = useRef(true);
  const [draft, setDraft] = useState("");
  const locked = disabled || recording;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startRecording() {
    if (locked) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      onError("This browser cannot record audio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!aliveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (!aliveRef.current) return;
        if (blob.size === 0) {
          onRecordingEnd();
          onError("The recording was empty.");
          return;
        }
        const extension = type.includes("mp4") ? "m4a" : "webm";
        onAudio(new File([blob], `handoff-recording.${extension}`, { type }));
      };
      recorderRef.current = recorder;
      recorder.start();
      onRecordingStart();
    } catch (err) {
      onError(err instanceof Error ? err.message : "The microphone could not be opened.");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onAudio(file);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || locked) return;
    onTranscript(text);
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-3">
        {recording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="bg-[#1c1916] px-4 py-2 text-sm text-[#f6f1e7] outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916]"
          >
            Stop recording
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={disabled}
            className="bg-[#1c1916] px-4 py-2 text-sm text-[#f6f1e7] outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] disabled:opacity-50"
          >
            Record audio
          </button>
        )}
        <label
          className={`inline-flex border border-[#1c1916]/25 px-4 py-2 text-sm ${locked ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
        >
          Upload audio
          <input type="file" accept="audio/*" className="sr-only" disabled={locked} onChange={onFile} />
        </label>
      </div>

      <form className="mt-6" onSubmit={onSubmit}>
        <label htmlFor="transcript-paste" className="text-sm font-medium">
          Paste transcript
        </label>
        <textarea
          id="transcript-paste"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={locked}
          rows={8}
          className="mt-2 w-full border border-[#1c1916]/20 bg-white px-3 py-2 text-sm leading-relaxed outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={locked || !draft.trim()}
          className="mt-3 border border-[#1c1916]/25 px-4 py-2 text-sm outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] disabled:opacity-50"
        >
          Use this transcript
        </button>
      </form>
    </div>
  );
}
