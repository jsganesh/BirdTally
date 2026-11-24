import { useEffect, useRef, useState } from 'react';
import { VoiceNotes } from './recorder';

/** Record/stop for a voice note. Closing the screen mid-recording still saves it. */
export function useVoiceNote(save: (blob: Blob, seconds: number) => Promise<void>) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const [notes] = useState(() => new VoiceNotes((blob, seconds) => saveRef.current(blob, seconds)));
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);

  useEffect(() => () => void notes.finish(), [notes]);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const toggle = async () => {
    try {
      await notes.toggle();
    } catch {
      alert('Microphone permission is needed to record a voice note.');
    }
    setSecs(0);
    setRecording(notes.recording);
  };
  return { recording, secs, toggle };
}
