// Browser mic capture → 16 kHz mono 16-bit PCM WAV.
// Records with MediaRecorder (reliable everywhere, incl. iOS) and decodes to raw
// PCM ourselves, so we never depend on Azure understanding webm/opus or mp4/aac.

function downsample(buf: Float32Array, inRate: number, outRate: number): Float32Array {
	if (outRate >= inRate) return buf;
	const ratio = inRate / outRate;
	const newLen = Math.round(buf.length / ratio);
	const out = new Float32Array(newLen);
	let pos = 0;
	for (let i = 0; i < newLen; i++) {
		const next = Math.round((i + 1) * ratio);
		let sum = 0;
		let count = 0;
		for (let j = pos; j < next && j < buf.length; j++) {
			sum += buf[j];
			count++;
		}
		out[i] = count ? sum / count : 0;
		pos = next;
	}
	return out;
}

function peakLevel(buf: Float32Array): number {
	let p = 0;
	for (let i = 0; i < buf.length; i++) {
		const a = Math.abs(buf[i]);
		if (a > p) p = a;
	}
	return p;
}

function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
	const buffer = new ArrayBuffer(44 + samples.length * 2);
	const view = new DataView(buffer);
	const str = (off: number, s: string) => {
		for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
	};
	str(0, 'RIFF');
	view.setUint32(4, 36 + samples.length * 2, true);
	str(8, 'WAVE');
	str(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	str(36, 'data');
	view.setUint32(40, samples.length * 2, true);
	let off = 44;
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
		off += 2;
	}
	return buffer;
}

export interface Recording {
	blob: Blob;
	/** 0..1 peak amplitude — near zero means we captured silence. */
	peak: number;
	/** seconds of audio captured */
	seconds: number;
}

export class Recorder {
	private stream: MediaStream | null = null;
	private mr: MediaRecorder | null = null;
	private chunks: BlobPart[] = [];

	async start(): Promise<void> {
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
		});
		this.chunks = [];
		this.mr = new MediaRecorder(this.stream);
		this.mr.ondataavailable = (e) => {
			if (e.data && e.data.size) this.chunks.push(e.data);
		};
		this.mr.start();
	}

	async stop(): Promise<Recording> {
		const mr = this.mr;
		if (!mr) throw new Error('not recording');

		await new Promise<void>((resolve) => {
			mr.onstop = () => resolve();
			mr.stop();
		});
		this.stream?.getTracks().forEach((t) => t.stop());

		const recorded = new Blob(this.chunks, { type: this.chunks.length ? undefined : 'audio/webm' });
		const arr = await recorded.arrayBuffer();

		const Ctx: typeof AudioContext =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		const ctx = new Ctx();
		const audio = await ctx.decodeAudioData(arr);
		const mono = audio.getChannelData(0);
		const down = downsample(mono, audio.sampleRate, 16000);
		const peak = peakLevel(down);
		const wav = encodeWav(down, 16000);
		await ctx.close().catch(() => {});

		this.mr = null;
		this.stream = null;
		this.chunks = [];
		return { blob: new Blob([wav], { type: 'audio/wav' }), peak, seconds: down.length / 16000 };
	}
}
