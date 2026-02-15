import "dotenv/config";

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

const smokeUser =
  process.env.SMOKE_ADMIN_USER || process.env.ADMIN_DASH_USER || "";
const smokePass =
  process.env.SMOKE_ADMIN_PASS || process.env.ADMIN_DASH_PASS || "";

function buildBasicAuthHeader() {
  if (!smokeUser || !smokePass) return null;
  const token = Buffer.from(`${smokeUser}:${smokePass}`).toString("base64");
  return `Basic ${token}`;
}

const routes = ["/admin/documents", "/admin/ingestion"];

async function fetchRoute(path) {
  const url = new URL(path, baseUrl).toString();
  const authHeader = buildBasicAuthHeader();
  const response = await fetch(url, {
    headers: {
      "User-Agent": "admin-pages-smoke",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.status;
}

async function run() {
  const failures = [];
  for (const route of routes) {
    try {
      await fetchRoute(route);
      console.log(`[smoke] ok ${route}`);
    } catch (error) {
      failures.push({ route, error });
      console.error(`[smoke] failed ${route}`, error);
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error("[smoke] unexpected error", error);
  process.exitCode = 1;
});
