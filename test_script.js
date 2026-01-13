let port;
let reader;
let portOpen = false;
let rxByteCount = 0;

const termInput   = document.getElementById("term_input");
const sendBtn     = document.getElementById("send");
const clearBtn    = document.getElementById("clear");
const openBtn     = document.getElementById("openclose_port");
const portInfo    = document.getElementById("port_info");
const termWindow  = document.getElementById("term_window");
const debugWindow = document.getElementById("debug_window");
const csumBtn     = document.getElementById("csum");
const csumResult  = document.getElementById("csum_result");
const rxCountEl   = document.getElementById("rx_count");

// Update UI states
function updateUI() {
  const connected = !!portOpen;
  openBtn.textContent  = connected ? "Close" : "Open";
  portInfo.textContent = connected ? "Connected" : "Disconnected";
  sendBtn.disabled     = !connected;
  termInput.disabled   = false;   // always enabled
  clearBtn.disabled    = false;
  csumBtn.disabled     = false;
}

window.onload = function () {
  updateUI();

  termWindow.value = "";   // clear any initial placeholder

  // Listeners
  csumBtn.addEventListener("click", calculateCSUM);
  clearBtn.addEventListener("click", () => {
    termWindow.value = "";
    rxByteCount = 0;
    rxCountEl.textContent = "0 bytes received";
  });
  openBtn.addEventListener("click", togglePort);
  sendBtn.addEventListener("click", sendData);
  termInput.addEventListener("keydown", detectEnter);
  termInput.addEventListener("input", liveCleanInput);

  // Optional URL prefill
  const params = new URLSearchParams(window.location.search);
  const prefill = params.get("prefill");
  if (prefill) termInput.value = prefill;
};

function liveCleanInput() {
  let val = termInput.value.replace(/[^0-9A-Fa-f]/gi, '');
  if (val !== termInput.value) termInput.value = val;
  termInput.style.borderColor = (val.length % 2 !== 0) ? "#FF9800" : "";
}

function calculateCSUM() {
  let val = termInput.value.trim().toUpperCase().replace(/[^0-9A-F]/g, '');
  termInput.value = val;

  let hex = val;

  debugWindow.value += `\n[CSUM] "${hex}" (${hex.length/2 || 0} bytes)\n`;

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
    xor ^= parseInt(hex.substring(i, i+2), 16);
  }

  const result = xor.toString(16).toUpperCase().padStart(2, '0');
  csumResult.value = result;
  debugWindow.value += `→ CSUM = ${result}\n`;
}

async function togglePort() {
  if (portOpen) {
    if (reader) await reader.cancel().catch(() => {});
    if (port) await port.close().catch(() => {});
    port = null;
    reader = null;
    portOpen = false;
    updateUI();
    debugWindow.value += "Port closed\n";
    return;
  }

  try {
    port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x0403, usbProductId: 0x6001 }]
    });

    await port.open({ baudRate: 9600 });
    reader = port.readable.getReader();

    portOpen = true;
    updateUI();
    debugWindow.value += "Port opened\n";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      let bytesStr = "";
      for (let b of value) {
        bytesStr += b.toString(16).toUpperCase().padStart(2, '0');
        rxByteCount++;
      }

      termWindow.value += bytesStr;
      termWindow.scrollTop = termWindow.scrollHeight;
      rxCountEl.textContent = `${rxByteCount} bytes received`;
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
    debugWindow.value += `Sent: ${toSend}\n`;
  } catch (err) {
    debugWindow.value += `Send error: ${err.message}\n`;
  } finally {
    writer.releaseLock();
  }
}

function detectEnter(e) {
  if (e.keyCode === 13) {
    e.preventDefault();
    sendData();
  }
}

updateUI();

