let portOpen = false;
let portPromise;
let holdPort = null;
let port;
let reader;

window.onload = function () {
  if ("serial" in navigator) {
    document.getElementById("openclose_port").addEventListener("click", openClose);
    document.getElementById("clear").addEventListener("click", clearTerminal);
    document.getElementById("send").addEventListener("click", sendString);
    document.getElementById("term_input").addEventListener("keydown", detectEnter);
    document.getElementById("csum").addEventListener("click", calculateCSUM);

    // Hex-only input + live cleaning
    document.getElementById("term_input").addEventListener("keydown", restrictToHex);
    document.getElementById("term_input").addEventListener("input", liveHexValidate);

    clearTerminal();

    const params = new URLSearchParams(window.location.search);
    const preFill = params.get("prefill");
    if (preFill) document.getElementById("term_input").value = preFill;

    // Force clean initial state
    portOpen = false;
    document.getElementById("term_input").disabled = true;
    document.getElementById("send").disabled = true;
    document.getElementById("clear").disabled = true;
    document.getElementById("openclose_port").innerText = "Open";
    document.getElementById("port_info").innerText = "Disconnected";
  } else {
    alert("Web Serial not supported – CSUM still works.");
    document.getElementById("csum").addEventListener("click", calculateCSUM);
  }
};

function restrictToHex(e) {
  if (e.ctrlKey || e.metaKey || e.key.length > 1) return;
  if (!/[0-9A-Fa-f]/.test(e.key)) {
    e.preventDefault();
  }
}

function liveHexValidate() {
  const el = document.getElementById("term_input");
  let val = el.value.replace(/[^0-9A-Fa-f]/g, '');
  if (val !== el.value) el.value = val;
  el.style.borderColor = (val.length % 2 !== 0) ? "#FF9800" : "";
}

function calculateCSUM() {
  const inputEl = document.getElementById("term_input");
  const resultEl = document.getElementById("csum_result");
  const debugEl = document.getElementById("debug_window");

  // 1. Uppercase + clean
  let val = inputEl.value.toUpperCase().replace(/[^0-9A-F]/g, '');
  inputEl.value = val;

  let hex = val;
  if (debugEl) debugEl.value += `\n[CSUM] "${hex}"  (len: ${hex.length})\n`;

  if (hex.length === 0) {
    resultEl.value = "00";
    return;
  }

  if (hex.length % 2 !== 0) {
    alert("Odd number of hex digits – must be even.");
    if (debugEl) debugEl.value += "→ Odd length – aborted\n";
    return;
  }

  let xor = 0;
  for (let i = 0; i < hex.length; i += 2) {
    xor ^= parseInt(hex.substring(i, i + 2), 16);
  }

  const result = xor.toString(16).toUpperCase().padStart(2, '0');
  resultEl.value = result;

  if (debugEl) debugEl.value += `→ XOR = ${result}\n`;
}

async function sendString() {
  if (!portOpen) {
    alert("Port not open.");
    return;
  }

  const inputEl = document.getElementById("term_input");
  const csumEl = document.getElementById("csum_result");
  let hexStr = inputEl.value.trim().toUpperCase().replace(/[^0-9A-F]/g, '');

  if (hexStr.length === 0) {
    alert("Nothing to send.");
    return;
  }

  if (hexStr.length % 2 !== 0) {
    alert("Odd number of hex digits – cannot send.");
    return;
  }

  // Append checksum if it looks valid (not just placeholder)
  let fullHex = hexStr;
  if (csumEl.value && csumEl.value !== "00" && csumEl.value.length === 2) {
    fullHex += csumEl.value;
  }

  // Convert to byte array
  const bytes = [];
  for (let i = 0; i < fullHex.length; i += 2) {
    bytes.push(parseInt(fullHex.substring(i, i + 2), 16));
  }

  const writer = port.writable.getWriter();
  try {
    await writer.write(new Uint8Array(bytes));

    // Show what was sent
    document.getElementById("term_window").value += 
      "\n> " + fullHex.match(/.{2}/g).join(" ") + "\n";

    // Optional: clear input after send
    // inputEl.value = "";
  } catch (err) {
    console.error("Send failed:", err);
  } finally {
    writer.releaseLock();
  }
}

async function openClose() {
  if (portOpen) {
    if (reader) reader.cancel();
    return;
  }

  portPromise = new Promise(async (resolve) => {
    try {
      const filters = [{ usbVendorId: 0x0403, usbProductId: 0x6001 }];
      port = holdPort ? holdPort : await navigator.serial.requestPort({ filters });
      holdPort = null;

      await port.open({ baudRate: 9600 });
      reader = port.readable.getReader();

      portOpen = true;
      document.getElementById("openclose_port").innerText = "Close";
      document.getElementById("term_input").disabled = false;
      document.getElementById("send").disabled = false;
      document.getElementById("clear").disabled = false;

      let info = port.getInfo();
      document.getElementById("port_info").innerText = 
        `Connected – VID:0x${(info.usbVendorId||0).toString(16)} PID:0x${(info.usbProductId||0).toString(16)}`;

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
          break;
        }
        let s = "";
        value.forEach(b => s += b.toString(16).toUpperCase().padStart(2,'0') + " ");
        document.getElementById("term_window").value += s;
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
      console.error(err);
      alert("Port error: " + err.message);
      resolve();
    }
  });
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
