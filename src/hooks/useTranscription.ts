import { useState, useCallback } from 'react';
import { BasicPitch, noteFramesToTime, addPitchBendsToNoteEvents, outputToNotesPoly } from '@spotify/basic-pitch';
import { Midi } from '@tonejs/midi';
import { decodeAndResample, getSegments } from '@/lib/audioUtils';

const MODEL_URL = 'https://unpkg.com/@spotify/basic-pitch@1.0.1/model/model.json';

export interface TranscriptionState {
  isProcessing: boolean;
  progress: number;
  status: string;
  error: string | null;
  midiData: Blob | null;
  fileName: string | null;
}

export interface TranscriptionOptions {
  onsetThreshold?: number; // default: 0.25
  frameThreshold?: number; // default: 0.25
  minimumNoteLength?: number; // default: 5
  minFrequency?: number; // default: undefined
  maxFrequency?: number; // default: undefined
  instrumentProgram?: number; // default: 0
  isDrums?: boolean; // default: false
  octaveShift?: number; // default: 0
}

export function useTranscription() {
  const [state, setState] = useState<TranscriptionState>({
    isProcessing: false,
    progress: 0,
    status: 'Idle',
    error: null,
    midiData: null,
    fileName: null,
  });

  const transcribe = useCallback(async (file: File, options?: TranscriptionOptions) => {
    const onsetThresh = options?.onsetThreshold ?? 0.25;
    const frameThresh = options?.frameThreshold ?? 0.25;
    const minNoteLen = options?.minimumNoteLength ?? 5;
    const minFreq = options?.minFrequency;
    const maxFreq = options?.maxFrequency;
    const instrumentProgram = options?.instrumentProgram ?? 0;
    const isDrums = options?.isDrums ?? false;
    const octaveShift = options?.octaveShift ?? 0;

    setState({ 
      isProcessing: true, 
      progress: 0, 
      status: 'Reading file...', 
      error: null, 
      midiData: null,
      fileName: file.name
    });

    try {
      // 1. Decode and Resample
      const arrayBuffer = await file.arrayBuffer();
      setState(s => ({ ...s, status: 'Decoding audio (this may take a moment)...', progress: 5 }));
      
      const audioBuffer = await decodeAndResample(arrayBuffer);
      
      setState(s => ({ ...s, status: 'Initializing AI model...', progress: 15 }));
      
      // 2. Initialize Basic Pitch
      // We initialize it once to reuse across segments
      const basicPitch = new BasicPitch(MODEL_URL);
      
      // 3. Segment and Process
      const segmentDuration = 30;
      const overlapDuration = 0.5; // 0.5s overlap to maintain continuity
      const segments = getSegments(audioBuffer, segmentDuration, overlapDuration);
      const totalSegments = segments.length;
      
      const midi = new Midi();
      const track = midi.addTrack();
      track.name = file.name.replace(/\.[^/.]+$/, ""); // Use filename as track name
      track.instrument.number = instrumentProgram;
      track.channel = isDrums ? 9 : 0;

      for (let i = 0; i < totalSegments; i++) {
        // Calculate the actual start time in the original audio
        // The first segment starts at 0. Subsequent ones start at i * (duration - overlap)
        const segmentStartTime = i * (segmentDuration - overlapDuration);
        
        setState(s => ({ 
          ...s, 
          status: `AI Analysis: Processing segment ${i + 1} of ${totalSegments}...`, 
          progress: 15 + (i / totalSegments) * 70 
        }));

        const frames: number[][] = [];
        const onsets: number[][] = [];
        const contours: number[][] = [];

        await basicPitch.evaluateModel(
          segments[i],
          (f, o, c) => {
            frames.push(...f);
            onsets.push(...o);
            contours.push(...c);
          },
          (p) => {
            // Update sub-progress
            const segmentContribution = 70 / totalSegments;
            const totalProgress = 15 + (i * segmentContribution) + (p * segmentContribution);
            setState(s => ({ ...s, progress: Math.min(90, totalProgress) }));
          }
        );

        // Convert raw output to note events
        // Parameters: frames, onsets, onsetThreshold, frameThreshold, minNoteLength, inferOnsets, maxFreq, minFreq
        const notes = outputToNotesPoly(
          frames,
          onsets,
          onsetThresh,
          frameThresh,
          minNoteLen,
          true,
          maxFreq || null,
          minFreq || null
        );
        const notesWithBends = addPitchBendsToNoteEvents(contours, notes);
        const segmentNotes = noteFramesToTime(notesWithBends);
        
        // Filter out notes starting in the overlapping region at the end of the segment.
        // Let the next segment transcribe them from the beginning instead of cutting them off.
        const filteredNotes = segmentNotes.filter(note => {
          if (i < totalSegments - 1) {
            return note.startTimeSeconds < (segmentDuration - overlapDuration);
          }
          return true;
        });

        // Add notes to track with time offset
        filteredNotes.forEach(note => {
          let transposedPitch = note.pitchMidi + (octaveShift * 12);
          transposedPitch = Math.max(0, Math.min(127, transposedPitch));
          track.addNote({
            midi: transposedPitch,
            time: note.startTimeSeconds + segmentStartTime,
            duration: note.durationSeconds,
            velocity: note.amplitude,
          });
        });
      }

      setState(s => ({ ...s, status: 'Deduplicating and merging notes...', progress: 92 }));

      // 4. Smart Deduplication & Merging across segment boundaries
      // Sort notes by pitch and then by start time
      track.notes.sort((a, b) => {
        if (a.midi !== b.midi) return a.midi - b.midi;
        return a.time - b.time;
      });

      const mergedNotes: any[] = [];
      track.notes.forEach(note => {
        if (mergedNotes.length === 0) {
          mergedNotes.push(note);
          return;
        }

        const lastNote = mergedNotes[mergedNotes.length - 1];
        if (lastNote.midi === note.midi) {
          const lastNoteEnd = lastNote.time + lastNote.duration;
          // If the current note starts before the previous note ends, or is extremely close (e.g. within 80ms)
          if (note.time <= lastNoteEnd + 0.08) {
            // Merge them! Extend duration to the maximum of both notes
            const newEnd = Math.max(lastNoteEnd, note.time + note.duration);
            lastNote.duration = newEnd - lastNote.time;
            
            // Average the velocity to smooth out transitions
            lastNote.velocity = (lastNote.velocity + note.velocity) / 2;
            return;
          }
        }
        mergedNotes.push(note);
      });

      track.notes = mergedNotes;

      setState(s => ({ ...s, status: 'Generating MIDI file...', progress: 95 }));

      // 5. Finalize MIDI
      const midiBlob = new Blob([midi.toArray() as any], { type: 'audio/midi' });
      
      setState(s => ({
        ...s,
        isProcessing: false,
        progress: 100,
        status: 'Success!',
        error: null,
        midiData: midiBlob,
      }));

    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || 'An unexpected error occurred during transcription.';
      if (err.message?.includes('decode')) {
        errorMsg = 'Could not decode audio. Please ensure the file is a valid MP3 or WAV.';
      }
      
      setState(s => ({
        ...s,
        isProcessing: false,
        progress: 0,
        status: 'Error',
        error: errorMsg,
        midiData: null,
      }));
    }
  }, []);

  return { ...state, transcribe };
}
