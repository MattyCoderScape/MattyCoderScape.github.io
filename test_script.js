avaScriptlet portOpen = false;           // tracks whether a port is currently open
let portPromise;                // promise used to wait until port successfully closed
let holdPort = null;            // park a SerialPort object when changing settings
let port;                       // current SerialPort object
let reader;                     // current port reader so we can .cancel() it

// Do these things when the window is done loading
window.onload = function () {
  if ("serial" in navigator) {
    // Connect event listeners
    document.getElementById("openclose_port").addEventListener("click", openClose);
    document.getElementById("clear").addEventListener("click", clearTerminal);
    document.getElementById("send").addEventListener("click", sendString);
    document.getElementById("term_input").addEventListener("keydown", detectEnter);

    // Clear terminal on load
    clearTerminal();

    // Optional: prefill from URL query ?prefill=...
    const params = new URLSearchParams(window.location.search);
    const preFill = params.get("prefill");
    if (preFill) {
      document.getElementById("term_input").value = preFill;
    }
  } else {
    alert("The Web Serial API is not supported by your browser");
  }
};

// Open / Close port button handler
async function openClose() {
  if (portOpen) {
    // Close existing port
    if (reader) reader.cancel();
    console.log("attempt to close");
  } else {
    // Open new port
    portPromise = new Promise(async (resolve) => {
      try {
        const filters = [{ usbVendorId: 0x0403, usbProductId: 0x6001 }];
        if (holdPort == null) {
          port = await navigator.serial.requestPort({ filters });
        } else {
          port = holdPort;
          holdPort = null;
        }

        await port.open({ baudRate: 9600 });  // change to 115200 if needed

        reader = port.readable.getReader();

        portOpen = true;
        document.getElementById("openclose_port").innerText = "Close";
        document.getElementById("term_input").disabled = false;
        document.getElementById("send").disabled = false;
        document.getElementById("clear").disabled = false;

        // Show port info
        const info = port.getInfo();
        document.getElementById("port_info").innerText =
          `Connected to device with VID 0x${info.usbVendorId?.toString(16) || "?"} ` +
          `and PID 0x${info.usbProductId?.toString(16) || "?"}`;

        // Read loop
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            reader.releaseLock();
            break;
          }
          // Display received bytes as hex
          let hexLine = "";
          value.forEach((b) => {
            hexLine += b.toString(16).toUpperCase().padStart(2, "0") + " ";
          });
          document.getElementById("term_window").value += hexLine + "\n";
          document.getElementById("term_window").scrollTop = document.getElementById("term_window").scrollHeight;
          console.log("RX:", hexLine.trim());
        }

        // Port closed
        await port.close();
        portOpen = false;
        document.getElementById("openclose_port").innerText = "Open";
        document.getElementById("term_input").disabled = true;
        document.getElementById("send").disabled = true;
        document.getElementById("clear").disabled = true;
        document.getElementById("port_info").innerText = "Disconnected";

        console.log("port closed");
        resolve();
      } catch (err) {
        console.error("Port error:", err);
        resolve();
      }
    });
  }
}

// Send command with automatic XOR checksum
async function sendString() {
  const inputElem = document.getElementById("term_input");
  let userInput = inputElem.value.trim().toUpperCase();
  inputElem.value = ""; // clear input

  // Clean input: remove anything that's not 0-9A-F
  const cleanHex = userInput.replace(/[^0-9A-F]/gi, "");

  if (cleanHex.length === 0 || cleanHex.length % 2 !== 0) {
    document.getElementById("debug_window").value += "Invalid hex input (odd length or empty)\n";
    return;
  }

  // Parse hex string into byte array and compute XOR
  let xor = 0;
  const bytes = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    const byteStr = cleanHex.substring(i, i + 2);
    const byte = parseInt(byteStr, 16);
    bytes.push(byte);
    xor ^= byte;
  }

  // Append checksum
  bytes.push(xor);

  // Show what we're sending in debug window
  const hexSent = bytes.map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  document.getElementById("debug_window").value += `> ${hexSent}  (checksum = ${xor.toString(16).toUpperCase().padStart(2, "0")})\n`;
  document.getElementById("debug_window").scrollTop = document.getElementById("debug_window").scrollHeight;

  // Send raw bytes over serial
  if (port && port.writable) {
    const writer = port.writable.getWriter();
    try {
      const packet = new Uint8Array(bytes);
      await writer.write(packet);
      console.log("Sent:", hexSent);
    } catch (err) {
      console.error("Send failed:", err);
      document.getElementById("debug_window").value += "Send error: " + err.message + "\n";
    } finally {
      writer.releaseLock();
    }
  } else {
    document.getElementById("debug_window").value += "Not connected - cannot send\n";
  }

  // Optional: echo the original user input too
  document.getElementById("term_window").value += "\n> " + userInput + "\n";
}

// Clear terminals
function clearTerminal() {
  document.getElementById("term_window").value = "";
  document.getElementById("debug_window").value = "";
}

// Send on Enter key
function detectEnter(e) {
  if (e.keyCode === 13) {
    e.preventDefault();
    sendString();
  }
}