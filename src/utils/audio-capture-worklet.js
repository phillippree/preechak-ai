// Runs on the audio rendering thread, not the renderer/UI thread.
class InterviewAudioCapture extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.mic = options.processorOptions?.microphone === true;
        this.previousInput = 0;
        this.previousHighPass = 0;
        this.previousSample = 0;
        this.inputIndex = 0;
        this.nextOutputAt = 0;
        this.ratio = sampleRate / 24000;
        this.alpha = 1 / (1 + (2 * Math.PI * 80) / sampleRate);
        this.chunk = new Int16Array(2400);
        this.offset = 0;
        this.energy = 0;
        this.clipped = 0;
    }

    process(inputs) {
        const channels = inputs[0];
        if (!channels?.length) return true;
        for (let i = 0; i < channels[0].length; i++) {
            let value = 0;
            for (const channel of channels) value += channel[i] / channels.length;
            if (this.mic) {
                const filtered = this.alpha * (this.previousHighPass + value - this.previousInput);
                this.previousInput = value;
                this.previousHighPass = filtered;
                value = filtered;
            }
            while (this.nextOutputAt <= this.inputIndex) {
                const fraction = Math.max(0, Math.min(1, this.nextOutputAt - (this.inputIndex - 1)));
                const sample = this.previousSample + fraction * (value - this.previousSample);
                const clamped = Math.max(-1, Math.min(1, sample));
                this.energy += clamped * clamped;
                if (Math.abs(sample) >= 0.99) this.clipped++;
                this.chunk[this.offset++] = Math.round(clamped * (clamped < 0 ? 32768 : 32767));
                this.nextOutputAt += this.ratio;
                if (this.offset === this.chunk.length) {
                    this.port.postMessage({ pcm: this.chunk.buffer, rms: Math.sqrt(this.energy / this.offset), clipped: this.clipped }, [
                        this.chunk.buffer,
                    ]);
                    this.chunk = new Int16Array(2400);
                    this.offset = 0;
                    this.energy = 0;
                    this.clipped = 0;
                }
            }
            this.previousSample = value;
            this.inputIndex++;
        }
        // Outputs intentionally remain silent; never feed captured call audio back.
        return true;
    }
}
registerProcessor('interview-audio-capture', InterviewAudioCapture);
