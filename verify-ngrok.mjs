const base = process.env.NGROK_URL;
for (const path of ['/', '/phone', '/api/phone-data']) {
  try {
    const response = await fetch(base + path, { headers: { 'ngrok-skip-browser-warning': 'true' } });
    const text = await response.text();
    console.log(JSON.stringify({ path, status: response.status, ok: response.ok, bytes: text.length, hasPhoneText: text.includes('Helmet Sensor Bridge'), body: path.includes('api') ? text : undefined }));
  } catch (error) {
    console.log(JSON.stringify({ path, error: error.message }));
  }
}
