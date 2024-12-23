// This Converts a number to a hexadecimal string
function decToHexString(number)
{
  if(number<0) number = 0xFFFFFFFF + number + 1;
  return number.toString(16).toUpperCase().padStart(2,'0');
}
// Test it
console.log(decimalToHexString(10));

// Other Use Case console.log(2..toString(16).toUpperCase().padStart(2,'0'));
// Yes it needs tow dots ..

//*********

// This reverses the process and returns an integer
yourNumber = parseInt(hexString, 16);

//Test it
console.log(parseInt('0xFF', 16)); //returns 255
//or
console.log(parseInt('ff', 16)); // returns 255
//or
console.log((parseInt('0x1', 16)) + (parseInt('0xA', 16))); //returns 11

// This returns a string created from an equivalent HEX Value from the ASCII Table

console.log(String.fromCharCode(0x61).toUpperCase().padStart(2,'0')); // Returns 0A
console.log(String.fromCharCode(0x41).toUpperCase().padStart(2,'0')); // Also returns 0A



// Useful Links
// https://developer.chrome.com/docs/capabilities/serial
// https://wicg.github.io/serial/
// https://sparkfunx.github.io/WebTerminalDemo/