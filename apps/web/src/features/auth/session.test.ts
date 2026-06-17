import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentUser, loginUser, logoutUser } from "./session.ts";

const fixedNow = new Date("2026-06-08T00:00:00.000Z");

test("loginUser creates a session for valid credentials", async () => {
  const createdSessions: Array<{ userId: string; tokenHash: string; expiresAt: Date }> = [];

  const result = await loginUser(
    {
      email: " Student@Jungle.test ",
      password: "strong-password"
    },
    {
      findUserByEmail: async (email) => ({
        id: "user-1",
        email,
        name: "jungler",
        passwordHash: "stored-hash"
      }),
      verifyPassword: async (password, passwordHash) =>
        password === "strong-password" && passwordHash === "stored-hash",
      createSession: async (session) => {
        createdSessions.push(session);
      },
      createSessionToken: () => "plain-session-token",
      hashSessionToken: (token) => `hashed:${token}`,
      now: () => fixedNow
    }
  );

  assert.deepEqual(result.user, {
    id: "user-1",
    email: "student@jungle.test",
    name: "jungler"
  });
  assert.equal(result.sessionToken, "plain-session-token");
  assert.deepEqual(createdSessions, [
    {
      userId: "user-1",
      tokenHash: "hashed:plain-session-token",
      expiresAt: new Date("2026-06-15T00:00:00.000Z")
    }
  ]);
});

test("loginUser rejects an invalid password without creating a session", async () => {
  let createSessionCalled = false;

  await assert.rejects(
    () =>
      loginUser(
        {
          email: "student@jungle.test",
          password: "wrong-password"
        },
        {
          findUserByEmail: async () => ({
            id: "user-1",
            email: "student@jungle.test",
            name: "jungler",
            passwordHash: "stored-hash"
          }),
          verifyPassword: async () => false,
          createSession: async () => {
            createSessionCalled = true;
          },
          createSessionToken: () => "unused",
          hashSessionToken: () => "unused",
          now: () => fixedNow
        }
      ),
    /email or password is invalid/
  );

  assert.equal(createSessionCalled, false);
});

test("getCurrentUser returns the session user for a valid token", async () => {
  const user = await getCurrentUser("plain-session-token", {
    hashSessionToken: (token) => `hashed:${token}`,
    findValidSessionByTokenHash: async (tokenHash, now) => {
      assert.equal(tokenHash, "hashed:plain-session-token");
      assert.equal(now.toISOString(), fixedNow.toISOString());
      return {
        user: {
          id: "user-1",
          email: "student@jungle.test",
          name: "jungler"
        }
      };
    },
    now: () => fixedNow
  });

  assert.deepEqual(user, {
    id: "user-1",
    email: "student@jungle.test",
    name: "jungler"
  });
});

test("logoutUser deletes the hashed session token", async () => {
  const deletedHashes: string[] = [];

  await logoutUser("plain-session-token", {
    hashSessionToken: (token) => `hashed:${token}`,
    deleteSessionByTokenHash: async (tokenHash) => {
      deletedHashes.push(tokenHash);
    }
  });

  assert.deepEqual(deletedHashes, ["hashed:plain-session-token"]);
});
