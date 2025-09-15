// --- Supabase Setup ---
const supabaseUrl = "https://ovcojxtwthzxopuddjst.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Y29qeHR3dGh6eG9wdWRkanN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NTM1MjIsImV4cCI6MjA3MzUyOTUyMn0.c6EknOyljCCdRd5rO0Ff6tEnPS9NXjhWpnjiyG4WvIY";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;

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


// --- Bluetooth Scale ---
let bluetoothDevice;
let bluetoothCharacteristic;

async function connectScale() {
  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['weight_scale'] }]
    });
    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService('weight_scale');
    bluetoothCharacteristic = await service.getCharacteristic('weight_measurement');
    bluetoothCharacteristic.addEventListener('characteristicvaluechanged', handleWeight);
    await bluetoothCharacteristic.startNotifications();

    document.getElementById("scale-status").innerText = "Scale: Connected";
  } catch (err) {
    console.error(err);
    alert("Failed to connect scale: " + err);
  }
}

function handleWeight(event) {
  const value = event.target.value;
  const weight = value.getUint16(0, true) / 100;
  document.getElementById("weight-display").innerText = `Weight: ${weight} Kg`;
}

// --- Save Milk & Print ---
async function saveMilk() {
  const farmerId = document.getElementById("farmer-id").value.trim();
  const route = document.getElementById("route").value.trim();
  const section = document.getElementById("section").value;
  const weightText = document.getElementById("weight-display").innerText;
  const weight = parseFloat(weightText.replace("Weight: ", "").replace(" Kg", ""));

  if (!farmerId || !route || !weight) {
    alert("Please enter farmer ID, fetch route, and connect scale.");
    return;
  }

  const { error } = await supabase
    .from("milk_collection")
    .insert([{
      farmer_id: farmerId,
      route,
      section,
      weight,
      collected_by: currentUser ? currentUser.user_id : null,
      timestamp: new Date().toISOString()
    }]);

  if (error) {
    console.error(error);
    alert("Failed to save milk data");
    return;
  }

  printReceipt(farmerId, route, section, weight);
}

async function printReceipt(farmerId, route, section, weight) {
  try {
    const printer = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "Printer" }]
    });
    const server = await printer.gatt.connect();
    const service = await server.getPrimaryService('printer_service_uuid');
    const characteristic = await service.getCharacteristic('printer_characteristic_uuid');

    const receipt = `Milk Receipt\nFarmer: ${farmerId}\nRoute: ${route}\nSection: ${section}\nWeight: ${weight} Kg\nDate: ${new Date().toLocaleString()}\n\n`;
    const encoder = new TextEncoder();
    await characteristic.writeValue(encoder.encode(receipt));

    alert("Receipt Printed!");
  } catch (err) {
    console.error(err);
    alert("Failed to print receipt: " + err);
  }
}
// --- Use Manual Weight ---
function useManualWeight() {
  const manual = parseFloat(document.getElementById("manual-weight").value);
  if (!isNaN(manual) && manual > 0) {
    currentWeight = manual; // overwrite the currentWeight variable
    document.getElementById("weight-display").innerText = `Weight: ${manual.toFixed(1)} Kg (manual)`;
  } else {
    alert("Please enter a valid weight.");
  }
}
