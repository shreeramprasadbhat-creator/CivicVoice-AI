
"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const LocationMap = dynamic(
  () => import("./LocationMap"),
  {
    ssr: false,
    loading: () => (
      <div className="mt-4 flex h-80 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
        Loading interactive map...
      </div>
    ),
  }
);

type Classification = {
  category: string;
  severity: string;
  priority: string;
  description: string;
};

// Convert browser audio into WAV format
function convertToWav(audioBuffer: AudioBuffer): Blob {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;

  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, value: string) {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples * 2, true);

  const output = new Int16Array(buffer, 44);

  const channelData = Array.from(
    { length: channels },
    (_, index) => audioBuffer.getChannelData(index)
  );

  for (let i = 0; i < samples; i++) {
    let sample = 0;

    for (let channel = 0; channel < channels; channel++) {
      sample += channelData[channel][i];
    }

    sample /= channels;
    sample = Math.max(-1, Math.min(1, sample));

    output[i] = sample < 0
      ? sample * 32768
      : sample * 32767;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export default function VoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [transcript, setTranscript] = useState("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Timbre text-to-speech states
  const [speechLoading, setSpeechLoading] = useState(false);
  const [speechAudioURL, setSpeechAudioURL] = useState("");

  // Classification states
  const [classification, setClassification] =
    useState<Classification | null>(null);
  const [classificationLoading, setClassificationLoading] =
    useState(false);

  // Complaint submission states
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [submittedComplaint, setSubmittedComplaint] = useState<{
    complaint_id: string;
    status: string;
    created_at: string;
    report_count?: number;
  } | null>(null);

  // Track whether citizen edited the transcript
  const [transcriptEdited, setTranscriptEdited] = useState(false);

  // Selected language
  const [selectedLanguage, setSelectedLanguage] = useState("en-IN");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      if (speechAudioURL) {
        URL.revokeObjectURL(speechAudioURL);
      }
    };
  }, [speechAudioURL]);

  async function startRecording() {
    try {
      setError("");
      setTranscript("");
      setLocation("");
      setClassification(null);
      setTranscriptEdited(false);
      setSubmittedComplaint(null);

      if (speechAudioURL) {
        URL.revokeObjectURL(speechAudioURL);
        setSpeechAudioURL("");
      }

      if (audioURL) {
        URL.revokeObjectURL(audioURL);
        setAudioURL("");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      const recorder = new MediaRecorder(stream);

      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType,
        });

        setAudioURL(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setRecording(true);
    } catch {
      setError(
        "Microphone access denied. Please allow microphone permission."
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      setRecording(false);
    }
  }

  // CIVICVOICE AI - COMPLAINT CLASSIFICATION
  async function classifyComplaint(text: string) {
    if (!text.trim()) {
      setError("Please enter your complaint first.");
      return;
    }

    setClassificationLoading(true);
    setClassification(null);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/classify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.detail || "Complaint classification failed."
        );
      }

      setClassification(result.classification);
      setTranscriptEdited(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to classify the complaint."
      );
    } finally {
      setClassificationLoading(false);
    }
  }

  // GNANI PRISMA - SPEECH TO TEXT
  async function transcribeAudio() {
    if (chunksRef.current.length === 0) {
      setError("Please record your complaint first.");
      return;
    }

    setLoading(true);
    setError("");
    setTranscript("");
    setClassification(null);
    setTranscriptEdited(false);

    let audioContext: AudioContext | null = null;

    try {
      const audioBlob = new Blob(chunksRef.current, {
        type: recorderRef.current?.mimeType || "audio/webm",
      });

      audioContext = new AudioContext();

      const audioData = await audioBlob.arrayBuffer();
      const decodedAudio = await audioContext.decodeAudioData(audioData);

      const wavBlob = convertToWav(decodedAudio);

      await audioContext.close();
      audioContext = null;

      const audioFile = new File(
        [wavBlob],
        "complaint.wav",
        { type: "audio/wav" }
      );

      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("language_code", selectedLanguage);

      const response = await fetch(
        `${API_BASE}/transcribe`,
        {
          method: "POST",
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Transcription failed.");
      }

      const recognizedText = result.transcript || "";
      setTranscript(recognizedText);

      // Automatically classify the recognized complaint
      if (recognizedText.trim()) {
        await classifyComplaint(recognizedText);
      } else {
        setError("No speech was recognized. Please record again.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to process the audio."
      );
    } finally {
      if (audioContext && audioContext.state !== "closed") {
        await audioContext.close();
      }

      setLoading(false);
    }
  }

  // GNANI TIMBRE - TEXT TO SPEECH
  async function speakComplaint() {
    if (!transcript.trim()) {
      setError("Please enter your complaint first.");
      return;
    }

    setSpeechLoading(true);
    setError("");

    if (speechAudioURL) {
      URL.revokeObjectURL(speechAudioURL);
      setSpeechAudioURL("");
    }

    try {
      const response = await fetch(
        `${API_BASE}/speak`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: transcript,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Speech generation failed.");
      }

      if (!result.audio_base64) {
        throw new Error("No audio was returned by Gnani Timbre.");
      }

      const binaryString = atob(result.audio_base64);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBlob = new Blob(
        [bytes],
        { type: result.audio_mime_type || "audio/wav" }
      );

      const generatedAudioURL = URL.createObjectURL(audioBlob);
      setSpeechAudioURL(generatedAudioURL);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to generate speech."
      );
    } finally {
      setSpeechLoading(false);
    }
  }

  // CIVICVOICE AI - SUBMIT COMPLAINT
  async function submitComplaint() {
    if (!transcript.trim()) {
      setError("Please enter your complaint first.");
      return;
    }

    if (!location.trim() || !locationConfirmed || latitude === null || longitude === null) {
      setError("Please search for the issue location on the map and confirm the marker.");
      return;
    }

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmissionLoading(true);
    setError("");
    setSubmittedComplaint(null);

    try {
      const response = await fetch(
        `${API_BASE}/complaints`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: transcript.trim(),
            location: location.trim(),
            latitude,
            longitude,
            email: email.trim(),
            language_code: selectedLanguage,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.detail || "Complaint registration failed."
        );
      }

      setSubmittedComplaint(result.complaint);

      // The backend classifies the final citizen-confirmed text during registration.
      setClassification({
        category: result.complaint.category,
        severity: result.complaint.severity,
        priority: result.complaint.priority,
        description: result.complaint.description,
      });
      setTranscriptEdited(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to submit the complaint."
      );
    } finally {
      setSubmissionLoading(false);
    }
  }

  return (
    <div className="mt-5 space-y-5">

      {/* Recording controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Voice recorder
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Record your civic complaint clearly.
            </p>
          </div>

          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            recording
              ? "bg-red-50 text-red-700"
              : "bg-slate-100 text-slate-600"
          }`}>
            {recording ? "● Recording" : "Ready"}
          </span>
        </div>

        {/* Language selector */}
        <div className="mt-5">
          <label
            htmlFor="language"
            className="mb-2 block text-sm font-semibold text-slate-700"
          >
            Select your language
          </label>

          <select
            id="language"
            value={selectedLanguage}
            onChange={(event) => setSelectedLanguage(event.target.value)}
            disabled={recording || loading}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
          >
            <option value="en-IN">English (India)</option>
            <option value="hi-IN">Hindi (हिन्दी)</option>
            <option value="kn-IN">Kannada (ಕನ್ನಡ)</option>
          </select>

          <p className="mt-2 text-xs text-slate-500">
            You can naturally mix English words with Hindi or Kannada.
          </p>
        </div>

        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={loading || speechLoading || classificationLoading}
          className={`mt-5 flex w-full items-center justify-center gap-3 rounded-lg px-5 py-4 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
            recording
              ? "bg-red-600 hover:bg-red-700"
              : "bg-[#123b70] hover:bg-blue-900"
          }`}
        >
          <span className="text-lg">
            {recording ? "■" : "🎙"}
          </span>
          {recording ? "Stop recording" : "Start voice recording"}
        </button>

        {recording && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-red-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
            Listening to your complaint...
          </div>
        )}
      </div>

      {/* Audio playback and transcription */}
      {audioURL && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-lg">
              ♪
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-800">
                Recording ready
              </p>
              <p className="text-xs text-slate-500">
                Review your audio before transcription.
              </p>
            </div>
          </div>

          <audio
            controls
            src={audioURL}
            className="mt-5 w-full"
          />

          <button
            type="button"
            onClick={transcribeAudio}
            disabled={loading || speechLoading || classificationLoading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Processing your voice...
              </>
            ) : (
              <>
                Convert voice to text
                <span>→</span>
              </>
            )}
          </button>

          {loading && (
            <p className="mt-3 text-center text-xs text-slate-500">
              Gnani Prisma is processing your recording.
            </p>
          )}
        </div>
      )}

      {/* Successful transcription */}
      {transcript && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              ✓
            </div>

            <div>
              <p className="text-sm font-bold text-emerald-800">
                Transcription successful
              </p>
              <p className="text-xs text-emerald-700">
                Review and correct your complaint before proceeding.
              </p>
            </div>
          </div>

          {/* Editable complaint transcript */}
          <div className="mt-4 rounded-lg border border-emerald-100 bg-white p-4">
            <label
              htmlFor="complaint-transcript"
              className="text-xs font-semibold uppercase tracking-wider text-slate-400"
            >
              Recognized complaint — Edit if needed
            </label>

            <textarea
              id="complaint-transcript"
              value={transcript}
              onChange={(event) => {
                setTranscript(event.target.value);
                setClassification(null);
                setTranscriptEdited(true);
                setSubmittedComplaint(null);
                setError("");

                if (speechAudioURL) {
                  URL.revokeObjectURL(speechAudioURL);
                  setSpeechAudioURL("");
                }
              }}
              rows={3}
              className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm leading-7 text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              placeholder="Review and correct your complaint..."
            />
          </div>
          {/* Interactive complaint location map */}
          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              <p className="text-sm font-bold text-[#123b70]">
                Pinpoint the issue location
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Search for an address or landmark, adjust the map marker, then confirm the exact location.
              </p>
            </div>

            <LocationMap
              initialLocation={location}
              onConfirm={(selected) => {
                setLocation(selected.address);
                setLatitude(selected.latitude);
                setLongitude(selected.longitude);
                setLocationConfirmed(true);
                setSubmittedComplaint(null);
                setError("");
              }}
            />

            {locationConfirmed && latitude !== null && longitude !== null ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-semibold text-emerald-800">
                  ✓ Location confirmed
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  {location}
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  Coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-amber-700">
                Search and confirm a map location to enable complaint submission.
              </p>
            )}
          </div>

          {/* Citizen email address */}
          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
            <label
              htmlFor="citizen-email"
              className="text-sm font-bold text-[#123b70]"
            >
              Your email address
            </label>

            <p className="mt-1 text-xs text-slate-500">
              We'll send your complaint ID and status updates to this email.
            </p>

            <input
              id="citizen-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setSubmittedComplaint(null);
                setError("");
              }}
              placeholder="you@example.com"
              className="mt-3 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Reclassify corrected complaint */}
          {transcriptEdited && (
            <button
              type="button"
              onClick={() => classifyComplaint(transcript)}
              disabled={classificationLoading || !transcript.trim()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-700 bg-white px-5 py-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {classificationLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
                  Reanalyzing complaint...
                </>
              ) : (
                <>
                  Analyze corrected complaint
                  <span>→</span>
                </>
              )}
            </button>
          )}

          {/* Classification result */}
          <div className="mt-5 rounded-xl border border-blue-200 bg-white p-5">
            <p className="text-sm font-bold text-[#123b70]">
              AI Complaint Analysis
            </p>

            {classificationLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
                Analyzing your complaint...
              </div>
            ) : classification ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-xs text-slate-500">Category</p>
                  <p className="mt-1 text-sm font-bold text-blue-900">
                    {classification.category}
                  </p>
                </div>

                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xs text-slate-500">Severity</p>
                  <p className="mt-1 text-sm font-bold text-amber-800">
                    {classification.severity}
                  </p>
                </div>

                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-xs text-slate-500">Priority</p>
                  <p className="mt-1 text-sm font-bold text-red-800">
                    {classification.priority}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                {transcriptEdited
                  ? "Please analyze your corrected complaint to update its classification."
                  : "Classification is not available yet."}
              </p>
            )}

            <p className="mt-4 text-xs text-slate-400">
              Classification uses CivicVoice AI's rule-based analysis engine.
            </p>
          </div>

          {/* Timbre speech generation */}
          <button
            type="button"
            onClick={speakComplaint}
            disabled={
              speechLoading ||
              loading ||
              classificationLoading ||
              !transcript.trim()
            }
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#123b70] px-5 py-4 text-sm font-semibold text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {speechLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating speech...
              </>
            ) : (
              <>
                <span>🔊</span>
                Listen to complaint
              </>
            )}
          </button>

          {speechAudioURL && (
            <div className="mt-4 rounded-lg border border-blue-100 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">
                Gnani Timbre audio generated successfully
              </p>

              <audio
                controls
                autoPlay
                src={speechAudioURL}
                className="w-full"
              />
            </div>
          )}

          {/* Submit complaint */}
          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-bold text-[#123b70]">
              Ready to submit?
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Check your complaint, location and email before registering it.
            </p>

            <button
              type="button"
              onClick={submitComplaint}
              disabled={
                submissionLoading ||
                loading ||
                classificationLoading ||
                !transcript.trim() ||
                !location.trim() ||
                !locationConfirmed ||
                latitude === null ||
                longitude === null ||
                !email.trim() ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
              }
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submissionLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting complaint...
                </>
              ) : (
                <>
                  Submit civic complaint
                  <span>→</span>
                </>
              )}
            </button>

            {(!location.trim() || !locationConfirmed) && (
              <p className="mt-2 text-xs text-amber-700">
                Search and confirm the issue location on the map to enable submission.
              </p>
            )}

            {email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (
              <p className="mt-2 text-xs text-amber-700">
                Enter a valid email address, for example name@example.com.
              </p>
            )}
            {!email.trim() && (
              <p className="mt-2 text-xs text-amber-700">
                Enter your email address to receive complaint updates.
              </p>
            )}

            {transcriptEdited && (
              <p className="mt-2 text-xs text-amber-700">
                Analyze your corrected complaint before submitting.
              </p>
            )}
          </div>

          {/* Successful complaint registration */}
          {submittedComplaint && (
            <div className="mt-5 rounded-xl border border-emerald-300 bg-white p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  ✓
                </span>
                <div>
                  <p className="text-sm font-bold text-emerald-800">
                    Complaint registered successfully!
                  </p>
                  <p className="text-xs text-slate-500">
                    Save your complaint ID to track its status.
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Your complaint ID
                </p>
                <p className="mt-1 break-all text-xl font-bold text-emerald-900">
                  {submittedComplaint.complaint_id}
                </p>
                <p className="mt-3 text-sm text-slate-700">
                  Status: <strong>{submittedComplaint.status}</strong>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Submitted:{" "}
                  {new Date(submittedComplaint.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          <p className="mt-3 text-center text-xs text-slate-500">
            Powered by Gnani Prisma and Timbre AI.
          </p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">
            Something went wrong
          </p>
          <p className="mt-1 text-sm leading-6 text-red-600">
            {error}
          </p>
        </div>
      )}

    </div>
  );
}
