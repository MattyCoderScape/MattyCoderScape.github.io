// fw_update.js — firmware update with safe simulation mode

const fwUpdateBtn = document.getElementById('fw_update');
const fwFileInput = document.getElementById('fw_file_input');
const fwStatus = document.getElementById('fw_status');
const fwProgress = document.getElementById('fw_progress');
const fwProgressContainer = document.getElementById('fw_progress_container');

let updateInProgress = false;
let simulateMode = true; // CHANGE THIS TO false WHEN YOU ARE READY FOR REAL UPDATES

fwUpdateBtn.addEventListener('click', () => {
  if (updateInProgress) {
    fwStatus.textContent = 'Update already in progress';
    return;
  }
  if (!simulateMode && !portOpen) {
    fwStatus.textContent = 'Port must be open first (or enable simulation mode)';
    return;
  }
  fwFileInput.click();
});

fwFileInput.addEventListener('change', async () => {
  const file = fwFileInput.files[0];
  if (!file) return;

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

    fwStatus.textContent = `Processing ${lines.length} lines (${simulateMode ? 'SIMULATION MODE' : 'LIVE'})...`;

    if (!simulateMode) {
      // Real mode: send bootloader entry
      const bootCmd = new Uint8Array([0xC3, 0x05, 0x00, 0x01, 0xC0, 0x07]);
      await window.sendBytes(bootCmd);
      debugWindow.value += "Sent bootloader entry command\n";
      await delay(2000); // your requested 2000 ms reset wait

      // Optional: log any early response from bootloader
      const early = await waitForAnyData(500);
      if (early.length > 0) {
        debugWindow.value += `Bootloader early response: ${Array.from(early).map(b => b.toString(16).padStart(2,'0')).join(' ')}\n`;
      }
    } else {
      debugWindow.value += "SIMULATION: skipped bootloader entry, faking 2000 ms reset\n";
      await delay(2000);
    }

    let lineIndex = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (!simulateMode) {
        const encoder = new TextEncoder();
        const lineBytes = encoder.encode(trimmed + '\r\n');
        await window.sendBytes(lineBytes);
      } else {
        debugWindow.value += `SIMULATION: would send line ${lineIndex + 1}: ${trimmed}\n`;
      }

      // Wait for ACK (real or simulated)
      let ackReceived;
      if (!simulateMode) {
        ackReceived = await waitForACK(0x06, 3000);
      } else {
        // Simulate ACK with random delay (300-800 ms)
        await delay(300 + Math.random() * 500);
        ackReceived = true; // always "succeed" in simulation
        debugWindow.value += `SIMULATION: faked ACK for line ${lineIndex + 1}\n`;
      }

      if (!ackReceived) {
        throw new Error(`No ACK for line ${lineIndex + 1}: ${trimmed}`);
      }

      lineIndex++;
      const progress = Math.round((lineIndex / lines.length) * 100);
      fwProgress.value = progress;
      fwStatus.textContent = `Progress: ${progress}% (${lineIndex}/${lines.length} lines)`;
      await delay(30);
    }

    fwStatus.textContent = `Firmware update complete (${simulateMode ? 'SIMULATED' : 'REAL'})`;
    fwProgress.value = 100;

  } catch (err) {
    fwStatus.textContent = 'Error: ' + err.message;
    fwProgress.value = 0;
  } finally {
    updateInProgress = false;
    fwProgressContainer.style.display = 'none';
    fwFileInput.value = '';
  }
});

// Real ACK wait
async function waitForACK(expectedByte, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);

    (async () => {
      try {
        while (true) {
          const { value, done } = await window.getReader().read();
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

// Wait for any data (used during reset wait)
async function waitForAnyData(timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(new Uint8Array(0)), timeoutMs);

    (async () => {
      try {
        const { value, done } = await window.getReader().read();
        clearTimeout(timeout);
        if (done || !value) resolve(new Uint8Array(0));
        else resolve(value);
      } catch {
        clearTimeout(timeout);
        resolve(new Uint8Array(0));
      }
    })();
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
