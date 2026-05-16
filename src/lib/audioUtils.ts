/**
 * Audio Utilities for AuraMIDI
 * Handles decoding, resampling, and segmenting audio for Basic Pitch.
 */

export const SAMPLE_RATE = 22050;

/**
 * Decodes an ArrayBuffer into an AudioBuffer and resamples it to 22,050 Hz.
 */
export async function decodeAndResample(
  arrayBuffer: ArrayBuffer
): Promise<AudioBuffer> {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate: SAMPLE_RATE,
  });

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    // Spotify Basic Pitch requires MONO (1 channel)
    if (audioBuffer.numberOfChannels === 1) {
      return audioBuffer;
    }

    // Downmix to Mono by averaging channels
    console.log(`Downmixing ${audioBuffer.numberOfChannels} channels to mono...`);
    const monoBuffer = new AudioBuffer({
      length: audioBuffer.length,
      numberOfChannels: 1,
      sampleRate: SAMPLE_RATE,
    });

    const monoData = monoBuffer.getChannelData(0);
    const numChannels = audioBuffer.numberOfChannels;
    
    for (let i = 0; i < audioBuffer.length; i++) {
      let sum = 0;
      for (let channel = 0; channel < numChannels; channel++) {
        sum += audioBuffer.getChannelData(channel)[i];
      }
      monoData[i] = sum / numChannels;
    }
    
    return monoBuffer;
  } catch (error) {
    console.error("Error decoding audio data:", error);
    throw new Error("Failed to decode audio. Please ensure it is a valid audio file.");
  } finally {
    // Note: We don't close the context here as it might be needed for subsequent calls,
    // though in this app we create a new one every time which is slightly less efficient
    // but safer for avoiding "closed context" errors.
  }
}

/**
 * Slices an AudioBuffer into smaller segments (chunks) with optional overlap.
 */
export function getSegments(
  audioBuffer: AudioBuffer, 
  segmentDurationSeconds: number = 30,
  overlapSeconds: number = 0
): AudioBuffer[] {
  const segments: AudioBuffer[] = [];
  const samplesPerSegment = Math.floor(segmentDurationSeconds * SAMPLE_RATE);
  const samplesOverlap = Math.floor(overlapSeconds * SAMPLE_RATE);
  const totalSamples = audioBuffer.length;
  
  // The stride is how far we move the window for each segment
  const stride = samplesPerSegment - samplesOverlap;

  for (let i = 0; i < totalSamples; i += stride) {
    // If we're at the end and the remaining data is tiny, stop
    if (i + samplesOverlap >= totalSamples && segments.length > 0) break;

    const length = Math.min(samplesPerSegment, totalSamples - i);
    const segment = new AudioBuffer({
      length,
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: SAMPLE_RATE,
    });

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel).subarray(i, i + length);
      segment.copyToChannel(channelData, channel);
    }
    segments.push(segment);

    // If we processed to the end of the buffer, stop
    if (i + length >= totalSamples) break;
  }

  return segments;
}
