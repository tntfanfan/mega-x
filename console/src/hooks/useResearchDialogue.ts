import { useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../lib/api";
import {
  acceptsContext,
  requestKey,
  forgetKey,
  shouldPoll,
} from "../lib/research/core";
import { availablePersonas } from "../lib/research/catalog";
import {
  dialogueDraftKey,
  dialogueCanSend,
  conversationRequest,
  selectParticipants,
  dialogueError,
  type Selection,
} from "../lib/research/dialogue";
import type { ResearchClient } from "../lib/research/client";
import type {
  ResearchLanguage,
  DialogueCapabilities,
  Persona,
  Conversation,
  DialogueTurn,
  ReportBinding,
} from "../lib/research/types";
const stored = (key: string) => {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
};
const save = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
};
const remove = (key: string) => {
  try {
    sessionStorage.removeItem(key);
  } catch {}
};
function initial(company: string) {
  return {
    company,
    cid: "",
    persona: "buffett",
    kind: "single" as Selection["kind"],
    participants: ["buffett", "munger"],
    generation: 0,
    capability: {} as DialogueCapabilities,
    personas: [] as Persona[],
    conversations: [] as Conversation[],
    conversation: null as Conversation | null,
    turns: [] as DialogueTurn[],
    report: null as ReportBinding | null,
    message: "",
    busy: false,
    error: "",
    loading: true,
    hasMore: false,
  };
}
export function useResearchDialogue(
  companyId: string,
  language: ResearchLanguage,
  client: ResearchClient,
) {
  const [state, setState] = useState(() => initial(companyId)),
    ref = useRef(state);
  const languageRef = useRef(language);
  languageRef.current = language;
  const lifetime = useRef(new AbortController()),
    contextReads = useRef(new AbortController()),
    epoch = useRef(0),
    polling = useRef(""),
    listVersion = useRef(0);
  const update = (changes: Partial<typeof state>) => {
    ref.current = { ...ref.current, ...changes };
    setState(ref.current);
  };
  const current = (ctx: Selection) =>
    !lifetime.current.signal.aborted && acceptsContext(ref.current, ctx);
  const activeKey = () => `native-dialogue-active:${companyId}`;
  const bound = () => ref.current.conversation?.report || ref.current.report;
  const keepDraft = () => {
    if (ref.current.loading) return;
    save(dialogueDraftKey(ref.current, bound()), ref.current.message);
  };
  function switchContext(
    change: Partial<Selection>,
    report: ReportBinding | null = bound(),
  ) {
    keepDraft();
    contextReads.current.abort();
    contextReads.current = new AbortController();
    const next = {
      ...ref.current,
      ...change,
      cid: change.cid || "",
      generation: ref.current.generation + 1,
    };
    update({
      ...next,
      conversation: null,
      turns: [],
      report,
      busy: false,
      error: "",
      message: stored(dialogueDraftKey(next, report)),
    });
    remove(activeKey());
  }
  async function loadList(append = false) {
    const version = ++listVersion.current,
      e = epoch.current,
      signal = lifetime.current.signal,
      offset = append ? ref.current.conversations.length : 0;
    try {
      const rows = await client.conversations(companyId, offset, signal);
      if (
        signal.aborted ||
        e !== epoch.current ||
        version !== listVersion.current
      )
        return;
      update({
        conversations: append ? [...ref.current.conversations, ...rows] : rows,
        hasMore: rows.length >= 30,
      });
    } catch (error) {
      if (!signal.aborted && e === epoch.current)
        update({ error: dialogueError(apiErrorMessage(error)) });
    }
  }
  async function loadTurns() {
    const ctx = { ...ref.current },
      signal = contextReads.current.signal,
      key = `${ctx.cid}:${ctx.generation}`;
    if (!ctx.cid || polling.current === key) return;
    polling.current = key;
    try {
      const turns: DialogueTurn[] = [];
      for (let offset = 0; offset < 200; offset += 50) {
        const page = await client.turns(companyId, ctx.cid, offset, signal);
        if (!current(ctx) || signal.aborted) return;
        turns.push(...page);
        if (page.length < 50) break;
      }
      if (current(ctx)) update({ turns });
    } catch (error) {
      if (current(ctx) && !signal.aborted)
        update({ error: dialogueError(apiErrorMessage(error)) });
    } finally {
      if (polling.current === key) polling.current = "";
    }
  }
  async function openConversation(id: string) {
    if (ref.current.busy) return;
    switchContext({ cid: id }, null);
    const ctx = { ...ref.current },
      signal = contextReads.current.signal;
    try {
      const conversation = await client.conversation(companyId, id, signal);
      if (!current(ctx) || signal.aborted) return;
      const next = {
        ...ref.current,
        persona:
          conversation.persona_snapshot?.id ||
          conversation.participant_snapshots?.[0]?.id ||
          ref.current.persona,
        kind: conversation.kind || "single",
        participants:
          conversation.kind === "roundtable"
            ? conversation.participant_snapshots.map((p) => p.id)
            : ["buffett", "munger"],
      };
      update({
        ...next,
        conversation,
        report: null,
        message: stored(dialogueDraftKey(next, conversation.report)),
      });
      save(activeKey(), id);
      await loadTurns();
    } catch (error) {
      if (current(ctx) && !signal.aborted)
        update({ error: dialogueError(apiErrorMessage(error)) });
    }
  }
  function normalize() {
    const s = ref.current;
    if (s.cid || s.busy) return;
    const available = availablePersonas(s.personas, languageRef.current);
    if (!available.length) return;
    const ids = new Set(available.map((p) => p.id)),
      persona = ids.has(s.persona) ? s.persona : available[0].id,
      participants = s.participants.filter((id) => ids.has(id));
    if (persona !== s.persona || participants.length !== s.participants.length)
      switchContext({ persona, participants });
  }
  useEffect(() => {
    epoch.current++;
    const e = epoch.current;
    lifetime.current.abort();
    contextReads.current.abort();
    lifetime.current = new AbortController();
    contextReads.current = new AbortController();
    const signal = lifetime.current.signal;
    ref.current = initial(companyId);
    setState(ref.current);
    const bootstrap = { ...ref.current };
    void (async () => {
      try {
        const [capability, personas] = await Promise.all([
          client.dialogueCapabilities(companyId, signal),
          client.personas(companyId, signal),
        ]);
        if (signal.aborted || epoch.current !== e) return;
        update({
          capability,
          personas,
          loading: false,
          error: capability.can_send ? "" : dialogueError(capability.reason),
        });
        normalize();
        update({ message: stored(dialogueDraftKey(ref.current, bound())) });
        await loadList();
        if (signal.aborted || epoch.current !== e || !current(bootstrap))
          return;
        const id = stored(activeKey());
        if (id) await openConversation(id);
      } catch (error) {
        if (!signal.aborted && epoch.current === e)
          update({
            loading: false,
            error: dialogueError(apiErrorMessage(error)),
          });
      }
    })();
    const turnsTimer = setInterval(() => {
      if (
        shouldPoll(document.hidden, signal.aborted) &&
        ref.current.turns.some((t) => ["accepted", "running"].includes(t.state))
      )
        void loadTurns();
    }, 2000);
    const capTimer = setInterval(async () => {
      if (!shouldPoll(document.hidden, signal.aborted)) return;
      try {
        const capability = await client.dialogueCapabilities(companyId, signal);
        if (!signal.aborted && epoch.current === e) update({ capability });
      } catch {}
    }, 30000);
    return () => {
      keepDraft();
      epoch.current++;
      lifetime.current.abort();
      contextReads.current.abort();
      clearInterval(turnsTimer);
      clearInterval(capTimer);
    };
  }, [companyId, client]);
  useEffect(() => {
    normalize();
  }, [language]);
  async function send() {
    const s = ref.current,
      generating = s.turns.some((t) =>
        ["accepted", "running"].includes(t.state),
      );
    if (!dialogueCanSend({ ...s, can_send: s.capability.can_send, generating }))
      return;
    const effective = languageRef.current,
      message = s.message.trim(),
      oldDraft = dialogueDraftKey(s, bound());
    let ctx = { ...s };
    update({ busy: true, error: "" });
    try {
      if (!ctx.cid) {
        const conversation = await client.createConversation(
          companyId,
          conversationRequest(ctx, bound()),
        );
        if (!current(ctx)) return;
        update({
          cid: conversation.id,
          generation: ref.current.generation + 1,
          conversation,
          report: null,
        });
        ctx = { ...ref.current };
        save(activeKey(), ctx.cid);
        save(dialogueDraftKey(ctx, conversation.report), message);
        remove(oldDraft);
      }
      const body = { message, language: effective },
        action = "dialogue-" + ctx.cid,
        key = requestKey(sessionStorage, companyId, action, body);
      const turn = await client.sendTurn(companyId, ctx.cid, body, key);
      if (!current(ctx)) return;
      forgetKey(sessionStorage, companyId, action, body);
      update({
        turns: [...ref.current.turns.filter((t) => t.id !== turn.id), turn],
        message: "",
      });
      keepDraft();
      await loadList();
    } catch (error) {
      if (current(ctx))
        update({ error: dialogueError(apiErrorMessage(error)) });
    } finally {
      if (current(ctx)) update({ busy: false });
    }
  }
  return {
    ...state,
    selectMode(kind: Selection["kind"]) {
      if (ref.current.busy || ref.current.kind === kind) return;
      switchContext({ kind });
      normalize();
    },
    selectPersona(persona: string) {
      if (
        ref.current.busy ||
        !availablePersonas(ref.current.personas, languageRef.current).some(
          (p) => p.id === persona,
        )
      )
        return;
      switchContext({ persona, kind: "single" });
    },
    openPersona(persona: string) {
      if (
        ref.current.busy ||
        !availablePersonas(ref.current.personas, languageRef.current).some(
          (p) => p.id === persona,
        )
      )
        return;
      switchContext({ persona, kind: "single" }, null);
    },
    toggleParticipant(id: string, checked: boolean) {
      if (ref.current.busy || ref.current.cid) return;
      const participants = selectParticipants(
        ref.current.participants,
        ref.current.personas,
        id,
        checked,
        !!ref.current.cid,
      );
      switchContext({ participants });
    },
    openConversation,
    newConversation() {
      if (ref.current.busy) return;
      switchContext({}, null);
      normalize();
    },
    openReport(report: ReportBinding) {
      if (ref.current.busy) return;
      switchContext({ kind: "single" }, report);
      normalize();
    },
    setMessage(message: string) {
      update({ message });
      keepDraft();
    },
    send,
    loadMore: () => loadList(true),
  };
}
export type ResearchDialogueState = ReturnType<typeof useResearchDialogue>;
