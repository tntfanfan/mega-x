"""Exercise the real SeriesApp/AskCard/WebSocket flow with a local model substitute.

Run with Vite available at SERIES_BROWSER_BASE (defaults to http://127.0.0.1:5197).
All app API and socket traffic is intercepted; no tenant data or model calls.
"""
import asyncio
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright, expect

BASE = os.environ.get("SERIES_BROWSER_BASE", "http://127.0.0.1:5197").rstrip("/")
OUT = Path("/tmp/series-ui-acceptance")
OUT.mkdir(exist_ok=True)


def question(header, options, multi=False):
    return {"header": header, "question": header + "怎么选？", "options": [{"label": o} for o in options], "multi": multi}


def assistant(ask, ident="m-original"):
    return {"id": ident, "role": "assistant", "key": "lead", "source": "lead", "text": "请选择。", "asks": [ask] if ask else [], "at": "2026-11-05T12:00:00Z"}


async def main():
    questions = [question("基调", ["甜宠", "苦情", "你定", " 你来定 "]), question("形态", ["竖屏", "横屏"]),
                 question("视角", ["女主视角", "男主视角"], True), question("时长", ["1 分钟", "3 分钟"])]
    history = [assistant({"id": "a-original", "questions": questions})]
    submitted, sockets, errors = [], [], []
    session = {"id": "s-empty", "title": "换一批测试", "project_id": None}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda e: errors.append(str(e)))

        async def api(route):
            path = urlparse(route.request.url).path.removeprefix("/series-test-api")
            if path == "/sessions":
                body = {"sessions": [session]}
            elif path.endswith("/history"):
                body = {"session": session, "messages": history, "live": None, "project_id": None}
            elif path == "/projects":
                body = {"projects": []}
            elif path == "/capabilities":
                body = {"uploads": {"extensions": [".txt"], "maxBytes": {"text": 5242880}, "batchMax": 10, "batchMaxBytes": 209715200}}
            else:
                await route.fulfill(status=404, json={"detail": path})
                return
            await route.fulfill(json=body)

        def connect(ws):
            sockets.append(ws)

            def receive(raw):
                msg = json.loads(raw)
                if msg["op"] == "ping":
                    ws.send(json.dumps({"type": "pong"}))
                elif msg["op"] == "answer":
                    submitted.append(msg)

            ws.on_message(receive)
            ws.send(json.dumps({"type": "ready", "live": False}))

        def complete(text, next_ask=None):
            msg = submitted[-1]
            ident = "u-" + str(len(submitted))
            row = {"id": ident, "role": "user", "text": text, "answer_to": msg["ask_id"], "client_message_id": msg["client_message_id"]}
            history.extend([row, assistant(next_ask, "m-" + ident)])
            frames = [{"type": "accepted", "client_message_id": msg["client_message_id"], "message": row},
                      {"type": "start", "seq": 1, "key": "lead", "source": "lead"}]
            if next_ask:
                frames.append({"type": "ask", "seq": 2, "key": "lead", "source": "lead", **next_ask})
            frames.extend([{"type": "end", "seq": 3, "key": "lead"},
                           {"type": "result", "seq": 4, "ok": True, "reply_to": ident}, {"type": "idle", "seq": 5}])
            for frame in frames:
                sockets[-1].send(json.dumps(frame, ensure_ascii=False))

        await page.route("**/series-test-api/**", api)
        await page.route_web_socket("**/series-test-api/chat*", connect)
        await page.goto(BASE + "/console/tests/fixtures/series-app.html")
        chat = page.get_by_role("region", name="对话")
        fields = chat.locator("fieldset")
        refresh = chat.get_by_role("button", name=re.compile("换一批"))
        confirm = chat.get_by_role("button", name="确认", exact=True)
        await expect(refresh).to_have_count(4)
        await expect(refresh.first).to_be_enabled()
        await expect(chat.get_by_role("button", name=re.compile("你定|你来定"))).to_have_count(0)
        await expect(confirm).to_be_disabled()
        # Refresh is a local, reversible selection. Other questions stay editable.
        await refresh.first.click()
        await expect(refresh.first).to_have_attribute("aria-pressed", "true")
        await expect(confirm).to_be_enabled()
        assert not submitted, "refresh submitted before confirmation"
        await refresh.first.click()
        await expect(refresh.first).to_have_attribute("aria-pressed", "false")
        await expect(confirm).to_be_disabled()
        await refresh.first.click()
        await fields.nth(1).get_by_role("button", name=re.compile("竖屏")).click()
        await fields.nth(2).get_by_role("button", name=re.compile("女主视角")).click()
        await fields.nth(2).get_by_role("button", name=re.compile("男主视角")).click()
        await fields.nth(2).get_by_role("button", name=re.compile("自己写")).click()
        await fields.nth(2).get_by_role("textbox").fill("轮流讲述")
        await refresh.nth(3).click()
        await expect(refresh.nth(3)).to_have_attribute("aria-pressed", "true")
        await expect(refresh.first).to_have_attribute("aria-pressed", "true")
        await refresh.nth(3).click()
        await expect(refresh.nth(3)).to_have_attribute("aria-pressed", "false")
        assert not submitted, "editing other questions submitted the refresh"
        await page.screenshot(path=str(OUT / "choices-refresh-confirm.png"))
        await confirm.click()
        await expect(refresh.first).to_be_disabled()
        assert len(submitted) == 1
        expected = [{"choices": [], "action": "refresh"}, {"choices": ["竖屏"]},
                    {"choices": ["女主视角", "男主视角"], "text": "轮流讲述"}, {"choices": []}]
        assert submitted[-1]["answers"] == expected, submitted[-1]
        assert submitted[-1]["ask_id"] == "a-original"
        # Rejection must clear pending state and preserve locally selected siblings.
        sockets[-1].send(json.dumps({"type": "error", "code": "busy", "message": "请稍后重试", "client_message_id": submitted[-1]["client_message_id"]}))
        await expect(refresh.first).to_be_enabled()
        await expect(refresh.first).to_have_attribute("aria-pressed", "true")
        await expect(fields.nth(1).get_by_role("button", name=re.compile("竖屏"))).to_have_attribute("aria-pressed", "true")
        await expect(fields.nth(2).get_by_role("textbox")).to_have_value("轮流讲述")
        await confirm.click()
        await expect(refresh.first).to_be_disabled()
        assert len(submitted) == 2
        assert submitted[-1]["answers"] == expected
        complete("基调：换一批\n形态：竖屏\n视角：女主视角、男主视角、轮流讲述\n时长：待选择",
                 {"id": "a-new", "questions": [question("基调", ["轻喜剧", "悬疑"]), questions[3]]})
        await expect(refresh).to_have_count(2)
        await expect(refresh.first).to_be_enabled()
        await expect(chat.get_by_text("已请求更换选项", exact=True)).to_have_count(1)
        await expect(chat.get_by_text("轮流讲述", exact=True)).to_be_visible()
        await expect(chat.get_by_text("待选择", exact=True)).to_be_visible()
        await fields.nth(1).get_by_role("button", name=re.compile("3 分钟")).click()
        await refresh.first.click()
        await expect(refresh.first).to_have_attribute("aria-pressed", "true")
        assert len(submitted) == 2
        await confirm.click()
        await expect(refresh.first).to_be_disabled()
        assert len(submitted) == 3
        assert submitted[-1]["ask_id"] == "a-new"
        assert submitted[-1]["answers"] == [{"choices": [], "action": "refresh"}, {"choices": ["3 分钟"]}]
        complete("基调：换一批\n时长：3 分钟", {"id": "a-third", "questions": [question("基调", ["热血", "温暖治愈"])]})
        await expect(refresh).to_have_count(1)
        await expect(refresh).to_be_enabled()
        await fields.get_by_role("button", name=re.compile("温暖治愈")).click()
        await expect(confirm).to_be_enabled()
        assert len(submitted) == 3, "single choice submitted before confirmation"
        await confirm.click()
        await expect(refresh).to_be_disabled()
        assert len(submitted) == 4
        assert submitted[-1]["answers"] == [{"choices": ["温暖治愈"]}]
        complete("温暖治愈")
        await expect(refresh).to_have_count(0)
        await page.reload()
        await expect(chat.get_by_text("已请求更换选项", exact=True)).to_have_count(2)
        await expect(chat.get_by_text("温暖治愈", exact=True)).to_be_visible()
        await page.screenshot(path=str(OUT / "choices-refresh-history.png"))

        # Old single-question history gets the same action, without a duplicate.
        history[:] = [assistant({"id": "a-legacy", "question": "选个方向？", "options": ["甜宠", "悬疑", "你定", "你来定", "换一批"]})]
        await page.reload()
        await expect(refresh).to_have_count(1)
        await expect(chat.get_by_role("button", name=re.compile("你定|你来定"))).to_have_count(0)
        await expect(refresh).to_be_enabled()
        await chat.get_by_text("选个方向？", exact=True).click()
        await page.keyboard.press("3")
        await expect(refresh).to_have_attribute("aria-pressed", "true")
        assert len(submitted) == 4, "keyboard refresh submitted before confirmation"
        await page.keyboard.press("Enter")
        await expect(refresh).to_be_disabled()
        assert len(submitted) == 5
        assert submitted[-1]["answers"] == [{"choices": [], "action": "refresh"}]
        complete("换一批", {"id": "a-multi", "questions": [question("题材", ["探险", "职场"], True)]})
        await expect(refresh).to_be_enabled()
        await fields.get_by_role("button", name=re.compile("探险")).click()
        await fields.get_by_role("button", name=re.compile("职场")).click()
        await fields.get_by_role("button", name=re.compile("自己写")).click()
        await fields.get_by_role("textbox").fill("竞技冒险")
        await refresh.click()
        await expect(refresh).to_have_attribute("aria-pressed", "true")
        await expect(fields.get_by_role("textbox")).to_have_count(0)
        await expect(fields.get_by_role("button", name=re.compile("探险"))).to_have_attribute("aria-pressed", "false")
        await expect(fields.get_by_role("button", name=re.compile("职场"))).to_have_attribute("aria-pressed", "false")
        await fields.get_by_role("button", name=re.compile("自己写")).click()
        await expect(refresh).to_have_attribute("aria-pressed", "false")
        await expect(fields.get_by_role("textbox")).to_have_value("")
        await expect(confirm).to_be_disabled()
        await fields.get_by_role("textbox").fill("换成科幻")
        await expect(confirm).to_be_enabled()
        await refresh.click()
        await fields.get_by_role("button", name=re.compile("探险")).click()
        await expect(refresh).to_have_attribute("aria-pressed", "false")
        await refresh.click()
        await page.set_viewport_size({"width": 390, "height": 844})
        await refresh.scroll_into_view_if_needed()
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "mobile overflow"
        await page.screenshot(path=str(OUT / "choices-refresh-mobile.png"))
        assert len(submitted) == 5, "multiselect refresh submitted before confirmation"
        await confirm.click()
        await expect(refresh).to_be_disabled()
        assert len(submitted) == 6
        assert submitted[-1]["answers"] == [{"choices": [], "action": "refresh"}], "do not submit rejected choices"
        complete("换一批", {"id": "a-batch", "questions": [question("题材", ["体育", "奇幻"], True), questions[1]]})
        await expect(refresh).to_have_count(2)
        await expect(refresh.first).to_be_enabled()
        # One confirmation submits every marked question together.
        await fields.first.locator("legend").click()
        await page.keyboard.press("3")
        await page.keyboard.press("3")
        await expect(refresh.nth(0)).to_have_attribute("aria-pressed", "true")
        await expect(refresh.nth(1)).to_have_attribute("aria-pressed", "true")
        assert len(submitted) == 6
        await confirm.click()
        await expect(refresh.first).to_be_disabled()
        assert len(submitted) == 7
        assert submitted[-1]["answers"] == [{"choices": [], "action": "refresh"}, {"choices": [], "action": "refresh"}]
        complete("题材：换一批\n形态：换一批", {"id": "a-last", "questions": [question("题材", ["体育", "奇幻"], True)]})
        await expect(refresh).to_have_count(1)
        await expect(refresh).to_be_enabled()
        # An old unanswered card is read-only once the conversation has moved on.
        history.append({"id": "u-manual", "role": "user", "text": "先聊别的"})
        await page.reload()
        await expect(refresh).to_be_disabled()
        count = len(submitted)
        await chat.get_by_text("先聊别的", exact=True).click()
        await page.keyboard.press("3")
        await page.keyboard.press("Enter")
        await expect(confirm).to_be_disabled()
        assert len(submitted) == count
        assert not errors, errors
        print(json.dumps({"passed": ["removed decide choices in new and legacy cards", "refresh waits for confirmation", "refresh selection can be cancelled", "other questions remain editable", "partial answers", "preserve multiselect and custom text", "pending and retry", "new choices and repeated refresh", "single choice waits for confirmation", "history reload", "legacy keyboard confirmation", "refresh is exclusive with choices and custom text", "multiple refreshes in one confirmation", "mobile layout", "expired card disabled"], "screenshots": str(OUT)}, ensure_ascii=False))
        await browser.close()


asyncio.run(main())
