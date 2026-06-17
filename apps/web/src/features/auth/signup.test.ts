import assert from "node:assert/strict";
import test from "node:test";
import { signupUser } from "./signup.ts";

test("signupUser normalizes email and creates a user with a hashed password", async () => {
  const createdUsers: Array<{ email: string; name: string; passwordHash: string }> = [];

  const result = await signupUser(
    {
      email: "  Student@Jungle.test  ",
      name: " 정글러 ",
      password: "strong-password"
    },
    {
      findUserByEmail: async () => null,
      createUser: async (data) => {
        createdUsers.push(data);
        return { id: "user-1", email: data.email, name: data.name };
      },
      hashPassword: async (password) => `hashed:${password}`
    }
  );

  assert.deepEqual(result, {
    id: "user-1",
    email: "student@jungle.test",
    name: "정글러"
  });
  assert.deepEqual(createdUsers, [
    {
      email: "student@jungle.test",
      name: "정글러",
      passwordHash: "hashed:strong-password"
    }
  ]);
});

test("signupUser rejects duplicate emails", async () => {
  await assert.rejects(
    () =>
      signupUser(
        {
          email: "student@jungle.test",
          name: "정글러",
          password: "strong-password"
        },
        {
          findUserByEmail: async () => ({ id: "existing-user" }),
          createUser: async () => {
            throw new Error("createUser must not be called");
          },
          hashPassword: async () => "unused"
        }
      ),
    /이미 가입된 이메일입니다/
  );
});

test("signupUser rejects short passwords", async () => {
  await assert.rejects(
    () =>
      signupUser(
        {
          email: "student@jungle.test",
          name: "정글러",
          password: "short"
        },
        {
          findUserByEmail: async () => null,
          createUser: async () => {
            throw new Error("createUser must not be called");
          },
          hashPassword: async () => "unused"
        }
      ),
    /비밀번호는 8자 이상이어야 합니다/
  );
});
