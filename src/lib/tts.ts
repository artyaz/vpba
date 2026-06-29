// Browser-native text-to-speech via the Web Speech API. No key, no network —
// the voice runs on the device, so it's instant and works offline.
import { browser } from '$app/environment';

export const ttsReady = () => browser && 'speechSynthesis' in window;

let preferred: SpeechSynthesisVoice | null = null;

/** Pick a decent English voice once it's available (some browsers load them late). */
function englishVoice(): SpeechSynthesisVoice | null {
	if (preferred) return preferred;
	const voices = window.speechSynthesis.getVoices();
	const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
	preferred =
		en.find((v) => /natural|premium|enhanced/i.test(v.name)) ??
		en.find((v) => v.lang.toLowerCase() === 'en-us') ??
		en[0] ??
		null;
	return preferred;
}

if (browser && 'speechSynthesis' in window) {
	// Voices populate asynchronously in Chrome; refresh our pick when they land.
	window.speechSynthesis.onvoiceschanged = () => {
		preferred = null;
		englishVoice();
	};
}

/** Speak the given text aloud. Cancels anything already playing. */
export function speak(text: string): void {
	if (!ttsReady() || !text.trim()) return;
	const synth = window.speechSynthesis;
	synth.cancel();
	const u = new SpeechSynthesisUtterance(text);
	const v = englishVoice();
	if (v) u.voice = v;
	u.lang = v?.lang || 'en-US';
	u.rate = 0.95;
	synth.speak(u);
}

export function stopSpeaking(): void {
	if (ttsReady()) window.speechSynthesis.cancel();
}
