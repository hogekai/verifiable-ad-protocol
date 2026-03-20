import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import { VaulxClient } from "../src/vaulx-client.js";

let server: Server;
let port: number;
const TEST_TOKEN = "test-auth-token-123";
const TEST_ADDRESS = "7Qu5B4tB23Gt4WDZoZiLJpQ8hSxK6RPXeFSCdacCPvFf";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk; });
    req.on("end", () => resolve(body));
  });
}

beforeAll(async () => {
  server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const auth = req.headers.authorization;

    if (req.url === "/address" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ address: TEST_ADDRESS }));
      return;
    }

    if (req.url === "/api/sign-bytes" && req.method === "POST") {
      if (auth !== `Bearer ${TEST_TOKEN}`) {
        res.writeHead(401);
        res.end("Unauthorized");
        return;
      }
      const body = JSON.parse(await readBody(req));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        signature: Buffer.from("fake-sig-" + body.message).toString("base64"),
        publicKey: TEST_ADDRESS,
      }));
      return;
    }

    if (req.url === "/api/sign-and-send-raw-transaction" && req.method === "POST") {
      if (auth !== `Bearer ${TEST_TOKEN}`) {
        res.writeHead(401);
        res.end("Unauthorized");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ signature: "fake-tx-sig-abc123" }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

describe("VaulxClient", () => {
  it("getAddress returns base58 pubkey", async () => {
    const client = new VaulxClient(`http://127.0.0.1:${port}`, TEST_TOKEN);
    const address = await client.getAddress();
    expect(address).toBe(TEST_ADDRESS);
  });

  it("signBytes returns signature and publicKey", async () => {
    const client = new VaulxClient(`http://127.0.0.1:${port}`, TEST_TOKEN);
    const msg = Buffer.from("test-message").toString("base64");
    const result = await client.signBytes(msg);
    expect(result.signature).toBeTruthy();
    expect(result.publicKey).toBe(TEST_ADDRESS);
  });

  it("signAndSendRawTransaction returns tx signature", async () => {
    const client = new VaulxClient(`http://127.0.0.1:${port}`, TEST_TOKEN);
    const result = await client.signAndSendRawTransaction("fake-tx-base64");
    expect(result.signature).toBe("fake-tx-sig-abc123");
  });

  it("auth token is included in headers", async () => {
    const client = new VaulxClient(`http://127.0.0.1:${port}`, TEST_TOKEN);
    // signBytes requires auth — should succeed with correct token
    const msg = Buffer.from("test").toString("base64");
    await expect(client.signBytes(msg)).resolves.toBeTruthy();
  });

  it("HTTP error throws appropriate exception", async () => {
    const client = new VaulxClient(`http://127.0.0.1:${port}`, "wrong-token");
    const msg = Buffer.from("test").toString("base64");
    await expect(client.signBytes(msg)).rejects.toThrow("vaulx /api/sign-bytes failed (401)");
  });
});
