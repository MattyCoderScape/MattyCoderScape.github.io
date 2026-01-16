// test_script.js V17.7 – terminal logic only, no global reader

window.TEST_SCRIPT_VERSION = "17.7";

let port;
let portOpen = false;
let rxByteCount = 0;
let displayMode = "hex";

const termInput = document.getElementById("term_input");
const sendBtn = document.getElementById("send");
const clearBtn = document.getElementById("clear");
const openBtn = document.getElementById("openclose_port");
const portInfo = document.getElementById("port_info");
const termWindow = document.getElementById("term_window");
const debugWindow = document.getElementById("debug_window");
const csumBtn = document.getElementById("csum");
const csumResult = document.getElementById("csum_result");
const rxCountEl = document.getElementById("rx_count");

// Update UI states
function updateUI(connected = portOpen) {
  openBtn.textContent = connected ? "Close Port" : "Open Port";

  if (connected) {
    portInfo.textContent = "Connected";
    portInfo.classList.remove("disconnected");
    portInfo.classList.add("connected");
  } else {
    portInfo.textContent = "Disconnected";
    portInfo.classList.remove("connected");
    portInfo.classList.add("disconnected");
  }

  sendBtn.disabled = !connected;
  termInput.disabled = false;
  clearBtn.disabled = false;
  csumBtn.disabled = false;
}

function liveCleanInput() {
  let val = termInput.value.replace(/[^0-9A-Fa-f]/gi, '');
  if (val !== termInput.value) termInput.value = val;
  termInput.style.borderColor = (val.length % 2 !== 0) ? "#FF9800" : "";
}

function calculateCSUM() {
  let val = termInput.value.trim().toUpperCase().replace(/[^0-9A-F]/g, '');
  termInput.value = val;
  let hex = val;
  debugWindow.value += `\n[CSUM] "${hex}" (${Math.floor(hex.length / 2)} bytes)\n`;
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
  debugWindow.value += `→ CSUM = ${result}\n`;
}

async function togglePort() {
  if (portOpen) {
    if (isFirmwareStrictUploadActive) {
      debugWindow.value += "Cannot close port while strict upload is active\n";
      return;
    }
    if (terminalReadController) {
      terminalReadController.abort();
    }
    if (port) await port.close().catch(() => {});
    port = null;
    portOpen = false;
    updateUI();
    debugWindow.value += "Port closed\n";
    return;
  }

  try {
    port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x0403, usbProductId: 0x6001 }]
    });
    await port.open({ baudRate: 115200 });
    portOpen = true;
    updateUI();
    const info = port.getInfo();
    debugWindow.value += "Port opened\n";
    debugWindow.value += `usbVendorId: ${info.usbVendorId ?? 'undefined'} (0x${(info.usbVendorId ?? 0).toString(16).padStart(4, '0')})\n`;
    debugWindow.value += `usbProductId: ${info.usbProductId ?? 'undefined'} (0x${(info.usbProductId ?? 0).toString(16).padStart(4, '0')})\n\n`;

    startTerminalReader();
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
  rxByteCount = 0;
  rxCountEl.textContent = "0 bytes received";
  termWindow.value = "";
  let toSend = hex;
  if (csumResult.value.length === 2 && /^[0-9A-F]{2}$/i.test(csumResult.value)) {
    toSend += csumResult.value;
  }
  const bytes = new Uint8Array(
    toSend.match(/.{1,2}/g).map(b => parseInt(b, 16))
  );
  try {
    await window.sendBytes(bytes);
    debugWindow.value += `Sent: ${toSend}\n`;
  } catch (err) {
    debugWindow.value += `Send error: ${err.message}\n`;
  }
}

function detectEnter(e) {
  if (e.keyCode === 13) {
    e.preventDefault();
    sendData();
  }
}

updateUI();