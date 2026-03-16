#!/usr/bin/env node
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import net from "node:net";

const log = (message) => console.log(`[smoke] ${message}`);
const error = (message) => console.error(`[smoke] ${message}`);

const normalizeEnvValue = (value) => {
  const trimmed = String(value).trim();
  const unquoted = trimmed.replace(/^(['"])(.*)\1$/, "$2").trim();
  return unquoted;
};

const requireEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return normalizeEnvValue(value);
};

const requireEnvFrom = (candidates) => {
  for (const key of candidates) {
    const value = process.env[key];
    if (value) return { key, value: normalizeEnvValue(value) };
  }
  throw new Error(`Missing required env var (tried: ${candidates.join(", ")})`);
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const parseCosmosConnectionString = (value) => {
  const text = String(value ?? "").trim();
  if (!/accountendpoint\s*=|accountkey\s*=/i.test(text)) return null;

  const entries = text
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  const map = new Map();
  for (const entry of entries) {
    const eq = entry.indexOf("=");
    if (eq <= 0) continue;
    const k = entry.slice(0, eq).trim().toLowerCase();
    const v = entry.slice(eq + 1).trim();
    map.set(k, v);
  }

  const endpoint = map.get("accountendpoint");
  const key = map.get("accountkey");
  if (!endpoint || !key) return null;
  return { endpoint, key };
};

const loadLocalEnv = async () => {
  try {
    const mod = await import("dotenv");
    const dotenv = mod.default ?? mod;
    dotenv.config({ path: ".env.local" });
  } catch {
    // dotenv is optional; CI should set env vars explicitly
  }
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 15_000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const apiJson = async (baseUrl, method, path, body) => {
  const res = await fetchWithTimeout(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  return { status: res.status, ok: res.ok, json, text };
};

const serverIsUp = async (baseUrl) => {
  try {
    const res = await fetchWithTimeout(baseUrl, { redirect: "manual" }, 3_000);
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  }
};

const ensureServerStarted = async (baseUrl, startDevServerFn) => {
  const mode = process.env.SMOKE_START_SERVER; // "0" | "1" | undefined
  const isUp = await serverIsUp(baseUrl);

  if (mode === "0") {
    if (!isUp) {
      throw new Error(
        `SMOKE_START_SERVER=0 but no server is running at ${baseUrl}. Start it first, or unset SMOKE_START_SERVER.`
      );
    }
    log(`Using existing server at ${baseUrl} (SMOKE_START_SERVER=0)`);
    return null;
  }

  if (mode === "1") {
    if (isUp) {
      throw new Error(
        `SMOKE_START_SERVER=1 but a server is already running at ${baseUrl}. Stop it first to avoid running smoke tests against the wrong env.`
      );
    }
    log(`Starting dev server... (${baseUrl})`);
    const child = startDevServerFn();
    await waitForServer(baseUrl, child);
    return child;
  }

  // Default ("auto"): only start if nothing is running, otherwise fail safely.
  if (isUp) {
    throw new Error(
      `A server is already running at ${baseUrl}. Stop it first, or set SMOKE_START_SERVER=0 (only if you're 100% sure it's using the CI/test DB).`
    );
  }

  log(`Starting dev server... (${baseUrl})`);
  const child = startDevServerFn();
  await waitForServer(baseUrl, child);
  return child;
};

const waitForServer = async (baseUrl, child, timeoutMs = 90_000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (child?.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetchWithTimeout(baseUrl, { redirect: "manual" }, 2_000);
      if (res.status > 0 && res.status < 500) {
        return;
      }
    } catch {
      // ignore
    }

    await sleep(750);
  }

  throw new Error(`Timed out waiting for dev server at ${baseUrl}`);
};

const getFreePort = async (preferredPort) => {
  const tryPort = (port) =>
    new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", reject);
      // Bind without a hostname to catch conflicts on IPv4/IPv6 (Next often binds to ::).
      server.listen(port, () => {
        const address = server.address();
        const chosen = typeof address === "object" && address ? address.port : port;
        server.close(() => resolve(chosen));
      });
    });

  if (preferredPort) {
    try {
      return await tryPort(preferredPort);
    } catch {
      // fall through to random port
    }
  }

  return await tryPort(0);
};

const startDevServer = (port, envOverrides = {}) => {
  // Avoid `npm run dev` here because the repo hard-codes `-p 9002` in package.json.
  // Use Next's bin directly so we can pick a free port.
  const cmd = `node ./node_modules/next/dist/bin/next dev -H 127.0.0.1 -p ${port}`;
  const existingNodeOptions = process.env.NODE_OPTIONS ?? "";
  const smokeNodeOptions = process.env.SMOKE_NODE_OPTIONS ?? "";
  const hasMaxOldSpace = /max-old-space-size/i.test(existingNodeOptions);
  const defaultNodeOptions = hasMaxOldSpace || smokeNodeOptions ? "" : "--max-old-space-size=4096";
  const combinedNodeOptions = [existingNodeOptions, smokeNodeOptions, defaultNodeOptions]
    .filter((value) => value && String(value).trim().length > 0)
    .join(" ")
    .trim();

  if (combinedNodeOptions && combinedNodeOptions !== existingNodeOptions) {
    log(`Using NODE_OPTIONS="${combinedNodeOptions}"`);
  }
  const child = spawn(cmd, {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      ...envOverrides,
      NODE_OPTIONS: combinedNodeOptions || existingNodeOptions,
      NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1",
    },
  });

  return child;
};

const stopDevServer = async (child) => {
  if (!child) return;

  if (child.exitCode !== null) return;

  child.kill("SIGTERM");
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) return;
    await sleep(250);
  }

  child.kill("SIGKILL");
};

const getCosmos = async () => {
  const mod = await import("@azure/cosmos");
  const cosmos = mod.default ?? mod;
  const CosmosClient = cosmos.CosmosClient;
  assert(CosmosClient, "Unable to import CosmosClient from @azure/cosmos");
  return { CosmosClient };
};

const ensureCosmosContainers = async ({ endpoint, key, databaseId }) => {
  const { CosmosClient } = await getCosmos();
  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseId);

  // Verify database exists (we avoid creating it in smoke tests).
  try {
    await database.read();
  } catch (err) {
    throw new Error(
      `Cosmos database "${databaseId}" not found. Create it first (or point to an existing CI/test database).`
    );
  }

  const mentor = database.container("mentor");
  const mentee = database.container("mentee");

  // Verify containers exist (creating them can fail due to Cosmos throughput limits).
  try {
    await mentor.read();
  } catch {
    throw new Error(
      `Cosmos container "mentor" not found in database "${databaseId}". Create it first (same partition key as prod).`
    );
  }
  try {
    await mentee.read();
  } catch {
    throw new Error(
      `Cosmos container "mentee" not found in database "${databaseId}". Create it first (same partition key as prod).`
    );
  }

  return { client, database, mentor, mentee };
};

const readDoc = async (container, id) => {
  const { resource } = await container.item(id, id).read();
  return resource;
};

const findMeeting = (doc, meetingId) => {
  const scheduling = Array.isArray(doc?.scheduling) ? doc.scheduling : [];
  return scheduling.find((m) => m.meetingId === meetingId) ?? null;
};

async function main() {
  await loadLocalEnv();

  const requestedBaseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1";

  const endpointEnv = requireEnvFrom([
    "SMOKE_COSMOS_DB_ENDPOINT",
    "COSMOS_DB_ENDPOINT_CI",
    "COSMOS_DB_ENDPOINT",
  ]);
  const databaseEnv = requireEnvFrom([
    "SMOKE_COSMOS_DB_DATABASE",
    "COSMOS_DB_DATABASE_CI",
    "COSMOS_DB_DATABASE",
  ]);

  const endpoint = endpointEnv.value;
  const conn = parseCosmosConnectionString(endpoint);

  const keyEnvCandidates = ["SMOKE_COSMOS_DB_KEY", "COSMOS_DB_KEY_CI", "COSMOS_DB_KEY"];
  let keyEnv = null;
  for (const candidate of keyEnvCandidates) {
    if (process.env[candidate]) {
      keyEnv = { key: candidate, value: normalizeEnvValue(process.env[candidate]) };
      break;
    }
  }

  let key = keyEnv?.value ?? conn?.key;
  if (!key) {
    throw new Error(
      `Missing required Cosmos key. Set one of ${keyEnvCandidates.join(
        ", "
      )} or include AccountKey in ${endpointEnv.key}.`
    );
  }
  const databaseId = databaseEnv.value;

  if (conn) {
    log(`Detected Cosmos connection string in ${endpointEnv.key}; using AccountEndpoint/AccountKey from it.`);
    // Endpoint env var contains both; prefer it over separate vars.
    // (Do not log the key.)
    key = conn.key;
  }

  if (
    process.env.SMOKE_ALLOW_ANY_DB !== "1" &&
    !/(ci|test)/i.test(databaseId)
  ) {
    throw new Error(
      `Refusing to run smoke test against database="${databaseId}" (from ${databaseEnv.key}). ` +
        `Use a CI/test database name (recommended), or set SMOKE_ALLOW_ANY_DB=1 to override.`
    );
  }

  const runId =
    process.env.SMOKE_RUN_ID ?? `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

  const mentorId = `ci-mentor-${runId}`;
  const menteeId = `ci-mentee-${runId}`;
  const menteeEmail = `ci-mentee-${runId}@example.com`;
  const menteeName = "CI Mentee";
  const mentorEmail = `ci-mentor-${runId}@example.com`;

  const date = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const time = "09:00";

  let devServer = null;
  let mentorContainer = null;
  let menteeContainer = null;

  try {
    let endpointHost = "<invalid>";
    try {
      const endpointUrl = conn?.endpoint ?? endpoint;
      endpointHost = new URL(endpointUrl).host;
    } catch {
      throw new Error(
        `Invalid Cosmos endpoint URL (from ${endpointEnv.key}). Expected something like https://<account>.documents.azure.com:443/`
      );
    }
    log(`Cosmos config: endpointHost=${endpointHost}, database=${databaseId} (from ${databaseEnv.key})`);

    const parsedRequestedUrl = new URL(requestedBaseUrl);
    const preferredPortRaw = process.env.SMOKE_PORT?.trim();
    const preferredPort =
      preferredPortRaw && /^\d+$/.test(preferredPortRaw)
        ? Number(preferredPortRaw)
        : parsedRequestedUrl.port
          ? Number(parsedRequestedUrl.port)
          : undefined;

    const chosenPort = await getFreePort(preferredPort);
    const baseUrl = `${parsedRequestedUrl.protocol}//${parsedRequestedUrl.hostname}:${chosenPort}`;
    log(`Using baseUrl=${baseUrl} (preferredPort=${preferredPort ?? "random"})`);

    devServer = await ensureServerStarted(baseUrl, () =>
      startDevServer(chosenPort, {
        COSMOS_DB_ENDPOINT: conn?.endpoint ?? endpoint,
        COSMOS_DB_KEY: key,
        COSMOS_DB_DATABASE: databaseId,
        // Some routes in this repo use COSMOS_DB_DATABASE_ID; keep them aligned for smoke runs.
        COSMOS_DB_DATABASE_ID: databaseId,
      })
    );

    const { mentor, mentee } = await ensureCosmosContainers({
      endpoint: conn?.endpoint ?? endpoint,
      key,
      databaseId,
    });
    mentorContainer = mentor;
    menteeContainer = mentee;

    // Seed minimal mentor/mentee docs for scheduling flows.
    await mentorContainer.items.upsert({
      id: mentorId,
      mentorUID: mentorId,
      mentor_name: "CI Mentor",
      mentor_email: mentorEmail,
      role: "mentor",
      scheduling: [],
      tokens: 3,
      createdAt: new Date().toISOString(),
    });

    await menteeContainer.items.upsert({
      id: menteeId,
      menteeUID: menteeId,
      mentee_uid: menteeId,
      mentee_name: menteeName,
      mentee_email: menteeEmail,
      role: "mentee",
      scheduling: [],
      tokens: 3,
      createdAt: new Date().toISOString(),
    });

    // 1) Mentee requests a meeting -> token deducted.
    log("Creating meeting request via POST /api/meeting-requests ...");
    const createRes = await apiJson(baseUrl, "POST", "/api/meeting-requests", {
      mentorId,
      menteeId,
      menteeName,
      menteeEmail,
      date,
      time,
      message: "CI smoke test request",
    });

    assert(
      createRes.ok && createRes.json,
      `Expected success from /api/meeting-requests, got ${createRes.status}: ${createRes.text}`
    );

    const meetingId =
      createRes.json?.meeting?.meetingId ??
      createRes.json?.meetingId ??
      createRes.json?.meeting?.id;
    assert(typeof meetingId === "string" && meetingId.length > 0, "Missing meetingId in response");
    assert(
      typeof createRes.json.newTokenBalance === "number" && createRes.json.newTokenBalance === 2,
      `Expected newTokenBalance to be 2 after request, got ${createRes.json?.newTokenBalance}`
    );

    const menteeAfterCreate = await readDoc(menteeContainer, menteeId);
    assert(menteeAfterCreate?.tokens === 2, `Expected mentee tokens=2 after request, got ${menteeAfterCreate?.tokens}`);

    // 2) Mentor sees the pending request (retry for eventual consistency).
    log("Fetching mentor requests via GET /api/meeting-requests ...");
    const fetchMentorRequests = async () => {
      const listRes = await fetch(
        `${baseUrl}/api/meeting-requests?mentorId=${encodeURIComponent(mentorId)}&_t=${Date.now()}`,
        {
          headers: { "Cache-Control": "no-store" },
          signal: AbortSignal.timeout(15_000),
        }
      );
      const listJson = await listRes.json().catch(() => null);
      return { listRes, listJson };
    };

    let listJson = null;
    let listRes = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await fetchMentorRequests();
      listRes = result.listRes;
      listJson = result.listJson;
      if (listRes.ok && Array.isArray(listJson) && listJson.some((m) => m.meetingId === meetingId)) {
        break;
      }
      await sleep(750);
    }

    assert(listRes?.ok && Array.isArray(listJson), `Expected array from meeting-requests GET, got ${listRes?.status}`);
    assert(
      listJson.some((m) => m.meetingId === meetingId),
      "Expected meetingId to appear in mentor meeting-requests list"
    );

    // 3) Mentor accepts -> status updated for both sides, token not refunded.
    log("Accepting meeting via PATCH /api/meeting-requests ...");
    const acceptRes = await apiJson(baseUrl, "PATCH", "/api/meeting-requests", {
      mentorId,
      meetingId,
      decision: "accepted",
    });
    assert(acceptRes.ok, `Expected meeting-requests PATCH to succeed, got ${acceptRes.status}: ${acceptRes.text}`);

    const mentorAfterAccept = await readDoc(mentorContainer, mentorId);
    const menteeAfterAccept = await readDoc(menteeContainer, menteeId);

    const mentorMeeting = findMeeting(mentorAfterAccept, meetingId);
    const menteeMeeting = findMeeting(menteeAfterAccept, meetingId);

    assert(mentorMeeting?.decision === "accepted", "Expected mentor meeting decision to be accepted");
    assert(menteeMeeting?.decision === "accepted", "Expected mentee meeting decision to be accepted");
    assert(menteeAfterAccept?.tokens === 2, `Expected mentee tokens to remain 2 after accept, got ${menteeAfterAccept?.tokens}`);

    // 4) Mentee cancels -> pending approval, no refund yet.
    log("Cancelling as mentee via DELETE /api/schedule/:meetingId ...");
    const cancelRes = await apiJson(baseUrl, "DELETE", `/api/schedule/${encodeURIComponent(meetingId)}`, {
      cancelledBy: menteeId,
      reason: "CI smoke cancellation",
    });
    assert(cancelRes.ok, `Expected cancellation to succeed, got ${cancelRes.status}: ${cancelRes.text}`);
    assert(cancelRes.json?.requiresApproval === true, "Expected requiresApproval=true for mentee cancellation");
    assert(cancelRes.json?.tokenStatus === "pending-approval", "Expected tokenStatus=pending-approval for mentee cancellation");

    const menteeAfterCancel = await readDoc(menteeContainer, menteeId);
    assert(menteeAfterCancel?.tokens === 2, `Expected no refund before approval, tokens should be 2, got ${menteeAfterCancel?.tokens}`);

    // 5) Admin approves cancellation -> token refunded and status updated.
    log("Approving cancellation via POST /api/meetings/cancel ...");
    const approveRes = await apiJson(baseUrl, "POST", "/api/meetings/cancel", {
      meetingId,
      action: "approve",
      reviewerName: "CI",
      reviewNotes: "approved by smoke test",
    });
    assert(approveRes.ok, `Expected approve cancellation to succeed, got ${approveRes.status}: ${approveRes.text}`);
    assert(
      typeof approveRes.json?.newBalance === "number" && approveRes.json.newBalance >= 3,
      `Expected newBalance>=3 after approval, got ${approveRes.text}`
    );

    const menteeAfterApproval = await readDoc(menteeContainer, menteeId);
    assert(menteeAfterApproval?.tokens === 3, `Expected tokens refunded to 3, got ${menteeAfterApproval?.tokens}`);

    log("PASS");
  } finally {
    // Best-effort cleanup
    try {
      if (menteeContainer) {
        await menteeContainer.item(menteeId, menteeId).delete();
      }
    } catch {
      // ignore
    }
    try {
      if (mentorContainer) {
        await mentorContainer.item(mentorId, mentorId).delete();
      }
    } catch {
      // ignore
    }

    await stopDevServer(devServer);
  }
}

main().catch((err) => {
  error(err?.stack || String(err));
  process.exitCode = 1;
});
