import assert from "node:assert/strict";
import test from "node:test";
import {
  TOOL_DEFINITIONS,
  buildFoodPoisoningRiskRequest,
  buildVisionOcrRequest,
  buildWeeklyMenuArchiveInputs,
  dailyMenuImageMealTypesToCheck,
  extractImageUrlsFromHtml,
  findKakaoDailyMealPost,
  parseOpenAiOutputText,
  parseKakaoMealPostTitle,
  parseWeeklyMenuOutputText,
  runLoggedMcpTool,
  runMcpTool
} from "./tools.ts";

test("TOOL_DEFINITIONS exposes executable Junglebob tools", () => {
  const names = TOOL_DEFINITIONS.map((tool) => tool.name);

  assert.ok(names.includes("import_slack_menu_history"));
  assert.ok(names.includes("fetch_kakao_weekly_menu_image"));
  assert.ok(names.includes("extract_menu_image_urls"));
  assert.ok(names.includes("extract_menu_from_image"));
  assert.ok(names.includes("get_food_poisoning_risk"));
});

test("extractImageUrlsFromHtml extracts og:image and img src values with absolute URLs", () => {
  const urls = extractImageUrlsFromHtml(
    '<meta property="og:image" content="/weekly.png"><img src="https://cdn.example.com/menu.jpg">',
    "https://pf.kakao.com/channel/posts/1"
  );

  assert.deepEqual(urls, ["https://pf.kakao.com/weekly.png", "https://cdn.example.com/menu.jpg"]);
});

test("buildVisionOcrRequest creates an OpenAI Responses vision request", () => {
  const request = buildVisionOcrRequest({
    apiKey: "test-key",
    imageUrl: "https://example.com/menu.png",
    model: "gpt-4.1-mini"
  });

  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.init.method, "POST");
  assert.equal((request.init.headers as Record<string, string>).Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(String(request.init.body)), {
    model: "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "정글밥 식단표 이미지에서 날짜, 점심, 저녁 메뉴를 OCR로 추출해 한국어 텍스트로 정리해줘."
          },
          {
            type: "input_image",
            image_url: "https://example.com/menu.png",
            detail: "high"
          }
        ]
      }
    ]
  });
});

test("parseOpenAiOutputText reads output_text and message content text", () => {
  assert.equal(parseOpenAiOutputText({ output_text: "점심: 제육볶음" }), "점심: 제육볶음");
  assert.equal(
    parseOpenAiOutputText({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "저녁: 닭갈비" }]
        }
      ]
    }),
    "저녁: 닭갈비"
  );
});

test("buildFoodPoisoningRiskRequest uses configured endpoint and key", () => {
  const request = buildFoodPoisoningRiskRequest({
    endpoint: "https://api.example.com/risk",
    apiKey: "risk-key",
    date: "2026-06-08",
    region: "서울"
  });

  assert.equal(request.url, "https://api.example.com/risk?date=2026-06-08&region=%EC%84%9C%EC%9A%B8");
  assert.deepEqual(request.init.headers, { Authorization: "Bearer risk-key" });
});

test("runMcpTool returns unavailable status when external configuration is missing", async () => {
  assert.deepEqual(await runMcpTool("extract_menu_from_image", { imageUrl: "https://example.com/menu.png" }, {}), {
    ok: false,
    status: "unavailable",
    reason: "OPENAI_API_KEY is not configured"
  });

  assert.deepEqual(await runMcpTool("get_food_poisoning_risk", { date: "2026-06-08" }, {}), {
    ok: false,
    status: "unavailable",
    reason: "FOOD_POISONING_RISK_API_URL is not configured"
  });
});

test("runMcpTool fetches a Kakao post and extracts menu image URLs", async () => {
  const result = await runMcpTool(
    "fetch_kakao_weekly_menu_image",
    { postUrl: "https://pf.kakao.com/channel/posts/1" },
    {
      fetcher: async () =>
        new Response('<meta property="og:image" content="/weekly-menu.png">', {
          status: 200
        })
    }
  );

  assert.deepEqual(result, {
    ok: true,
    postUrl: "https://pf.kakao.com/channel/posts/1",
    imageUrls: ["https://pf.kakao.com/weekly-menu.png"],
    imageUrl: "https://pf.kakao.com/weekly-menu.png"
  });
});

test("runMcpTool syncs weekly OCR from the latest Kakao weekly menu post", async () => {
  const calls: string[] = [];
  const upserts: unknown[] = [];
  const result = await runMcpTool(
    "sync_weekly_menu",
    { now: "2026-06-15T01:30:00.000Z" },
    {
      env: {
        KAKAO_CHANNEL_PROFILE_ID: "_test",
        OPENAI_API_KEY: "test-openai-key"
      },
      fetcher: async (url, init) => {
        const urlText = String(url);
        calls.push(urlText);

        if (urlText.includes("/rocket-web/web/profiles/_test/posts")) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 200,
                  title: "6\uc6d4 10\uc77c(\uc218) \uc911\uc2dd \uba54\ub274",
                  media: [{ xlarge_url: "http://k.kakaocdn.net/dn/daily/path/img_xl.jpg" }]
                },
                {
                  id: 201,
                  title: "6\uc6d4 3\uc8fc\ucc28 \uc2dd\ub2e8\ud45c",
                  media: [{ large_url: "http://k.kakaocdn.net/dn/latest/path/img_l.jpg" }]
                },
                {
                  id: 199,
                  title: "6\uc6d4 2\uc8fc\ucc28 \uc2dd\ub2e8\ud45c",
                  media: [{ large_url: "http://k.kakaocdn.net/dn/old/path/img_l.jpg" }]
                }
              ]
            }),
            { status: 200 }
          );
        }

        if (urlText === "https://api.openai.com/v1/responses") {
          const body = JSON.parse(String(init?.body));
          assert.equal(body.input[0].content[1].image_url, "https://k.kakaocdn.net/dn/latest/path/img_xl.jpg");
          return new Response(
            JSON.stringify({
              output_text: JSON.stringify(
                weeklyMenuPayload({
                  monday: { lunch: ["next lunch"], dinner: [] }
                })
              )
            }),
            { status: 200 }
          );
        }

        throw new Error(`unexpected fetch: ${urlText}`);
      },
      menuArchiveStore: {
        async upsertDailyMenuImage(input) {
          upserts.push(input);
          return { id: `${input.date}:${input.mealType}`, ...input };
        }
      }
    }
  );

  assert.equal(calls[0], "https://pf.kakao.com/rocket-web/web/profiles/_test/posts?includePinnedPost=true");
  assert.deepEqual(result, {
    imageUrl: "https://k.kakaocdn.net/dn/latest/path/img_xl.jpg",
    ok: true,
    synced: [{ date: "2026-06-08", items: ["next lunch"], mealType: "LUNCH", sourceId: "weekly:2026-06-08:monday:LUNCH" }],
    syncedCount: 1,
    weekStart: "2026-06-08"
  });
  assert.equal(upserts.length, 1);
});

test("dailyMenuImageMealTypesToCheck follows lunch and dinner Kakao post windows", () => {
  // 11:10 KST -> 점심, 17:20 KST -> 저녁 (창 안)
  assert.deepEqual(dailyMenuImageMealTypesToCheck(new Date("2026-06-08T02:10:00.000Z")), ["LUNCH"]);
  assert.deepEqual(dailyMenuImageMealTypesToCheck(new Date("2026-06-08T08:20:00.000Z")), ["DINNER"]);
  // 13:20 KST -> 여전히 점심 창(13:30까지), 18:50 KST -> 여전히 저녁 창(19:30까지) — 늦은 보충 실행 대응
  assert.deepEqual(dailyMenuImageMealTypesToCheck(new Date("2026-06-08T04:20:00.000Z")), ["LUNCH"]);
  assert.deepEqual(dailyMenuImageMealTypesToCheck(new Date("2026-06-08T09:50:00.000Z")), ["DINNER"]);
  // 15:00 KST -> 두 창 사이라 비어 있음
  assert.deepEqual(dailyMenuImageMealTypesToCheck(new Date("2026-06-08T06:00:00.000Z")), []);
  // 일요일은 항상 비어 있음
  assert.deepEqual(dailyMenuImageMealTypesToCheck(new Date("2026-06-14T02:10:00.000Z")), []);
});

test("parseKakaoMealPostTitle reads date weekday and lunch or dinner labels", () => {
  assert.deepEqual(parseKakaoMealPostTitle("6월 8일(월) 중식 메뉴"), {
    day: 8,
    mealType: "LUNCH",
    month: 6,
    weekday: "월"
  });
  assert.deepEqual(parseKakaoMealPostTitle("6월 8일(월) 석식 메뉴"), {
    day: 8,
    mealType: "DINNER",
    month: 6,
    weekday: "월"
  });
  assert.equal(parseKakaoMealPostTitle("6월 주간 식단표"), null);
});

test("findKakaoDailyMealPost matches today's date weekday and meal type", () => {
  const posts = [
    {
      id: "lunch-post",
      title: "6월 8일(월) 중식 메뉴",
      text: "돈까스, 김치",
      media: [{ url: "http://k.kakaocdn.net/menu/img_l.jpg" }]
    },
    {
      id: "dinner-post",
      title: "6월 8일(월) 석식 메뉴",
      text: "미역국, 잡곡밥"
    }
  ];

  assert.equal(findKakaoDailyMealPost(posts, new Date("2026-06-08T02:10:00.000Z"), "LUNCH")?.id, "lunch-post");
  assert.equal(findKakaoDailyMealPost(posts, new Date("2026-06-08T02:10:00.000Z"), "DINNER")?.id, "dinner-post");
  assert.equal(findKakaoDailyMealPost(posts, new Date("2026-06-09T02:10:00.000Z"), "LUNCH"), null);
});

test("runMcpTool syncs daily Kakao meal image into the menu archive store", async () => {
  const upserts: unknown[] = [];
  const result = await runMcpTool(
    "sync_daily_menu_image",
    {
      now: "2026-06-08T02:10:00.000Z"
    },
    {
      env: {
        KAKAO_CHANNEL_PROFILE_ID: "_test"
      },
      fetcher: async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: "post-1",
                title: "6월 8일(월) 중식 메뉴",
                text: "돈까스, 김치",
                media: [{ url: "http://k.kakaocdn.net/menu/img_l.jpg" }]
              }
            ]
          }),
          { status: 200 }
        ),
      menuArchiveStore: {
        async upsertDailyMenuImage(input) {
          upserts.push(input);
          return { id: "menu-1", ...input };
        }
      }
    }
  );

  assert.deepEqual(result, {
    checkedMealTypes: ["LUNCH"],
    found: ["LUNCH"],
    ok: true,
    profileId: "_test",
    skipped: [],
    synced: [
      {
        date: "2026-06-08",
        imageUrl: "https://k.kakaocdn.net/menu/img_xl.jpg",
        items: ["돈까스", "김치"],
        mealType: "LUNCH",
        sourceId: "post-1",
        title: "6월 8일(월) 중식 메뉴"
      }
    ]
  });
  assert.deepEqual(upserts, [
    {
      date: "2026-06-08",
      imageHash: null,
      imageType: "MEAL_PHOTO",
      imageUrl: "https://k.kakaocdn.net/menu/img_xl.jpg",
      items: ["돈까스", "김치"],
      mealType: "LUNCH",
      rawText: "돈까스, 김치",
      sourceId: "post-1",
      syncedAt: new Date("2026-06-08T02:10:00.000Z")
    }
  ]);
});

test("parseWeeklyMenuOutputText reads fenced weekly OCR JSON", () => {
  const payload = parseWeeklyMenuOutputText(`\`\`\`json
{
  "week_start": "2026-06-08",
  "menus": {
    "monday": { "lunch": ["돈까스", "김치"], "dinner": ["미역국"] },
    "tuesday": { "lunch": [], "dinner": [] }
  }
}
\`\`\``);

  assert.equal(payload.week_start, "2026-06-08");
  assert.deepEqual(payload.menus.monday.lunch, ["돈까스", "김치"]);
  assert.deepEqual(payload.menus.monday.dinner, ["미역국"]);
});

test("buildWeeklyMenuArchiveInputs maps weekly menus to dated lunch and dinner upserts", () => {
  const inputs = buildWeeklyMenuArchiveInputs(
    weeklyMenuPayload({
      monday: { lunch: ["월점심"], dinner: ["월저녁"] },
      tuesday: { lunch: ["화점심"], dinner: ["화저녁"] },
      wednesday: { lunch: ["수점심"], dinner: ["수저녁"] },
      thursday: { lunch: ["목점심"], dinner: ["목저녁"] },
      friday: { lunch: ["금점심"], dinner: ["금저녁"] },
      saturday: { lunch: ["토점심"], dinner: ["토저녁"] }
    }),
    {
      imageUrl: "https://k.kakaocdn.net/weekly/img_xl.jpg",
      sourceIdPrefix: "weekly:2026-06-08",
      syncedAt: new Date("2026-06-08T00:00:00.000Z")
    }
  );

  assert.equal(inputs.length, 12);
  assert.deepEqual(inputs[0], {
    date: "2026-06-08",
    imageHash: null,
    imageType: "NONE",
    imageUrl: null,
    items: ["월점심"],
    mealType: "LUNCH",
    preserveExistingImage: true,
    rawText: "월점심",
    sourceId: "weekly:2026-06-08:monday:LUNCH",
    syncedAt: new Date("2026-06-08T00:00:00.000Z")
  });
  assert.deepEqual(inputs[11], {
    date: "2026-06-13",
    imageHash: null,
    imageType: "NONE",
    imageUrl: null,
    items: ["토저녁"],
    mealType: "DINNER",
    preserveExistingImage: true,
    rawText: "토저녁",
    sourceId: "weekly:2026-06-08:saturday:DINNER",
    syncedAt: new Date("2026-06-08T00:00:00.000Z")
  });
});

test("runMcpTool syncs weekly OCR menu into the menu archive store", async () => {
  const upserts: unknown[] = [];
  const result = await runMcpTool(
    "sync_weekly_menu",
    {
      imageUrl: "http://k.kakaocdn.net/weekly/img_l.jpg",
      now: "2026-06-08T00:00:00.000Z"
    },
    {
      env: {
        OPENAI_API_KEY: "test-openai-key"
      },
      fetcher: async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify(
              weeklyMenuPayload({
                monday: { lunch: ["월점심"], dinner: ["월저녁"] },
                tuesday: { lunch: ["화점심"], dinner: ["화저녁"] },
                wednesday: { lunch: ["수점심"], dinner: ["수저녁"] },
                thursday: { lunch: ["목점심"], dinner: ["목저녁"] },
                friday: { lunch: ["금점심"], dinner: ["금저녁"] },
                saturday: { lunch: ["토점심"], dinner: ["토저녁"] }
              })
            )
          }),
          { status: 200 }
        ),
      menuArchiveStore: {
        async upsertDailyMenuImage(input) {
          upserts.push(input);
          return { id: `${input.date}:${input.mealType}`, ...input };
        }
      }
    }
  );

  assert.deepEqual(result, {
    imageUrl: "https://k.kakaocdn.net/weekly/img_xl.jpg",
    ok: true,
    synced: [
      { date: "2026-06-08", items: ["월점심"], mealType: "LUNCH", sourceId: "weekly:2026-06-08:monday:LUNCH" },
      { date: "2026-06-08", items: ["월저녁"], mealType: "DINNER", sourceId: "weekly:2026-06-08:monday:DINNER" },
      { date: "2026-06-09", items: ["화점심"], mealType: "LUNCH", sourceId: "weekly:2026-06-08:tuesday:LUNCH" },
      { date: "2026-06-09", items: ["화저녁"], mealType: "DINNER", sourceId: "weekly:2026-06-08:tuesday:DINNER" },
      { date: "2026-06-10", items: ["수점심"], mealType: "LUNCH", sourceId: "weekly:2026-06-08:wednesday:LUNCH" },
      { date: "2026-06-10", items: ["수저녁"], mealType: "DINNER", sourceId: "weekly:2026-06-08:wednesday:DINNER" },
      { date: "2026-06-11", items: ["목점심"], mealType: "LUNCH", sourceId: "weekly:2026-06-08:thursday:LUNCH" },
      { date: "2026-06-11", items: ["목저녁"], mealType: "DINNER", sourceId: "weekly:2026-06-08:thursday:DINNER" },
      { date: "2026-06-12", items: ["금점심"], mealType: "LUNCH", sourceId: "weekly:2026-06-08:friday:LUNCH" },
      { date: "2026-06-12", items: ["금저녁"], mealType: "DINNER", sourceId: "weekly:2026-06-08:friday:DINNER" },
      { date: "2026-06-13", items: ["토점심"], mealType: "LUNCH", sourceId: "weekly:2026-06-08:saturday:LUNCH" },
      { date: "2026-06-13", items: ["토저녁"], mealType: "DINNER", sourceId: "weekly:2026-06-08:saturday:DINNER" }
    ],
    syncedCount: 12,
    weekStart: "2026-06-08"
  });
  assert.equal(upserts.length, 12);
  assert.deepEqual(upserts[0], {
    date: "2026-06-08",
    imageHash: null,
    imageType: "NONE",
    imageUrl: null,
    items: ["월점심"],
    mealType: "LUNCH",
    preserveExistingImage: true,
    rawText: "월점심",
    sourceId: "weekly:2026-06-08:monday:LUNCH",
    syncedAt: new Date("2026-06-08T00:00:00.000Z")
  });
});

test("runMcpTool skips weekly OCR when the current week menu is already synced", async () => {
  const calls: string[] = [];
  const result = await runMcpTool(
    "sync_weekly_menu",
    { now: "2026-06-15T01:30:00.000Z" },
    {
      env: {
        KAKAO_CHANNEL_PROFILE_ID: "_test",
        OPENAI_API_KEY: "test-openai-key"
      },
      fetcher: async (url) => {
        calls.push(String(url));
        throw new Error("weekly sync should not fetch when the week is already synced");
      },
      menuArchiveStore: {
        async hasWeeklyMenuText(weekStart) {
          assert.equal(weekStart, "2026-06-15");
          return true;
        },
        async upsertDailyMenuImage() {
          throw new Error("weekly sync should not upsert when the week is already synced");
        }
      }
    }
  );

  assert.deepEqual(result, {
    ok: true,
    reason: "weekly menu already synced",
    skipped: true,
    status: "skipped",
    synced: [],
    syncedCount: 0,
    weekStart: "2026-06-15"
  });
  assert.deepEqual(calls, []);
});

test("runLoggedMcpTool stores success output in a call log", async () => {
  const events: unknown[] = [];
  const result = await runLoggedMcpTool(
    "extract_menu_image_urls",
    {
      html: '<img src="/menu.png">',
      baseUrl: "https://pf.kakao.com/channel/posts/1"
    },
    {
      logStore: {
        async create(input) {
          events.push({ create: input });
          return { id: "log-1" };
        },
        async update(id, data) {
          events.push({ update: { id, data } });
        }
      }
    }
  );

  assert.deepEqual(result, {
    ok: true,
    imageUrls: ["https://pf.kakao.com/menu.png"],
    imageUrl: "https://pf.kakao.com/menu.png"
  });
  assert.deepEqual(events, [
    {
      create: {
        toolName: "extract_menu_image_urls",
        input: {
          html: '<img src="/menu.png">',
          baseUrl: "https://pf.kakao.com/channel/posts/1"
        }
      }
    },
    {
      update: {
        id: "log-1",
        data: {
          status: "SUCCESS",
          output: result
        }
      }
    }
  ]);
});

function weeklyMenuPayload(menus: Record<string, { dinner: string[]; lunch: string[] }>) {
  return {
    week_start: "2026-06-08",
    menus
  };
}
