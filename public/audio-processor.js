class AudioProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        // Obtenemos la entrada del micrófono (el primer canal)
        const input = inputs[0];
        
        if (input.length > 0) {
            const channelData = input[0];
            // Le enviamos este pedacito de audio al hilo principal (main.js)
            this.port.postMessage(channelData);
        }
        
        // Retornamos true para mantener vivo el procesador
        return true; 
    }
}

registerProcessor('audio-processor', AudioProcessor);