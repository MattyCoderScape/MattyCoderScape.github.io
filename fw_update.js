// fw_update.js V20 – polling read until XON, dedicated reader, main reader paused

window.FW_UPDATE_VERSION = "20.0";

const fwBrowseBtn = document.getElementById('fw_browse');
const fwUpdateBtn = document.getElementById('fw_update');
const fwFileInput = document.getElementById('fw_file_input');
const fwFileName = document.getElementById('fw_file_name');
const fwStatus = document.getElementById('fw_status');
const fwProgress = document.getElementById('fw_progress');
const fwProgressContainer = document.getElementById('fw_progress_container');
const elapsedTimeEl = document.getElementById('elapsed_time');
const debugWindow = document.getElementById('debug_window');

let selectedFile = null;
let updateInProgress = false;
let startTime = null;
let timerInterval = null;

const ACKLOD = 0x06;
const XON   = 0x11;
const XOFF  = 0x13;

fwBrowseBtn.addEventListener('click', () => fwFileInput.click());

fwFileInput.addEventListener('change', () => {
  const file = fwFileInput.files[0];
  if (!file) return;
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext !== 'hex' && ext !== 'tthex') {
    fwStatus.textContent = 'Please select a .hex or .tthex file';
    fwFileInput.value = '';
    return;
  }
  selectedFile = file;
  fwFileName.textContent = file.name;
  fwUpdateBtn.disabled = false;
  fwStatus.textContent = 'File ready – click Update FW';
});

fwUpdateBtn.addEventListener('click', async () => {
  if (!selectedFile || updateInProgress || !portOpen) {
    fwStatus.textContent = !selectedFile ? 'No file' : updateInProgress ? 'Busy' : 'Port closed';
    return;
  }

  updateInProgress = true;
  fwStatus.textContent = 'Reading file...';
  fwProgressContainer.style.display = 'block';
  fwProgress.value = 0;
  fwUpdateBtn.disabled = true;

  startTime = Date.now();
  elapsedTimeEl.textContent = 'Elapsed: 00:00';
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const m = Math.floor(elapsed / 60000).toString().padStart(2, '0');
    const s = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
    elapsedTimeEl.textContent = `Elapsed: ${m}:${s}`;
  }, 1000);

  try {
    const text = await selectedFile.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && (l.startsWith(':') || l.startsWith('|')));

    if (lines.length === 0) throw new Error("No valid lines");

    fwStatus.textContent = `Uploading ${lines.length} lines...`;
    debugWindow.value += `Upload started: ${lines.length} lines\n`;

    // Pause main background reader
    if (window.reader) {
      await window.reader.cancel().catch(() => {});
      await new Promise(r => setTimeout(r, 200));
    }

    const tempReader = port.readable.getReader();

    try {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const toSend = new TextEncoder().encode(line + '\r');
        await window.sendBytes(toSend);
        debugWindow.value += `Sent line ${i+1}/${lines.length}: ${line.slice(0,40)}${line.length > 40 ? '...' : ''}\n`;

        let sawXon = false;
        let receivedBytes = [];
        const lineStart = Date.now();

        while (!sawXon && Date.now() - lineStart < 10000) {
          const { value, done } = await tempReader.read();
          if (done || !value) {
            await new Promise(r => setTimeout(r, 10)); // small poll delay
            continue;
          }

          for (const b of value) {
            receivedBytes.push(b);
            debugWindow.value += `Received byte: 0x${b.toString(16).toUpperCase().padStart(2, '0')}\n`;

            if (b === XON) {
              sawXon = true;
            }
          }
        }

        if (!sawXon) {
          throw new Error(`Timeout waiting for XON (0x11) after line ${i+1}`);
        }

        debugWindow.value += `Line ${i+1} complete - full response: ${receivedBytes.map(b => b.toString(16).padStart(2,'0')).join(' ')}\n`;

        const progress = Math.round(((i + 1) / lines.length) * 100);
        fwProgress.value = progress;
        fwStatus.textContent = `Progress: ${progress}% (${i+1}/${lines.length})`;
      }

      fwStatus.textContent = 'Upload complete';
      fwProgress.value = 100;
      debugWindow.value += "Upload finished successfully\n";

    } finally {
      tempReader.releaseLock();
    }

  } catch (err) {
    fwStatus.textContent = 'Error: ' + err.message;
    fwProgress.value = 0;
    debugWindow.value += `Upload error: ${err.message}\n`;
  } finally {
    updateInProgress = false;
    fwUpdateBtn.disabled = false;
    fwProgressContainer.style.display = 'none';
    if (timerInterval) clearInterval(timerInterval);

    // Resume main background reader
    if (port && port.readable) {
      window.reader = port.readable.getReader();
      if (typeof window.readLoop === 'function') window.readLoop();
    }
  }
});

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
