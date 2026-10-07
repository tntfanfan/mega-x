import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(
  modulePath ? pathToFileURL(modulePath).href : "playwright"
);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const origin = process.env.RESEARCH_PREVIEW_URL || "http://127.0.0.1:5190";
const calls = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const companies = ["c-a", "c-b"].map((id, i) => ({
  id,
  name: i ? "Second Company" : "Research Company",
  emoji: "",
  state: "running",
  dept_ids: ["dept-ceo"],
  token_usage_30d: 0,
}));
const roles = ["buffett", "munger", "graham", "lynch"].map((id, i) => ({
  id,
  name: ["巴菲特", "芒格", "格雷厄姆", "林奇"][i],
  version: "1",
  summary: "投资研究视角",
  name_en: [
    "Warren Buffett",
    "Charlie Munger",
    "Benjamin Graham",
    "Peter Lynch",
  ][i],
  summary_en: "Investment research perspective",
  school_id: "A",
}));
const task = {
  id: "t-12345678",
  title: "AAPL Research",
  state: "done",
  executor: "research",
  created_at: "2026-10-03T01:00:00Z",
  research: { request: { market: "US" } },
  run: {
    id: "r-20261003-1234567890abcdef",
    state: "done",
    last_seq: 6,
    result: { quality: "complete" },
  },
};
let conv = null,
  turns = [],
  failSend = false,
  failSubmit = false,
  departmentStatus = "ready",
  largeOutputs = false,
  largeHistory = false,
  delayTask = false;
let researchPosts = 0;
await context.route("**/v1/**", async (route) => {
  const request = route.request(),
    u = new URL(request.url()),
    path = u.pathname,
    method = request.method(),
    body = request.postDataJSON();
  calls.push({ path, method, body, headers: request.headers() });
  let data = {},
    status = 200;
  if (path === "/v1/me")
    data = {
      user: {
        id: "user-test",
        email: "test@example.test",
        display_name: "Test",
      },
      roles: [],
    };
  else if (path === "/v1/companies") data = { items: companies };
  else if (/^\/v1\/companies\/c-[ab]$/.test(path))
    data = companies.find((c) => path.endsWith(c.id));
  else if (path.endsWith("/research/department"))
    data = {
      installation_status: departmentStatus,
      can_install: departmentStatus !== "ready",
      operation_id: departmentStatus === "pending" ? "op-old" : undefined,
      capabilities: {
        can_submit: true,
        supported_languages: ["zh", "en"],
        markets: {
          A: {
            can_submit: departmentStatus === "ready",
            reason: departmentStatus === "ready" ? "ready" : "not_installed",
            supported_depths: ["quick", "standard"],
          },
          US: {
            can_submit: departmentStatus === "ready",
            reason: departmentStatus === "ready" ? "ready" : "not_installed",
            supported_depths: ["quick", "standard"],
          },
        },
      },
    };
  else if (path.endsWith("/research/dialogue/capabilities"))
    data = { can_send: true };
  else if (path.endsWith("/research/dialogue/personas")) data = roles;
  else if (
    path.endsWith("/research/dialogue/conversations") &&
    method === "POST"
  )
    data = conv = {
      id: "d-test",
      title: "Test conversation",
      kind: body.persona_ids ? "roundtable" : "single",
      persona_snapshot: roles.find((p) => p.id === body.persona_id) || roles[0],
      participant_snapshots: body.persona_ids?.map((id) =>
        roles.find((p) => p.id === id),
      ),
      report: body.report,
      sections: [{ id: "s1", title: "Evidence" }],
      mode: body.report ? "report" : "free",
    };
  else if (path.endsWith("/research/dialogue/conversations"))
    data = largeHistory
      ? Array.from(
          { length: Number(u.searchParams.get("offset")) ? 1 : 30 },
          (_, i) => ({
            ...conv,
            id: "d-history-" + (Number(u.searchParams.get("offset")) + i),
          }),
        )
      : conv
        ? [conv]
        : [];
  else if (path.endsWith("/research/dialogue/conversations/d-test"))
    data = conv;
  else if (path.endsWith("/turns") && method === "POST") {
    if (failSend) {
      failSend = false;
      status = 503;
      data = { detail: "generation_failed" };
    } else {
      const answer = {
        state: "completed",
        reply: "<script>window.researchXss=true</script> Original answer",
        citations: ["s1"],
        citation_warning: true,
      };
      data = {
        id: "m-" + (turns.length + 1),
        message: body.message,
        ...answer,
        ...(conv.kind === "roundtable"
          ? {
              speeches: conv.participant_snapshots.map((p) => ({
                ...answer,
                persona_id: p.id,
              })),
            }
          : {}),
      };
      turns.push(data);
    }
  } else if (path.endsWith("/turns")) data = turns;
  else if (path.endsWith("/research/tasks") && method === "POST") {
    if (failSubmit) {
      failSubmit = false;
      status = 503;
      data = { detail: "provider_timeout" };
    } else data = { task_id: task.id };
  } else if (path.endsWith("/tasks"))
    data = {
      items: [
        {
          ...task,
          title: path.includes("/c-b/") ? "Second Company Task" : task.title,
        },
      ],
    };
  else if (path.endsWith("/tasks/" + task.id)) {
    if (delayTask && path.includes("/c-a/"))
      await new Promise((resolve) => setTimeout(resolve, 800));
    data = {
      ...task,
      title: path.includes("/c-b/") ? "Second Company Task" : task.title,
    };
  } else if (path.endsWith("/outputs/list") && largeOutputs)
    data = {
      items: Array.from(
        { length: Math.min(Number(u.searchParams.get("limit")) || 200, 201) },
        (_, i) => ({
          name: "report-" + i + ".html",
          path: "archive/report-" + i + ".html",
          size: 1024,
        }),
      ),
    };
  else if (path.endsWith("/outputs/list"))
    data = {
      items: [
        {
          name: "report.html",
          path: `tasks/${task.id}/runs/${task.run.id}/final/report.html`,
          size: 1024,
        },
      ],
    };
  else if (path.endsWith("/outputs/preview-url"))
    data = { url: "/v1/outputs/s/test" };
  else if (path.includes("/outputs/s/"))
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<h1>Research report</h1>",
    });
  else if (path.includes("/operations/")) {
    status = 404;
    data = { detail: "historical operation unavailable" };
  } else if (path.endsWith("/research/install") && method === "POST") {
    departmentStatus = "pending";
    data = {};
  } else if (path.endsWith("/depts")) data = { items: [] };
  else if (path.endsWith("/outputs/tree")) data = { nodes: [] };
  else if (path.endsWith("/tasks/active") || path.endsWith("/activity"))
    data = { items: [] };
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
});
try {
  await page.goto(`${origin}/console/?lang=zh#/business/c/c-a/research`);
  await page
    .getByRole("heading", { name: "新建股票研究", exact: true })
    .waitFor({ timeout: 5000 });
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("Research route and authenticated company shell: PASS");
  const research = page.locator("#research"),
    dialogue = page.locator("#dialogue");
  await research.locator("input").waitFor();
  await research.getByRole("combobox").first().selectOption("US");
  assert.equal(
    await research.getByRole("combobox").nth(1).locator("option").count(),
    1,
  );
  await research.locator("input").fill("brk.b");
  failSubmit = true;
  await research.getByRole("button", { name: "开始研究", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /provider_timeout|数据源连接超时/ })
    .waitFor({ timeout: 3000 });
  await research.getByRole("button", { name: "开始研究", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "研究已提交" }).waitFor();
  const submits = calls.filter(
    (c) => c.path.endsWith("/research/tasks") && c.method === "POST",
  );
  assert.equal(submits.length, 2);
  assert.equal(
    submits[0].headers["idempotency-key"],
    submits[1].headers["idempotency-key"],
  );
  assert.equal(submits[1].body.ticker, "BRK-B");
  await page.getByRole("button", { name: "与角色讨论", exact: true }).click();
  await dialogue.getByText(/固定版本 r-20261003/).waitFor();
  await dialogue.locator("textarea").fill("<script>unsafe</script> 原始问题");
  failSend = true;
  await dialogue.getByRole("button", { name: "发送问题", exact: true }).click();
  await dialogue
    .getByRole("status")
    .filter({ hasText: "本次生成失败" })
    .waitFor();
  assert.equal(
    await dialogue.locator("textarea").inputValue(),
    "<script>unsafe</script> 原始问题",
  );
  await dialogue.getByRole("button", { name: "发送问题", exact: true }).click();
  await dialogue
    .getByText("<script>window.researchXss=true</script> Original answer", {
      exact: true,
    })
    .waitFor();
  const sends = calls.filter(
    (c) => c.path.endsWith("/turns") && c.method === "POST",
  );
  assert.equal(
    sends[0].headers["idempotency-key"],
    sends[1].headers["idempotency-key"],
  );
  assert.equal(await page.evaluate(() => window.researchXss), undefined);
  assert.deepEqual(
    calls.find((c) => c.path.endsWith("/conversations") && c.method === "POST")
      .body.report,
    { task_id: task.id, run_id: task.run.id },
  );
  await dialogue.getByRole("button", { name: /林奇/ }).click();
  assert.equal(await dialogue.locator("textarea").inputValue(), "");
  assert.equal(
    await dialogue.getByText("Original answer", { exact: false }).count(),
    0,
  );
  await dialogue.locator("textarea").fill("林奇草稿");
  await dialogue.getByRole("button", { name: /巴菲特/ }).click();
  await dialogue.getByRole("button", { name: /林奇/ }).click();
  assert.equal(await dialogue.locator("textarea").inputValue(), "林奇草稿");
  await dialogue.getByRole("button", { name: "投资圆桌", exact: true }).click();
  assert.equal(await dialogue.getByRole("checkbox").count(), 4);
  await dialogue
    .getByRole("checkbox", { name: "格雷厄姆", exact: true })
    .check();
  await dialogue.getByRole("checkbox", { name: "林奇", exact: true }).check();
  await dialogue.locator("textarea").fill("圆桌问题");
  await dialogue.getByRole("button", { name: "发送问题", exact: true }).click();
  await dialogue
    .getByText("Original answer", { exact: false })
    .first()
    .waitFor();
  const roundCall = calls
    .filter((c) => c.path.endsWith("/conversations") && c.method === "POST")
    .at(-1);
  assert.deepEqual(roundCall.body.persona_ids, [
    "buffett",
    "munger",
    "graham",
    "lynch",
  ]);
  for (const box of await dialogue.getByRole("checkbox").all())
    assert(await box.isDisabled());
  const originalQuestion = await dialogue
    .locator(".research-dialogue-messages")
    .innerText();
  await page.locator("header select").first().selectOption("en");
  await page
    .getByRole("heading", { name: "New stock research", exact: true })
    .waitFor();
  assert(
    (
      await dialogue.locator(".research-dialogue-messages").innerText()
    ).includes("圆桌问题"),
  );
  assert(originalQuestion.includes("圆桌问题"));
  await page.locator("header select").first().selectOption("ar");
  assert.equal(
    await page.locator(".research-workspace").getAttribute("lang"),
    "en",
  );
  assert.equal(
    await page.locator(".research-workspace").getAttribute("dir"),
    "ltr",
  );
  await page.locator("header select").first().selectOption("zh");
  await mkdir(
    process.env.RESEARCH_ARTIFACT_DIR || "/private/tmp/mega-x-research-qa",
    { recursive: true },
  );
  const artifacts =
    process.env.RESEARCH_ARTIFACT_DIR || "/private/tmp/mega-x-research-qa";
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: artifacts + "/desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.RESEARCH_CAPTURE === "1")
    await page.screenshot({ path: artifacts + "/mobile.png", fullPage: true });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Mobile page overflows horizontally",
  );
  await page.locator("header select").first().selectOption("en");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "English mobile page overflows",
  );
  await page.locator("header select").first().selectOption("zh");
  const before = calls.filter((c) =>
    c.path.endsWith("/research/department"),
  ).length;
  await page.goto(`${origin}/console/?lang=zh#/business/companies`);
  await page.waitForTimeout(5500);
  assert.equal(
    calls.filter((c) => c.path.endsWith("/research/department")).length,
    before,
    "Research polling survived route unmount",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Research writes/retries, report binding, drafts, roundtable, localization, mobile and cleanup: PASS",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/console/?lang=zh#/business/c/c-a/research`);
  await research
    .getByRole("button", { name: "开始研究", exact: true })
    .waitFor();
  for (const [runState, label, endpoint] of [
    ["failed", "重新研究", "/research/tasks/" + task.id + "/retry"],
    [
      "paused",
      "继续研究",
      "/research/tasks/" + task.id + "/runs/" + task.run.id + "/resume",
    ],
    [
      "running",
      "取消任务",
      "/tasks/" + task.id + "/runs/" + task.run.id + "/cancel",
    ],
  ]) {
    task.state = runState;
    task.run.state = runState;
    await page.getByRole("button", { name: "刷新状态", exact: true }).click();
    await page
      .locator("#tasks")
      .getByRole("button", { name: /AAPL Research/ })
      .click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("status").filter({ hasText: "操作已提交" }).waitFor();
    assert(calls.some((c) => c.path.endsWith(endpoint) && c.method === "POST"));
  }
  task.state = "done";
  task.run.state = "done";
  largeOutputs = true;
  await page.getByRole("button", { name: "刷新状态", exact: true }).click();
  await page.getByRole("button", { name: "加载更多成果", exact: true }).click();
  await page.getByText("report-200.html", { exact: true }).first().waitFor();
  assert(
    calls.some((c) => c.path.endsWith("/outputs/list") && c.method === "GET"),
  );
  largeOutputs = false;
  largeHistory = true;
  await dialogue
    .getByRole("button", { name: "发送问题", exact: true })
    .waitFor();
  // Re-enter to fetch the expanded server-side history from offset zero.
  await page.goto(`${origin}/console/?lang=zh#/business/companies`);
  await page.goto(`${origin}/console/?lang=zh#/business/c/c-a/research`);
  await dialogue
    .getByRole("button", { name: "加载更多会话", exact: true })
    .click();
  assert(
    calls.some((c) => c.path.endsWith("/research/dialogue/conversations")),
  );
  largeHistory = false;
  departmentStatus = "not_installed";
  await page.getByRole("button", { name: "刷新状态", exact: true }).click();
  await research
    .getByRole("button", { name: "安装投研部", exact: true })
    .click();
  await research
    .getByText("正在安装投研部。容器重建期间请稍候，页面会自动更新。", {
      exact: true,
    })
    .waitFor();
  assert(
    await research
      .getByRole("button", { name: "开始研究", exact: true })
      .isDisabled(),
  );
  assert(
    await page
      .locator("#tasks")
      .getByRole("button", { name: /AAPL Research/ })
      .isVisible(),
    "Missing operation must not hide task history",
  );
  departmentStatus = "failed";
  await page.getByRole("button", { name: "刷新状态", exact: true }).click();
  await research
    .getByRole("button", { name: "重新安装", exact: true })
    .waitFor();
  departmentStatus = "ready";
  await page.getByRole("button", { name: "刷新状态", exact: true }).click();
  delayTask = true;
  await page
    .locator("#tasks")
    .getByRole("button", { name: /AAPL Research/ })
    .click();
  await page.goto(`${origin}/console/?lang=zh#/business/c/c-b/research`);
  await page
    .locator("#tasks")
    .getByRole("button", { name: /Second Company Task/ })
    .waitFor();
  await page.waitForTimeout(900);
  assert.equal(
    await page
      .getByRole("heading", { name: "AAPL Research", exact: true })
      .count(),
    0,
    "Late old-company detail leaked",
  );
  delayTask = false;
  const pollCount = calls.filter((c) =>
    c.path.endsWith("/research/department"),
  ).length;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(5500);
  assert.equal(
    calls.filter((c) => c.path.endsWith("/research/department")).length,
    pollCount,
    "Hidden page kept polling",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.locator("button").first().focus();
  await page.keyboard.press("Tab");
  assert(
    await page.evaluate(() => document.activeElement !== document.body),
    "Keyboard focus is lost",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  companies[1].name='美股';
  await page.goto(`${origin}/console/?lang=en#/business/c/c-b/research`);
  await page.getByRole('button',{name:'US Stocks',exact:true}).waitFor();
  assert.equal(companies[1].name,'美股');
  console.log(
    "Install/failure states, task actions, outputs/history pagination, company races, hidden polling and keyboard: PASS",
  );
} catch (error) {
  console.error("Page errors:", errors);
  console.error((await page.locator("body").innerText()).slice(0, 900));
  throw error;
} finally {
  await browser.close();
}
