// SharedArrayBuffer for synchronous input
// Index 0: Status (0 = empty, 1 = data ready)
// Index 1: Length of data
// Index 2+: Data (UTF-8 bytes)

export class InputBuffer {
  constructor(bufferSize = 1024) {
    if (typeof SharedArrayBuffer === "undefined") {
      console.warn("SharedArrayBuffer is not supported. Input will not work synchronously.");
      this.buffer = null;
      this.view = null;
      return;
    }
    
    this.buffer = new SharedArrayBuffer(bufferSize);
    this.view = new Int32Array(this.buffer);
    
    // Initialize
    this.view[0] = 0; // status
    this.view[1] = 0; // length
  }

  getBuffer() {
    return this.buffer;
  }

  writeInput(text) {
    if (!this.view) return false;
    
    const encoder = new TextEncoder();
    const encoded = encoder.encode(text);
    
    // Ensure it fits
    const maxLen = (this.view.length - 2) * 4; // bytes available
    const bytesToWrite = Math.min(encoded.length, maxLen);
    
    // Write data starting at offset 8 bytes (index 2 for Int32Array)
    const uint8View = new Uint8Array(this.buffer, 8);
    for (let i = 0; i < bytesToWrite; i++) {
        uint8View[i] = encoded[i];
    }
    
    // Update length
    this.view[1] = bytesToWrite;
    
    // Set status to ready (1) and wake up sleeping workers
    Atomics.store(this.view, 0, 1);
    Atomics.notify(this.view, 0, 1);
    
    return true;
  }
}

// Function to read from buffer (called by Worker)
export function readInputSync(buffer) {
  const view = new Int32Array(buffer);
  
  // Wait until status is 1 (data ready)
  // Atomics.wait(typedArray, index, value_to_check)
  Atomics.wait(view, 0, 0);
  
  // Read length
  const length = view[1];
  
  // Read data
  const uint8View = new Uint8Array(buffer, 8, length);
  const decoder = new TextDecoder();
  const text = decoder.decode(uint8View);
  
  // Reset status
  Atomics.store(view, 0, 0);
  
  return text;
}
