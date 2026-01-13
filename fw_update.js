// fw_update.js

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

    // Validate line prefixes
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith(':')) continue; // plain HEX OK
      if (line.startsWith('|')) continue; // encrypted OK
      throw new Error(`Invalid line ${i + 1}: must start with ':' or '|'`);
    }

    fwStatus.textContent = `Sending ${lines.length} lines...`;

    // Step 1: Enter bootloader mode
    const bootCmd = new Uint8Array([0xC3, 0x05, 0x00, 0x01, 0xC0, 0x07]);
    await window.sendBytes(bootCmd);
    debugWindow.value += "Sent C0 bootloader entry command\n";
    await delay(2000); // 2000 ms wait for reset

    let lineIndex = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const encoder = new TextEncoder();
      const lineBytes = encoder.encode(trimmed + '\r\n');

      await window.sendBytes(lineBytes);
      debugWindow.value += `Sent line ${lineIndex + 1}: ${trimmed}\n`;

      // Wait for one of the 3 possible responses
      const response = await waitForAnyOf([0x06, 0x11, 0x13], 3000);
      if (response === null) {
        throw new Error(`No response (ACK/XON/XOFF) for line ${lineIndex + 1}`);
      }

      debugWindow.value += `Received response for line ${lineIndex + 1}: 0x${response.toString(16).padStart(2, '0')}\n`;

      lineIndex++;
      const progress = Math.round((lineIndex / lines.length) * 100);
      fwProgress.value = progress;
      fwStatus.textContent = `Progress: ${progress}% (${lineIndex}/${lines.length} lines)`;
      await delay(30);
    }

    fwStatus.textContent = 'Firmware update complete';
    fwProgress.value = 100;

  } catch (err) {
    fwStatus.textContent = 'Error: ' + err.message;
    fwProgress.value = 0;
  } finally {
    updateInProgress = false;
    fwUpdateBtn.disabled = false;
    fwProgressContainer.style.display = 'none';
    fwFileInput.value = '';
    selectedFile = null;
    fwFileName.textContent = 'No file selected';
  }
});

// Wait for any of multiple bytes (0x06, 0x11, 0x13)
async function waitForAnyOf(expectedBytes, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), timeoutMs);

    (async () => {
      try {
        while (true) {
          const { value, done } = await window.getReader().read();
          if (done) break;
          for (let b of value) {
            if (expectedBytes.includes(b)) {
              clearTimeout(timeout);
              resolve(b);
              return;
            }
          }
        }
        clearTimeout(timeout);
        resolve(null);
      } catch {
        clearTimeout(timeout);
        resolve(null);
      }
    })();
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
