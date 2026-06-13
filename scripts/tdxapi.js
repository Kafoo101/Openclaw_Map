// ==========================================
// CONFIG
// ==========================================
const CLIENT_ID = "kafoo0aa-6dffb756-774c-4ce0";
const CLIENT_SECRET = "c597816a-71ab-4434-b9a0-11b56cbd4e68";

const AUTH_URL =
  "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token";

const ETA_API =
  "https://tdx.transportdata.tw/api/basic/v2/Bus/EstimatedTimeOfArrival/City/Keelung?$format=JSON";

// TOKEN CACHE
let cachedToken = null;
let tokenExpireTime = 0;

// GET ACCESS TOKEN
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpireTime) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json();

  cachedToken = data.access_token;
  tokenExpireTime = Date.now() + (data.expires_in - 60) * 1000;

  return cachedToken;
}

// FETCH ETA DATA
async function fetchETA() {
  const token = await getAccessToken();

  const res = await fetch(ETA_API, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return await res.json();
}

module.exports = { fetchETA };