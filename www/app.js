// --- Supabase Setup ---
const supabaseUrl = "https://ovcojxtwthzxopuddjst.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Y29qeHR3dGh6eG9wdWRkanN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NTM1MjIsImV4cCI6MjA3MzUyOTUyMn0.c6EknOyljCCdRd5rO0Ff6tEnPS9NXjhWpnjiyG4WvIY";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let currentWeight = 0;

// Arrays to store multiple connected devices
let connectedScales = [];
let connectedPrinters = [];

// --- Login ---
async function login() {
  const userId = document.getElementById("userid").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    const { data } = await supabase
      .from("app_users")
      .select("*")
      .eq("user_id", userId)
      .eq("password", password)
      .single();

    if (data) {
      currentUser = data;
      document.getElementById("login-screen").style.display = "none";
      document.getElementById("app-screen").style.display = "block";
      document.getElementById("user-info").innerText = `Logged in as ${data.user_id} (${data.role})`;
    } else {
      alert("Invalid User ID or Password");
    }
  } catch (err) {
    console.error("Login error:", err);
    alert("Error during login. Check console for details.");
  }
}

function logout() {
  currentUser = null;
  document.getElementById("login-screen").style.display = "block";
  document.getElementById("app-screen").style.display = "none";
}

// --- Auto Fetch Farmer Route ---
async function fetchFarmerRoute() {
  const farmerId = document.getElementById("farmer-id").value.trim();
  if (!farmerId) return;

  try {
    const { data } = await supabase
      .from("farmers")
      .select("route, name")
      .eq("farmer_id", farmerId)
      .single();

    if (data) {
      document.getElementById("route").value = data.route;
      document.getElementById("farmer-name").innerText = `Farmer: ${data.name} (Route: ${data.route})`;
    } else {
      document.getElementById("route").value = "";
      document.getElementById("farmer-name").innerText = "Farmer not found!";
    }
  } catch (err) {
    console.error("Fetch farmer error:", err);
    alert("Error fetching farmer info.");
  }
}

document.getElementById("farmer-id").addEventListener("change", fetchFarmerRoute);
document.getElementById("farmer-id").addEventListener("blur", fetchFarmerRoute);

// --- Scan for any Bluetooth Devices ---
async function scanBluetoothDevices() {
  if (!navigator.bluetooth) {
    alert("Bluetooth not supported in this browser. Use Cordova app on Android.");
    return;
  }

  try {
    console.log("Scanning for Bluetooth devices...");
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ["0000ffe0-0000-1000-8000-00805f9b34fb", "00002400-0000-1000-8000-00805f9b34fb"]
    });

    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();

    let isScale = services.some(s => s.uuid.toLowerCase().includes("ffe0"));
    let isPrinter = services.some(s => s.uuid.toLowerCase().includes("2400"));

    if (isScale) {
      const scaleService = await server.getPrimaryService("0000ffe0-0000-1000-8000-00805f9b34fb");
      const scaleChar = await scaleService.getCharacteristic("0000ffe1-0000-1000-8000-00805f9b34fb");
      scaleChar.addEventListener("characteristicvaluechanged", handleWeight);
      await scaleChar.startNotifications();
      connectedScales.push({ device, characteristic: scaleChar });
      document.getElementById("scale-status").innerText = `Scale Connected: ${device.name}`;
      console.log("✅ Scale connected:", device.name);
    }

    if (isPrinter) {
      const printerService = await server.getPrimaryService("00002400-0000-1000-8000-00805f9b34fb");
      const printerChar = await printerService.getCharacteristic("00002a00-0000-1000-8000-00805f9b34fb");
      connectedPrinters.push({ device, characteristic: printerChar });
      document.getElementById("printer-status").innerText = `Printer Connected: ${device.name}`;
      console.log("✅ Printer connected:", device.name);
    }

  } catch (err) {
    console.error("Device scan/connect error:", err);
    alert("Failed to scan/connect device: " + err);
  }
}

// --- Attach Bluetooth scan to button ---
const connectBtn = document.getElementById("connect-devices");
if (connectBtn) {
  connectBtn.addEventListener("click", () => {
    console.log("Connect Devices button clicked");
    scanBluetoothDevices();
  });
} else {
  console.warn("Connect Devices button not found in DOM!");
}

// --- Handle Scale Weight ---
function handleWeight(event) {
  try {
    const value = event.target.value;
    const decoder = new TextDecoder("utf-8");
    const rawData = decoder.decode(value);

    const match = rawData.match(/(\d+(\.\d+)?)/);
    if (match) {
      currentWeight = parseFloat(match[0]);
      document.getElementById("weight-display").innerText = `Weight: ${currentWeight.toFixed(1)} Kg`;
      updateTotal();
    }
  } catch (err) {
    console.error("Weight parse error:", err);
  }
}

// --- Update Total ---
function updateTotal() {
  const price = parseFloat(document.getElementById("price-per-liter").value) || 0;
  const total = currentWeight * price;
  document.getElementById("total-amount").innerText = `Total: Ksh ${total.toFixed(2)}`;
}

// --- Save Milk & Print ---
async function saveMilk() {
  const farmerId = document.getElementById("farmer-id").value.trim();
  const route = document.getElementById("route").value.trim();
  const section = document.getElementById("section").value;
  const price = parseFloat(document.getElementById("price-per-liter").value) || 0;
  const total = currentWeight * price;

  if (!farmerId || !route || !currentWeight) {
    alert("Please enter farmer ID, fetch route, and input/measure weight.");
    return;
  }

  try {
    const { error } = await supabase.from("milk_collection").insert([{
      farmer_id: farmerId,
      route,
      section,
      weight: currentWeight,
      price_per_liter: price,
      total_amount: total,
      collected_by: currentUser ? currentUser.user_id : null,
      timestamp: new Date().toISOString()
    }]);

    if (error) {
      console.error("Save milk error:", error);
      alert("Failed to save milk data");
      return;
    }

    await printReceipt(farmerId, route, section, currentWeight, price, total);

  } catch (err) {
    console.error("Save milk exception:", err);
    alert("Error saving milk data.");
  }
}

// --- Print Receipt using any connected printer ---
async function printReceipt(farmerId, route, section, weight, price, total) {
  if (connectedPrinters.length === 0) {
    alert("No printer connected! Please scan and connect a printer first.");
    return;
  }

  const receipt = `
Milk Receipt
Farmer: ${farmerId}
Route: ${route}
Section: ${section}
Weight: ${weight.toFixed(1)} Kg
Price per Liter: Ksh ${price.toFixed(2)}
Total: Ksh ${total.toFixed(2)}
Date: ${new Date().toLocaleString()}
`;

  try {
    for (const printer of connectedPrinters) {
      const encoder = new TextEncoder();
      await printer.characteristic.writeValue(encoder.encode(receipt));
    }
    alert("✅ Receipt printed to all connected printers!");
  } catch (err) {
    console.error("Print receipt error:", err);
    alert("Failed to print receipt: " + err);
  }
}

// --- Manual Weight Entry ---
function useManualWeight() {
  const manual = parseFloat(document.getElementById("manual-weight").value);
  if (!isNaN(manual) && manual > 0) {
    currentWeight = manual;
    document.getElementById("weight-display").innerText = `Weight: ${manual.toFixed(1)} Kg (manual)`;
    updateTotal();
  } else {
    alert("Please enter a valid weight.");
  }
}

// --- Update total when price changes ---
document.getElementById("price-per-liter").addEventListener("input", updateTotal);
