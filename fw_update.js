// fw_update.js — isolated firmware update logic
// Does NOT touch any of the main serial code

const fwUpdateBtn = document.getElementById('fw_update');
const fwFileInput = document.getElementById('fw_file_input');
const fwStatus = document.getElementById('fw_status');
const fwProgress = document.getElementById('fw_progress');
const fwProgressContainer = document.getElementById('fw_progress_container');

let updateInProgress = false;

if (fwUpdateBtn) {
  fwUpdateBtn.addEventListener('click', () => {
    if (updateInProgress) {
      fwStatus.textContent = 'Update already in progress';
      return;
    }
    if (!portOpen) {
      fwStatus.textContent = 'Port must be open first';
      return;
    }
    fwFileInput.click();
  });
}

if (fwFileInput) {
  fwFileInput.addEventListener('change', async () => {
    const file = fwFileInput.files[0];
    if (!file) return;

    // Enforce file extension
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'hex' && ext !== 'tthex') {
      fwStatus.textContent = 'Please select a .hex or .tthex file';
      return;
    }

    updateInProgress = true;
    fwStatus.textContent = 'Reading file...';
    if (fwProgressContainer) fwProgressContainer.style.display = 'block';
    if (fwProgress) fwProgress.value = 0;

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith(';') && !l.startsWith('#'));

      fwStatus.textContent = `Sending ${lines.length} lines...`;

      // Send bootloader entry command (C3 05 00 01 C0 07)
      const bootCmd = new Uint8Array([0xC3, 0x05, 0x00, 0x01, 0xC0, 0x07]);
      await sendBytes(bootCmd);  // Uses the global sendBytes from test_script.js
      await delay(800);          // Give time for reset/bootloader init

      let lineIndex = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const encoder = new TextEncoder();
        const lineBytes = encoder.encode(trimmed + '\r\n');

        await sendBytes(lineBytes);

        // Wait for ACK (0x06)
        const ackReceived = await waitForACK(0x06, 3000);
        if (!ackReceived) {
          throw new Error(`No ACK received for line ${lineIndex + 1}`);
        }

        lineIndex++;
        const progress = Math.round((lineIndex / lines.length) * 100);
        if (fwProgress) fwProgress.value = progress;
        fwStatus.textContent = `Progress: ${progress}% (${lineIndex}/${lines.length} lines)`;
        await delay(30);
      }

      fwStatus.textContent = 'Firmware update complete';
      if (fwProgress) fwProgress.value = 100;

    } catch (err) {
      fwStatus.textContent = 'Error: ' + err.message;
      if (fwProgress) fwProgress.value = 0;
    } finally {
      updateInProgress = false;
      if (fwProgressContainer) fwProgressContainer.style.display = 'none';
      if (fwFileInput) fwFileInput.value = ''; // reset file input
    }
  });
}

// Wait for a specific byte (ACK = 0x06) with timeout
async function waitForACK(expectedByte, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);

    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          for (let b of value) {
            if (b === expectedByte) {
              clearTimeout(timeout);
              resolve(true);
              return;
            }
          }
        }
        clearTimeout(timeout);
        resolve(false);
      } catch {
        clearTimeout(timeout);
        resolve(false);
      }
    })();
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
