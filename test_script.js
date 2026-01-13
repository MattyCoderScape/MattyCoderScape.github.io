let port;
let reader;
let portOpen = false;

const termInput   = document.getElementById("term_input");
const sendBtn     = document.getElementById("send");
const clearBtn    = document.getElementById("clear");
const openBtn     = document.getElementById("openclose_port");
const portInfo    = document.getElementById("port_info");
const termWindow  = document.getElementById("term_window");
const debugWindow = document.getElementById("debug_window");
const csumBtn     = document.getElementById("csum");
const csumResult  = document.getElementById("csum_result");

// Update button states — input always enabled
function updateUI() {
  const connected = !!portOpen;
  if (openBtn)     openBtn.textContent  = connected ? "Close" : "Open";
  if (portInfo)    portInfo.textContent = connected ? "Connected" : "Disconnected";
  if (sendBtn)     sendBtn.disabled     = !connected;
  if (clearBtn)    clearBtn.disabled    = false;
  if (csumBtn)     csumBtn.disabled     = false;
  if (termInput)   termInput.disabled   = false;   // always usable
}

window.onload = function () {
  resetDebug();

  updateUI();

  // Event listeners
  if (csumBtn)     csumBtn.addEventListener("click", calculateCSUM);
  if (clearBtn)    clearBtn.addEventListener("click", clearTerminal);
  if (openBtn)     openBtn.addEventListener("click", togglePort);
  if (sendBtn)     sendBtn.addEventListener("click", sendData);
  if (termInput) {
    termInput.addEventListener("keydown", detectEnter);
    termInput.addEventListener("input", liveCleanInput);
  }

  // Optional URL prefill
  const params = new URLSearchParams(window.location.search);
  const prefill = params.get("prefill");
  if (prefill && termInput) termInput.value = prefill;
};

function resetDebug() {
  if (debugWindow) debugWindow.value = "Debug messages\n";
}

function liveCleanInput() {
  const el = termInput;
  if (!el) return;
  let val = el.value.replace(/[^0-9A-Fa-f]/gi, '');
  if (val !== el.value) el.value = val;
  el.style.borderColor = (val.length % 2 !== 0) ? "#FF9800" : "";
}

function calculateCSUM() {
  if (!termInput || !csumResult) return;

  let val = termInput.value.trim().toUpperCase().replace(/[^0-9A-F]/g, '');
  termInput.value = val;

  let hex = val;

  debugWindow.value += `\n[CSUM] "${hex}" (${hex.length} chars)\n`;

  if (hex.length === 0) {
    csumResult.value = "00";
    return;
  }

  if (hex.length % 2 !== 0) {
    debugWindow.value += "→ Odd length\n";
    alert("Odd number of hex digits");
    return;
  }

  let xor = 0;
  for (let i = 0; i < hex.length; i += 2) {
    xor ^= parseInt(hex.substring(i, i + 2), 16);
  }

  const result = xor.toString(16).toUpperCase().padStart(2, '0');
  csumResult.value = result;
  debugWindow.value += `→ XOR = ${result}\n`;
}

async function togglePort() {
  if (portOpen) {
    // Close
    if (reader) await reader.cancel().catch(() => {});
    if (port) await port.close().catch(() => {});
    port = null;
    reader = null;
    portOpen = false;
    updateUI();
    debugWindow.value += "Port closed\n";
    return;
  }

  // Open
  try {
    port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x0403, usbProductId: 0x6001 }]
    });

    await port.open({ baudRate: 9600 });
    reader = port.readable.getReader();

    portOpen = true;
    updateUI();
    debugWindow.value += "Port opened\n";

    // Read loop
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      let line = "";
      value.forEach(b => line += b.toString(16).toUpperCase().padStart(2,'0') + " ");
      termWindow.value += line.trim() + "\n";
      termWindow.scrollTop = termWindow.scrollHeight;
    }
  } catch (err) {
    debugWindow.value += `Open failed: ${err.message}\n`;
    portOpen = false;
    updateUI();
  }
}

async function sendData() {
  if (!portOpen || !port?.writable) {
    debugWindow.value += "Cannot send – no port open\n";
    return;
  }

  let hex = termInput.value.trim().toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length === 0) {
    debugWindow.value += "Nothing to send\n";
    return;
  }
  if (hex.length % 2 !== 0) {
    debugWindow.value += "Odd hex length\n";
    return;
  }

  let toSend = hex;
  if (csumResult.value.length === 2 && /^[0-9A-F]{2}$/i.test(csumResult.value)) {
    toSend += csumResult.value;
  }

  const bytes = new Uint8Array(
    toSend.match(/.{1,2}/g).map(b => parseInt(b, 16))
  );

  const writer = port.writable.getWriter();
  try {
    await writer.write(bytes);
    termWindow.value += "> " + toSend.match(/.{1,2}/g).join(" ") + "\n";
    termWindow.scrollTop = termWindow.scrollHeight;
    debugWindow.value += `Sent: ${toSend}\n`;
  } catch (err) {
    debugWindow.value += `Send error: ${err.message}\n`;
  } finally {
    writer.releaseLock();
  }
}

function clearTerminal() {
  if (termWindow) termWindow.value = "";
}

function detectEnter(e) {
  if (e.keyCode === 13) {
    e.preventDefault();
    sendData();
  }
}

// Initial UI update
updateUI();
