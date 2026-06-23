// Browser mic capture → 16 kHz mono 16-bit PCM WAV.
// Uses ScriptProcessorNode (deprecated but universally supported, incl. iOS
// standalone PWAs) and encodes WAV by hand so we never depend on MediaRecorder
// codec support, which is patchy on iOS.

function mergeFloat32(chunks: Float32Array[]): Float32Array {
	let len = 0;
	for (const c of chunks) len += c.length;
	const out = new Float32Array(len);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.length;
	}
	return out;
}

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

export class Recorder {
	private ctx: AudioContext | null = null;
	private stream: MediaStream | null = null;
	private node: ScriptProcessorNode | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private chunks: Float32Array[] = [];
	private rate = 16000;

	async start(): Promise<void> {
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
		});
		const Ctx: typeof AudioContext =
			window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		this.ctx = new Ctx();
		if (this.ctx.state === 'suspended') await this.ctx.resume();
		this.rate = this.ctx.sampleRate;
		this.source = this.ctx.createMediaStreamSource(this.stream);
		this.node = this.ctx.createScriptProcessor(4096, 1, 1);
		this.chunks = [];
		this.node.onaudioprocess = (e) => {
			this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
		};
		this.source.connect(this.node);
		this.node.connect(this.ctx.destination); // required to pump audio; output stays silent
	}

	async stop(): Promise<Blob> {
		this.node?.disconnect();
		this.source?.disconnect();
		this.stream?.getTracks().forEach((t) => t.stop());
		const merged = mergeFloat32(this.chunks);
		const down = downsample(merged, this.rate, 16000);
		const wav = encodeWav(down, 16000);
		await this.ctx?.close().catch(() => {});
		this.ctx = this.node = this.source = this.stream = null;
		this.chunks = [];
		return new Blob([wav], { type: 'audio/wav' });
	}
}
