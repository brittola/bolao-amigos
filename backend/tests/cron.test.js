import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { resetDb, createMatch } from "./helpers/db.js";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

describe("POST /cron/poll", () => {
  it("rejeita sem o secret correto", async () => {
    const res = await request(app).post("/cron/poll");
    expect(res.status).toBe(401);
  });

  it("aceita com o secret e responde com o resumo", async () => {
    const res = await request(app)
      .post("/cron/poll")
      .set("x-cron-secret", env.cronSecret);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("polled");
  });
});

describe("POST /cron/sync", () => {
  it("rejeita sem o secret", async () => {
    const res = await request(app).post("/cron/sync");
    expect(res.status).toBe(401);
  });
});
