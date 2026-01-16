// fw_update.js V32 – sendBytes bridge only

window.FW_UPDATE_VERSION = "32";

window.sendBytes = async function(bytes) {
  if (!portOpen || !port?.writable) {
    if (debugWindow) debugWindow.value += "Bridge: Cannot send - port not open\n";
    throw new Error("Port not open");
  }
  const writer = port.writable.getWriter();
  try {
    await writer.write(bytes);
    if (debugWindow) debugWindow.value += `Bridge: Sent ${bytes.length} bytes\n`;
  } catch (err) {
    if (debugWindow) debugWindow.value += `Send error: ${err.message}\n`;
    throw err;
  } finally {
    writer.releaseLock();
  }
};

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}