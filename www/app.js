// --- Supabase Setup ---
const supabaseUrl = "https://ovcojxtwthzxopuddjst.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Y29qeHR3dGh6eG9wdWRkanN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NTM1MjIsImV4cCI6MjA3MzUyOTUyMn0.c6EknOyljCCdRd5rO0Ff6tEnPS9NXjhWpnjiyG4WvIY";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let bluetoothDevice;
let bluetoothCharacteristic;
let currentWeight = 0;
let printerDevice;
let printerCharacteristic;

// --- Login ---
async function login() {
  const userId = document.getElementById("userid").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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

// --- Auto trigger fetch when farmer ID is entered ---
document.getElementById("farmer-id").addEventListener("change", fetchFarmerRoute);
document.getElementById("farmer-id").addEventListener("blur", fetchFarmerRoute);

// --- Scale & Printer UUIDs ---
const SCALE_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const SCALE_CHARACTERISTIC_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";
const PRINTER_SERVICE_UUID = "00002400-0000-1000-8000-00805f9b34fb";
const PRINTER_CHARACTERISTIC_UUID = "00002a00-0000-1000-8000-00805f9b34fb";

// --- Connect Devices (Scale + Printer) ---
async function connectDevices() {
  // Connect Scale
  if (!bluetoothDevice || !bluetoothDevice.gatt.connected) {
    try {
      bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [{ name: "JDY-23A-BLE" }],
        optionalServices: [SCALE_SERVICE_UUID]
      });

      const server = await bluetoothDevice.gatt.connect();
      const service = await server.getPrimaryService(SCALE_SERVICE_UUID);
      bluetoothCharacteristic = await service.getCharacteristic(SCALE_CHARACTERISTIC_UUID);

      bluetoothCharacteristic.addEventListener("characteristicvaluechanged", handleWeight);
      await bluetoothCharacteristic.startNotifications();

      document.getElementById("scale-status").innerText = "Scale: Connected ✅";
      console.log("✅ Scale connected");
    } catch (err) {
      console.error("Scale connection error:", err);
      alert("Failed to connect scale: " + err);
    }
  } else {
    console.log("Scale already connected");
  }

  // Connect Printer
  if (!printerDevice || !printerDevice.gatt.connected) {
    try {
      printerDevice = await navigator.bluetooth.requestDevice({
        filters: [{ name: "P502A-1567" }],
        optionalServices: [PRINTER_SERVICE_UUID]
      });

      const server = await printerDevice.gatt.connect();
      const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
      printerCharacteristic = await service.getCharacteristic(PRINTER_CHARACTERISTIC_UUID);

      document.getElementById("printer-status").innerText = "Printer: Connected ✅";
      console.log("✅ Printer connected");
      alert("Printer connected!");
    } catch (err) {
      console.error("Printer connection error:", err);
      alert("Failed to connect printer: " + err);
    }
  } else {
    console.log("Printer already connected");
  }
}

// --- Handle Scale Weight ---
function handleWeight(event) {
  try {
    const value = event.target.value;
    const decoder = new TextDecoder("utf-8");
    const rawData = decoder.decode(value);

    console.log("Raw scale data:", rawData);

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

// --- Print Receipt using connected printer ---
async function printReceipt(farmerId, route, section, weight, price, total) {
  if (!printerCharacteristic) {
    alert("Printer not connected! Please connect the printer first.");
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
    const encoder = new TextEncoder();
    await printerCharacteristic.writeValue(encoder.encode(receipt));
    alert("✅ Receipt printed!");
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
