const fwUpdateBtn = document.getElementById('fw_update');
const fwFileInput = document.getElementById('fw_file_input');
const fwStatus = document.getElementById('fw_status');
const fwProgress = document.getElementById('fw_progress');
const fwProgressContainer = document.getElementById('fw_progress_container');

let updateInProgress = false;

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
  fwProgressContainer.style.display = 'block';
  fwProgress.value = 0;

  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith(';') && !l.startsWith('#'));

    fwStatus.textContent = `Sending ${lines.length} lines...`;

    // Send bootloader entry command
    const bootCmd = new Uint8Array([0xC3, 0x05, 0x00, 0x01, 0xC0, 0x07]);
    await sendBytes(bootCmd);
    await delay(800);

    let lineIndex = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const encoder = new TextEncoder();
      const lineBytes = encoder.encode(trimmed + '\r\n');

      await sendBytes(lineBytes);

      // Wait for ACK 0x06
      const ackReceived = await waitForACK(0x06, 3000);
      if (!ackReceived) {
        throw new Error(`No ACK received for line ${lineIndex + 1}`);
      }

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
    fwProgressContainer.style.display = 'none';
    fwFileInput.value = ''; // reset file input
  }
});

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
