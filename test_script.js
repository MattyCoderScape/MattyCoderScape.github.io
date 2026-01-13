let portOpen = false;
let portPromise;
let holdPort = null;
let port;
let reader;

window.onload = function () {
  if ("serial" in navigator) {
    // Button listeners
    document.getElementById("openclose_port").addEventListener("click", openClose);
    document.getElementById("clear").addEventListener("click", clearTerminal);
    document.getElementById("send").addEventListener("click", sendString);
    document.getElementById("term_input").addEventListener("keydown", detectEnter);
    document.getElementById("csum").addEventListener("click", calculateCSUM);

    // Hex input validation & live cleaning
    document.getElementById("term_input").addEventListener("keydown", restrictToHex);
    document.getElementById("term_input").addEventListener("input", liveHexValidate);

    clearTerminal();

    // Handle prefill from URL ?prefill=...
    const params = new URLSearchParams(window.location.search);
    const preFill = params.get("prefill");
    if (preFill) {
      document.getElementById("term_input").value = preFill;
    }

    // Force correct initial disabled state
    portOpen = false;
    document.getElementById("term_input").disabled = true;
    document.getElementById("send").disabled = true;
    document.getElementById("clear").disabled = true;
    document.getElementById("openclose_port").innerText = "Open";
    document.getElementById("port_info").innerText = "Disconnected";
  } else {
    alert("Web Serial API is not supported by your browser.\nCSUM tool still works though.");
    document.getElementById("csum").addEventListener("click", calculateCSUM);
  }
};

// Block invalid keys (only allow hex + controls)
function restrictToHex(e) {
  if (e.ctrlKey || e.metaKey || e.key.length > 1) return; // allow paste, arrows, backspace, delete
  const char = e.key.toUpperCase();
  if (!/[0-9A-F]/.test(char)) {
    e.preventDefault();
  }
}

// Clean input live (paste, cut, drag-drop)
function liveHexValidate() {
  const el = document.getElementById("term_input");
  let val = el.value.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (val !== el.value) {
    el.value = val;
  }
  // Visual feedback for odd length
  el.style.borderColor = (val.length % 2 !== 0) ? "#FF9800" : "";
  el.style.backgroundColor = (val.length % 2 !== 0) ? "#FFF3E0" : "";
}

// Calculate running XOR checksum
function calculateCSUM() {
  const inputEl = document.getElementById("term_input");
  const debugEl = document.getElementById("debug_window");
  const resultEl = document.getElementById("csum_result");

  let raw = (inputEl.value || "").trim().toUpperCase();

  if (debugEl) {
    debugEl.value += `\n[CSUM] Input: "${raw}"  (len: ${raw.length})\n`;
  }

  let hex = raw.replace(/[^0-9A-F]/g, '');

  if (hex.length === 0) {
    resultEl.value = "00";
    resultEl.style.backgroundColor = "#E8F5E9";
    if (debugEl) debugEl.value += "→ Empty input → 00\n";
    return;
  }

  if (hex.length % 2 !== 0) {
    alert("Odd number of hex digits (" + hex.length + "). Must be even (byte pairs).");
    if (debugEl) debugEl.value += "→ Odd length → aborted\n";
    return;
  }

  let xor = 0;
  let bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    const pair = hex.substring(i, i + 2);
    const byte = parseInt(pair, 16);
    bytes.push(byte);
    xor ^= byte;
  }

  const result = xor.toString(16).toUpperCase().padStart(2, '0');
  resultEl.value = result;
  resultEl.style.backgroundColor = "#E0F7FA"; // light cyan on success

  if (debugEl) {
    debugEl.value += `→ ${bytes.length} bytes  → XOR = ${result}\n`;
  }
}

async function openClose() {
  if (portOpen) {
    // Close
    if (reader) reader.cancel();
  } else {
    // Open
    portPromise = new Promise(async (resolve) => {
      try {
        const filters = [{ usbVendorId: 0x0403, usbProductId: 0x6001 }];

        if (holdPort) {
          port = holdPort;
          holdPort = null;
        } else {
          port = await navigator.serial.requestPort({ filters });
        }

        await port.open({ baudRate: 9600 });

        reader = port.readable.getReader();

        portOpen = true;
        document.getElementById("openclose_port").innerText = "Close";
        document.getElementById("term_input").disabled = false;
        document.getElementById("send").disabled = false;
        document.getElementById("clear").disabled = false;

        const info = port.getInfo();
        document.getElementById("port_info").innerText =
          `Connected - VID: 0x${info.usbVendorId?.toString(16) || "?"} PID: 0x${info.usbProductId?.toString(16) || "?"}`;

        // Read loop
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            reader.releaseLock();
            break;
          }
          value.forEach(byte => {
            document.getElementById("term_window").value +=
              byte.toString(16).toUpperCase().padStart(2, '0') + " ";
          });
        }

        await port.close();

        portOpen = false;
        document.getElementById("openclose_port").innerText = "Open";
        document.getElementById("term_input").disabled = true;
        document.getElementById("send").disabled = true;
        document.getElementById("clear").disabled = true;
        document.getElementById("port_info").innerText = "Disconnected";

        resolve();
      } catch (err) {
        console.error("Port open failed:", err);
        alert("Failed to open port: " + err.message);
        resolve();
      }
    });
  }
}

async function sendString() {
  if (!portOpen) return;

  const writer = port.writable.getWriter();
  try {
    // You can change this line to send whatever is in the input field instead
    // For now keeping your original firmware version request
    const data = new Uint8Array([0xC3, 0x05, 0x00, 0x01, 0xB6, 0x71]);
    await writer.write(data);

    const text = document.getElementById("term_input").value.trim();
    if (text) {
      document.getElementById("term_window").value += "\n> " + text + "\n";
    }
    document.getElementById("term_input").value = "";
  } finally {
    writer.releaseLock();
  }
}

function clearTerminal() {
  document.getElementById("term_window").value = "";
  document.getElementById("debug_window").value = "Debug Window\n";
}

function detectEnter(e) {
  if (e.keyCode === 13) {
    e.preventDefault();
    sendString();
  }
}
