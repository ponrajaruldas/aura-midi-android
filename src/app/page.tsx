"use client";

import React, { useCallback, useState } from 'react';
import { Upload, Music, Download, CheckCircle2, AlertCircle, Loader2, Sparkles, Info, Sliders, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranscription, TranscriptionOptions } from '@/hooks/useTranscription';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const PRESETS: Record<string, Required<TranscriptionOptions>> = {
  universal: {
    onsetThreshold: 0.25,
    frameThreshold: 0.25,
    minimumNoteLength: 5,
    minFrequency: 30,
    maxFrequency: 10000,
  },
  melody: {
    onsetThreshold: 0.20,
    frameThreshold: 0.25,
    minimumNoteLength: 4,
    minFrequency: 150,
    maxFrequency: 3000,
  },
  piano: {
    onsetThreshold: 0.25,
    frameThreshold: 0.30,
    minimumNoteLength: 5,
    minFrequency: 30,
    maxFrequency: 5000,
  },
  bass: {
    onsetThreshold: 0.30,
    frameThreshold: 0.20,
    minimumNoteLength: 6,
    minFrequency: 20,
    maxFrequency: 300,
  },
  guitar: {
    onsetThreshold: 0.25,
    frameThreshold: 0.25,
    minimumNoteLength: 5,
    minFrequency: 80,
    maxFrequency: 1200,
  }
};

export default function Home() {
  const { isProcessing, progress, status, error, midiData, fileName, transcribe } = useTranscription();
  const [isDragging, setIsDragging] = useState(false);
  
  // Advanced Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [preset, setPreset] = useState<string>('universal');
  const [settings, setSettings] = useState<Required<TranscriptionOptions>>({
    onsetThreshold: 0.25,
    frameThreshold: 0.25,
    minimumNoteLength: 5,
    minFrequency: 30,
    maxFrequency: 10000,
  });

  const applyPreset = (presetName: string) => {
    setPreset(presetName);
    if (PRESETS[presetName]) {
      setSettings(PRESETS[presetName]);
    }
  };

  const handleFile = (file: File) => {
    // Expand support to all common audio formats decodable by the browser
    const supportedExtensions = ['.mp3', '.wav', '.aac', '.m4a', '.mpeg', '.mpg', '.ogg', '.flac', '.webm'];
    const hasSupportedExtension = supportedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (file.type.includes('audio') || hasSupportedExtension) {
      transcribe(file, settings);
    } else {
      alert("Unsupported file format. Please upload a valid audio file (MP3, WAV, AAC, MPEG, etc).");
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [transcribe, settings]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const downloadMidi = async () => {
    if (!midiData) return;
    
    // Use original filename but change extension to .mid
    const name = fileName ? fileName.replace(/\.[^/.]+$/, "") : 'transcription';
    const cleanFileName = `${name}.mid`;

    if (Capacitor.isNativePlatform()) {
      try {
        // Convert Blob to Base64
        const convertBlobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = reject;
          reader.onload = () => {
            resolve(reader.result as string);
          };
          reader.readAsDataURL(blob);
        });

        const base64Data = await convertBlobToBase64(midiData);
        const base64Content = base64Data.split(',')[1] || base64Data;

        // Write file to application cache directory (requires no permissions)
        const savedFile = await Filesystem.writeFile({
          path: cleanFileName,
          data: base64Content,
          directory: Directory.Cache,
        });

        // Share the file using native sharing (requires no permissions, allows user to save to Downloads or share)
        await Share.share({
          title: 'Save MIDI File',
          text: `Here is your converted MIDI file: ${cleanFileName}`,
          url: savedFile.uri,
          files: [savedFile.uri],
        });
      } catch (err: any) {
        console.error('Error saving or sharing file:', err);
        alert(`Failed to save MIDI file: ${err.message || err}`);
      }
    } else {
      // Fallback for Web/Electron
      const url = URL.createObjectURL(midiData);
      const a = document.createElement('a');
      a.href = url;
      a.download = cleanFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <main className="container animate-fade-in" style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      padding: '40px 24px',
      paddingBottom: 'calc(40px + env(safe-area-inset-bottom))' 
    }}>
      
      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
          <div className="glass" style={{ padding: '12px', background: 'var(--primary)', color: 'white', borderRadius: '16px' }}>
            <Music size={32} />
          </div>
          <h1 className="title-gradient" style={{ fontSize: '3rem' }}>AuraMIDI</h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
          State-of-the-art AI polyphonic audio-to-MIDI transcription. 
          Studio quality, right in your browser.
        </p>
      </header>

      {/* Main Action Zone */}
      <div style={{ position: 'relative', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
        
        {/* Advanced Settings Panel */}
        {!isProcessing && !midiData && (
          <div style={{ width: '100%', marginBottom: '24px' }}>
            <div 
              onClick={() => setShowSettings(!showSettings)}
              className="glass glass-interactive"
              style={{ 
                padding: '16px 24px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                cursor: 'pointer',
                borderRadius: showSettings ? '24px 24px 0 0' : '24px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <Sliders size={20} color="var(--primary)" />
                <span style={{ fontWeight: '600', fontSize: '1.05rem' }}>AI Transcription Settings</span>
                <span style={{ 
                  fontSize: '0.75rem', 
                  background: 'rgba(168, 85, 247, 0.1)', 
                  color: 'var(--primary)', 
                  padding: '4px 10px', 
                  borderRadius: '20px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Preset: {preset}
                </span>
              </div>
              {showSettings ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>

            {showSettings && (
              <div 
                className="glass" 
                style={{ 
                  padding: '24px', 
                  borderRadius: '0 0 24px 24px',
                  borderTop: 'none',
                  background: 'rgba(255, 255, 255, 0.015)'
                }}
              >
                {/* Preset Selector */}
                <div style={{ marginBottom: '24px' }}>
                  <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: '500' }}>
                    Select Instrument Preset
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {Object.keys(PRESETS).map((key) => (
                      <button
                        key={key}
                        onClick={() => applyPreset(key)}
                        className="btn"
                        style={{
                          padding: '8px 16px',
                          fontSize: '0.85rem',
                          borderRadius: '10px',
                          background: preset === key ? 'var(--primary)' : 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid',
                          borderColor: preset === key ? 'var(--primary)' : 'var(--glass-border)',
                          color: preset === key ? 'white' : 'var(--text-color)',
                          transition: 'all 0.2s ease',
                          textTransform: 'capitalize',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {preset === key && <Check size={14} />}
                        {key === 'universal' && <Music size={14} />}
                        {key === 'melody' && <Sparkles size={14} />}
                        {key === 'piano' && <Info size={14} />}
                        {key === 'bass' && <Sliders size={14} />}
                        {key === 'guitar' && <Music size={14} />}
                        {key}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                  {/* Onset Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>Onset Sensitivity</span>
                      <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{settings.onsetThreshold}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.05" 
                      max="0.95" 
                      step="0.05" 
                      value={settings.onsetThreshold}
                      onChange={(e) => {
                        setPreset('custom');
                        setSettings(s => ({ ...s, onsetThreshold: parseFloat(e.target.value) }));
                      }}
                      style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer', height: '6px', borderRadius: '3px' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.4 }}>
                      Detects note beginnings. **Lower** = more sensitive (soft notes). **Higher** = filters out noise.
                    </p>
                  </div>

                  {/* Frame Slider */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>Frame Sustain Sensitivity</span>
                      <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{settings.frameThreshold}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.05" 
                      max="0.95" 
                      step="0.05" 
                      value={settings.frameThreshold}
                      onChange={(e) => {
                        setPreset('custom');
                        setSettings(s => ({ ...s, frameThreshold: parseFloat(e.target.value) }));
                      }}
                      style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer', height: '6px', borderRadius: '3px' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.4 }}>
                      Controls note release. **Lower** = sustained notes hold longer. **Higher** = cuts notes sooner.
                    </p>
                  </div>

                  {/* Min Note Length */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>Minimum Note Length</span>
                      <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{settings.minimumNoteLength} frames</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="15" 
                      step="1" 
                      value={settings.minimumNoteLength}
                      onChange={(e) => {
                        setPreset('custom');
                        setSettings(s => ({ ...s, minimumNoteLength: parseInt(e.target.value) }));
                      }}
                      style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer', height: '6px', borderRadius: '3px' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.4 }}>
                      Filters out transient audio clicks/pops. **Lower** = fast rapid notes. **Higher** = cleaner MIDI.
                    </p>
                  </div>

                  {/* Frequency Band Filters */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>Frequency Filter Band</span>
                      <span style={{ color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                        {settings.minFrequency}Hz - {settings.maxFrequency}Hz
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Min (Hz)</span>
                        <input 
                          type="number" 
                          min="20" 
                          max="2000" 
                          value={settings.minFrequency}
                          onChange={(e) => {
                            setPreset('custom');
                            setSettings(s => ({ ...s, minFrequency: Math.max(20, parseInt(e.target.value) || 20) }));
                          }}
                          style={{ 
                            width: '100%', 
                            background: 'rgba(255,255,255,0.03)', 
                            border: '1px solid var(--glass-border)',
                            borderRadius: '8px',
                            color: 'var(--text-color)',
                            padding: '6px 10px',
                            fontSize: '0.8rem'
                          }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Max (Hz)</span>
                        <input 
                          type="number" 
                          min="200" 
                          max="18000" 
                          value={settings.maxFrequency}
                          onChange={(e) => {
                            setPreset('custom');
                            setSettings(s => ({ ...s, maxFrequency: Math.min(18000, parseInt(e.target.value) || 10000) }));
                          }}
                          style={{ 
                            width: '100%', 
                            background: 'rgba(255,255,255,0.03)', 
                            border: '1px solid var(--glass-border)',
                            borderRadius: '8px',
                            color: 'var(--text-color)',
                            padding: '6px 10px',
                            fontSize: '0.8rem'
                          }}
                        />
                      </div>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.4 }}>
                      Rejects audio outside this range. Eliminates sub-bass noise or high harmonic overtones.
                    </p>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {!isProcessing && !midiData && (
          <div 
            className={`glass glass-interactive ${isDragging ? 'pulse-primary' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            style={{ 
              padding: '80px 40px', 
              textAlign: 'center', 
              cursor: 'pointer',
              borderStyle: 'dashed',
              borderWidth: '2px',
              borderColor: isDragging ? 'var(--primary)' : 'var(--glass-border)'
            }}
            onClick={() => document.getElementById('fileInput')?.click()}
          >
            <input type="file" id="fileInput" hidden accept=".mp3,.wav,.aac,.m4a,.mpeg,.mpg,.ogg,.flac,.webm,audio/*" onChange={onFileChange} />
            <div style={{ background: 'rgba(168, 85, 247, 0.1)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Upload size={40} color="var(--primary)" />
            </div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>Drop your audio here</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Supports MP3, WAV, AAC, MPEG, and more</p>
            
            <button 
              className="btn btn-primary" 
              style={{ fontSize: '1.1rem', padding: '16px 32px' }}
              onClick={(e) => {
                e.stopPropagation();
                document.getElementById('fileInput')?.click();
              }}
            >
              <Upload size={20} /> Upload Audio File
            </button>
          </div>
        )}

        {/* Processing State */}
        {isProcessing && (
          <div className="glass" style={{ padding: '60px 40px', textAlign: 'center' }}>
            <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 32px' }}>
              <Loader2 size={120} className="pulse-primary" style={{ color: 'var(--primary)', opacity: 0.2 }} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{Math.round(progress)}%</span>
              </div>
            </div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{status}</h2>
            {fileName && (
              <p style={{ color: 'var(--primary)', fontWeight: '500', marginBottom: '16px' }}>
                {fileName}
              </p>
            )}
            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', marginBottom: '24px' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--secondary))', transition: 'width 0.4s ease' }} />
            </div>
            <p style={{ color: 'var(--text-muted)' }}>Using on-device AI. Your audio never leaves your phone.</p>
          </div>
        )}

        {/* Success State */}
        {midiData && (
          <div className="glass animate-fade-in" style={{ padding: '60px 40px', textAlign: 'center', borderColor: 'var(--primary)' }}>
            <div style={{ color: '#22C55E', marginBottom: '24px' }}>
              <CheckCircle2 size={80} style={{ margin: '0 auto' }} />
            </div>
            <h2 style={{ fontSize: '2rem', marginBottom: '12px' }}>Transcription Ready!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>
              Successfully converted <strong>{fileName}</strong>
            </p>
            <p style={{ color: 'var(--text-muted)', marginBottom: '40px' }}>Notes have been extracted with high precision.</p>
            
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={downloadMidi} style={{ fontSize: '1.1rem', padding: '16px 32px' }}>
                <Download size={24} /> Download MIDI
              </button>
              <button className="btn" onClick={() => window.location.reload()} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)' }}>
                Convert Another
              </button>
            </div>
            <div style={{ marginTop: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.9rem', opacity: 0.8 }}>
              <Info size={16} />
              <span>Converted files are stored in your <strong>Downloads</strong> folder.</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="glass" style={{ padding: '40px', textAlign: 'center', borderColor: '#EF4444' }}>
            <AlertCircle size={48} color="#EF4444" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '1.2rem', marginBottom: '12px' }}>Something went wrong</h2>
            <p style={{ color: '#EF4444', marginBottom: '24px' }}>{error}</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Try Again</button>
          </div>
        )}

      </div>

      {/* Features Grid */}
      {!isProcessing && !midiData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginTop: '80px' }}>
          <FeatureCard icon={<Sparkles color="var(--primary)" />} title="Polyphonic AI" desc="Detects multiple notes and chords simultaneously across the frequency spectrum." />
          <FeatureCard icon={<Loader2 color="var(--secondary)" />} title="On-Device" desc="Fast local processing. No accounts, no uploads, total privacy." />
          <FeatureCard icon={<CheckCircle2 color="var(--accent)" />} title="Universal" desc="Works on Android, iOS, and Desktop. Fully mobile responsive." />
        </div>
      )}

      <footer style={{ marginTop: 'auto', paddingTop: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        &copy; 2026 AuraMIDI Studio. Powered by Spotify Basic Pitch.
      </footer>
    </main>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="glass" style={{ padding: '32px' }}>
      <div style={{ marginBottom: '16px' }}>{icon}</div>
      <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{title}</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6 }}>{desc}</p>
    </div>
  );
}
