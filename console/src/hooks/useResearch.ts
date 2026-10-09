import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../lib/api";
import {
  createRequestGate,
  forgetKey,
  requestKey,
  researchErrors,
  shouldPoll,
} from "../lib/research/core";
import type { ResearchClient } from "../lib/research/client";
import type {
  Department,
  Operation,
  ResearchTask,
  ResearchFile,
  ResearchRequest,
  ResearchLanguage,
} from "../lib/research/types";
const initial = () => ({
  department: null as Department | null,
  tasks: [] as ResearchTask[],
  outputs: [] as ResearchFile[],
  operation: null as Operation | null,
  detail: null as ResearchTask | null,
  detailFiles: [] as ResearchFile[],
  selected: "",
  loading: true,
  busy: false,
  error: "",
  syncError: "",
  notice: "",
  syncedAt: "",
  limit: 200,
});
export function useResearch(
  companyId: string,
  language: ResearchLanguage,
  client: ResearchClient,
) {
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const gate = useRef(createRequestGate()).current;
  const controller = useRef(new AbortController()),
    inFlight = useRef<number | null>(null),
    selection = useRef("");
  const current = (token: number, signal: AbortSignal) =>
    gate.current(token) && !signal.aborted;
  const readDetail = useCallback(
    async (tid: string) => {
      const token = gate.capture(),
        signal = controller.current.signal;
      const [detail, files] = await Promise.all([
        client.task(companyId, tid, signal),
        client.outputs(companyId, stateRef.current.limit, tid, signal),
      ]);
      if (current(token, signal) && selection.current === tid)
        setState((s) => ({ ...s, detail, detailFiles: files.items || [] }));
    },
    [companyId, client, gate],
  );
  const refresh = useCallback(async () => {
    const token = gate.capture(),
      signal = controller.current.signal;
    if (inFlight.current === token || gate.busy() || signal.aborted) return;
    inFlight.current = token;
    try {
      const [department, tasks, files] = await Promise.all([
        client.department(companyId, signal),
        client.tasks(companyId, signal),
        client.outputs(companyId, stateRef.current.limit, undefined, signal),
      ]);
      const operation = await client.operation(department.operation_id, signal);
      if (!current(token, signal)) return;
      const rows = (tasks.items || []).sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at)),
      );
      const tid = selection.current;
      if (tid && !rows.some((t) => t.id === tid)) {
        selection.current = "";
        setState((s) => ({
          ...s,
          selected: "",
          detail: null,
          detailFiles: [],
        }));
      }
      setState((s) => ({
        ...s,
        department,
        tasks: rows,
        outputs: files.items || [],
        operation,
        loading: false,
        syncedAt: new Date().toISOString(),
        syncError: "",
      }));
      if (selection.current) await readDetail(selection.current);
    } catch (error) {
      if (current(token, signal))
        setState((s) => ({
          ...s,
          syncError: apiErrorMessage(error),
          loading: false,
        }));
    } finally {
      if (inFlight.current === token) inFlight.current = null;
    }
  }, [companyId, client, gate, readDetail]);
  useEffect(() => {
    gate.invalidate();
    controller.current.abort();
    controller.current = new AbortController();
    inFlight.current = null;
    selection.current = "";
    setState(initial());
    void refresh();
    const timer = setInterval(() => {
      if (shouldPoll(document.hidden, controller.current.signal.aborted))
        void refresh();
    }, 5000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      gate.invalidate();
      controller.current.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, gate]);
  const mutate = async (
    action: () => Promise<void>,
    notice = "操作已提交，状态将在执行服务处理后更新。",
  ) => {
    const token = gate.beginMutation();
    if (token === null) return false;
    let succeeded = false;
    setState((s) => ({ ...s, busy: true, error: "", notice: "" }));
    try {
      await action();
      succeeded = true;
      if (gate.current(token)) setState((s) => ({ ...s, notice }));
    } catch (error) {
      if (gate.current(token)) {
        const message = apiErrorMessage(error);
        setState((s) => ({
          ...s,
          error:
            researchErrors[message as keyof typeof researchErrors] || message,
        }));
      }
    } finally {
      if (gate.endMutation(token)) {
        setState((s) => ({ ...s, busy: false }));
        await refresh();
      }
    }
    return succeeded && gate.current(token) && !controller.current.signal.aborted;
  };
  return {
    ...state,
    refresh,
    async selectTask(id: string) {
      selection.current = id;
      setState((s) => ({ ...s, selected: id, detail: null, detailFiles: [] }));
      try {
        await readDetail(id);
      } catch (error) {
        if (selection.current === id && !controller.current.signal.aborted)
          setState((s) => ({ ...s, error: apiErrorMessage(error) }));
      }
    },
    loadMore() {
      setState((s) => ({ ...s, limit: s.limit + 200 }));
      stateRef.current = {
        ...stateRef.current,
        limit: stateRef.current.limit + 200,
      };
      void refresh();
    },
    install: () =>
      mutate(async () => {
        await client.install(companyId);
      }, "安装请求已提交，请等待安装状态更新。"),
    restart: () =>
      mutate(async () => {
        await client.restart(companyId);
      }, "已请求重新启动公司。"),
    submit: (request: ResearchRequest) =>
      mutate(async () => {
        const token = gate.capture(),
          body = { ...request, language };
        const key = requestKey(sessionStorage, companyId, "submit", body);
        const result = await client.submit(companyId, body, key);
        forgetKey(sessionStorage, companyId, "submit", body);
        if (gate.current(token) && !controller.current.signal.aborted) {
          selection.current = result.task_id;
          setState((s) => ({ ...s, selected: result.task_id }));
        }
      }, "研究已提交，可以在执行详情中查看进度。"),
    retry: () =>
      mutate(async () => {
        const tid = selection.current,
          body = { task_id: tid },
          key = requestKey(sessionStorage, companyId, "retry", body);
        await client.retry(companyId, tid, key);
        forgetKey(sessionStorage, companyId, "retry", body);
      }),
    resume: () =>
      mutate(async () => {
        await client.resume(
          companyId,
          selection.current,
          stateRef.current.detail.run.id,
        );
      }),
    cancel: () =>
      mutate(async () => {
        await client.cancel(
          companyId,
          selection.current,
          stateRef.current.detail.run.id,
        );
      }),
  };
}
export type ResearchState = ReturnType<typeof useResearch>;
