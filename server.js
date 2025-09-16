const express = require("express");
const bodyParser = require("body-parser");
const bluetooth = require("node-bluetooth");

// Create a bluetooth device instance
const device = new bluetooth.DeviceINQ();

const app = express();
app.use(bodyParser.json());

// Store printer address here after discovery
let printerAddress = null;

// Discover XP-P503A printer
app.get("/discover", (req, res) => {
  console.log("Scanning for Bluetooth devices...");
  device.listPairedDevices(devices => {
    const printer = devices.find(d => d.name && d.name.includes("XP-P503A"));
    if (printer) {
      printerAddress = printer.address;
      console.log("Printer found:", printer);
      return res.json({ success: true, printer });
    }
    res.json({ success: false, message: "Printer not found" });
  });
});

// Print text sent from browser
app.post("/print", (req, res) => {
  const { text } = req.body;
  if (!printerAddress) return res.status(400).json({ success: false, message: "Printer not connected" });

  const channel = 1; // default SPP channel
  const client = new bluetooth.DeviceINQ();

  const connection = new bluetooth.Connection(printerAddress, channel, err => {
    if (err) return res.status(500).json({ success: false, message: "Connection failed", error: err });

    connection.write(new Buffer.from(text, "utf-8"), () => {
      console.log("✅ Printed successfully");
      res.json({ success: true });
    });
  });
});

app.listen(3000, () => {
  console.log("Printer bridge running on http://localhost:3000");
});
