// fw_update.js V17 – recreate reader after each line to avoid stall

const fwBrowseBtn = document.getElementById('fw_browse');
const fwUpdateBtn = document.getElementById('fw_update');
const fwFileInput = document.getElementById('fw_file_input');
const fwFileName = document.getElementById('fw_file_name');
const fwStatus = document.getElementById('fw_status');
const fwProgress = document.getElementById('fw_progress');
const fwProgressContainer = document.getElementById('fw_progress_container');

let selectedFile = null;
let updateInProgress = false;

fwBrowseBtn.addEventListener('click', () => {
  fwFileInput.click();
});

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
  if (!selectedFile) {
    fwStatus.textContent = 'No file selected';
    return;
  }
  if (updateInProgress) {
    fwStatus.textContent = 'Update already in progress';
    return;
  }
  if (!portOpen) {
    fwStatus.textContent = 'Port must be open first';
    return;
  }

  updateInProgress = true;
  fwStatus.textContent = 'Reading file...';
  fwProgressContainer.style.display = 'block';
  fwProgress.value = 0;
  fwUpdateBtn.disabled = true;

  try {
    const text = await selectedFile.text();
    const lines = text.split(/\r?\n/);

    const validLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith(';') || line.startsWith('#')) continue;
      if (line.startsWith(':') || line.startsWith('|')) {
        validLines.push(line);
      } else {
        debugWindow.value += `Skipped invalid line ${i + 1}: ${line.substring(0, 40)}...\n`;
      }
    }

    if (validLines.length === 0) {
      throw new Error("No valid HEX lines found in file");
    }

    fwStatus.textContent = `Sending ${validLines.length} valid lines...`;
    debugWindow.value += `FW update started: ${validLines.length} valid lines from ${selectedFile.name}\n`;

    debugWindow.value += "Direct line-by-line upload (no C0 or wait - unit in BL mode)\n";

    let lineIndex = 0;
    for (const line of validLines) {
      const trimmed = line.trim();

      const encoder = new TextEncoder();
      const lineBytes = encoder.encode(trimmed + '\r');

      debugWindow.value += `Sending line ${lineIndex + 1}: ${trimmed}\n`;
      await window.sendBytes(lineBytes);

      // Recreate reader to avoid stall
      if (reader) {
        await reader.cancel().catch(() => {});
        reader = null;
      }
      reader = port.readable.getReader();

      // Wait for response
      let retMsg = new Uint8Array(0);
      const start = Date.now();
      while (retMsg.length < 2 && Date.now() - start < 3000) {
        try {
          const { value, done } = await reader.read();
          if (done || !value) break;
          retMsg = new Uint8Array([...retMsg, ...value]);
          debugWindow.value += `Chunk received: ${Array.from(value).map(b => b.toString(16).padStart(2,'0')).join(' ')}\n`;
        } catch (e) {
          debugWindow.value += `Read error: ${e.message}\n`;
          break;
        }
      }

      if (retMsg.length >= 2) {
        const hexResp = Array.from(retMsg.slice(0,2)).map(b => b.toString(16).padStart(2,'0')).join(' ');
        debugWindow.value += `Line ${lineIndex + 1} response: ${hexResp}\n`;
      } else {
        debugWindow.value += `Line ${lineIndex + 1}: no response or timeout\n`;
      }

      lineIndex++;
      const progress = Math.round((lineIndex / validLines.length) * 100);
      fwProgress.value = progress;
      fwStatus.textContent = `Progress: ${progress}% (${lineIndex}/${validLines.length} lines)`;
    }

    fwStatus.textContent = 'Firmware upload complete';
    fwProgress.value = 100;
    debugWindow.value += "FW upload complete\n";

  } catch (err) {
    fwStatus.textContent = 'Error: ' + err.message;
    fwProgress.value = 0;
    debugWindow.value += `FW update error: ${err.message}\n`;
  } finally {
    updateInProgress = false;
    fwUpdateBtn.disabled = false;
    fwProgressContainer.style.display = 'none';
  }
});

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
