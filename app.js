// --- Supabase Setup ---
const supabaseUrl = "https://ovcojxtwthzxopuddjst.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Y29qeHR3dGh6eG9wdWRkanN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NTM1MjIsImV4cCI6MjA3MzUyOTUyMn0.c6EknOyljCCdRd5rO0Ff6tEnPS9NXjhWpnjiyG4WvIY";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let bluetoothDevice;
let bluetoothCharacteristic;
let currentWeight = 0;

// --- Login ---
async function login() {
  const userId = document.getElementById("userid").value.trim();
  const password = document.getElementById("password").value.trim();

  let { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("user_id", userId)
    .eq("password", password)
    .single();

  if (data) {
    currentUser = data;
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-screen").style.display = "block";
    document.getElementById("user-info").innerText =
      `Logged in as ${data.user_id} (${data.role})`;
  } else {
    alert("Invalid User ID or Password");
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

  let { data, error } = await supabase
    .from("farmers")
    .select("route, name")
    .eq("farmer_id", farmerId)
    .single();

  if (data) {
    document.getElementById("route").value = data.route;
    document.getElementById("farmer-name").innerText =
      `Farmer: ${data.name} (Route: ${data.route})`;
  } else {
    document.getElementById("route").value = "";
    document.getElementById("farmer-name").innerText = "Farmer not found!";
  }
}

// --- Auto trigger fetch when farmer ID is entered ---
document.getElementById("farmer-id").addEventListener("change", fetchFarmerRoute);
document.getElementById("farmer-id").addEventListener("blur", fetchFarmerRoute);

// --- Bluetooth Scale (JDY-231-SPP) ---
const SCALE_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const SCALE_CHARACTERISTIC_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";

async function connectScale() {
  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: "JDY-23A-BLE" }], // exact advertised name
      optionalServices: [SCALE_SERVICE_UUID]
    });

    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(SCALE_SERVICE_UUID);
    bluetoothCharacteristic = await service.getCharacteristic(SCALE_CHARACTERISTIC_UUID);

    bluetoothCharacteristic.addEventListener("characteristicvaluechanged", handleWeight);
    await bluetoothCharacteristic.startNotifications();

    document.getElementById("scale-status").innerText = "Scale: Connected";
    console.log("✅ Scale connected, listening for data...");
  } catch (err) {
    console.error(err);
    alert("Failed to connect to scale: " + err);
  }
}


function handleWeight(event) {
  const value = event.target.value;
  const decoder = new TextDecoder("utf-8");
  const rawData = decoder.decode(value);

  console.log("Raw scale data:", rawData);

  // Extract number from raw data (e.g., "12.5kg")
  const match = rawData.match(/(\d+(\.\d+)?)/);
  if (match) {
    currentWeight = parseFloat(match[0]);
    document.getElementById("weight-display").innerText = 
      `Weight: ${currentWeight.toFixed(1)} Kg`;
    updateTotal();
  }
}

// --- Update total amount ---
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

  const { error } = await supabase
    .from("milk_collection")
    .insert([{
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
    console.error(error);
    alert("Failed to save milk data");
    return;
  }

  printReceipt(farmerId, route, section, currentWeight, price, total);
}

// --- Print Receipt ---
async function printReceipt(farmerId, route, section, weight, price, total) {
  try {
    // NOTE: Replace printer_service_uuid_here with your printer's actual UUID
    const printer = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "Printer" }],
      optionalServices: ['printer_service_uuid_here']
    });

    const server = await printer.gatt.connect();
    const service = await server.getPrimaryService('printer_service_uuid_here');
    const characteristic = await service.getCharacteristic('printer_characteristic_uuid_here');

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
    const encoder = new TextEncoder();
    await characteristic.writeValue(encoder.encode(receipt));

    alert("Receipt Printed!");
  } catch (err) {
    console.error(err);
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

// --- Trigger total update when price changes ---
document.getElementById("price-per-liter").addEventListener("input", updateTotal);
