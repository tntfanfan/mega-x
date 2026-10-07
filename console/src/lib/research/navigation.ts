export type ResearchPage = "new" | "tasks" | "reports" | "schools" | "dialogue" | "roundtable";
export const researchPages: { id: ResearchPage; label: string; description: string; path: string }[] = [
  { id: "new", label: "新建研究", description: "输入股票代码，开始一次新的研究。", path: "" },
  { id: "tasks", label: "研究任务", description: "跟踪执行阶段，查看结果，继续或重试研究。", path: "tasks" },
  { id: "reports", label: "研究报告", description: "查看、预览和下载已交付的研究报告。", path: "reports" },
  { id: "schools", label: "投资流派", description: "浏览投资流派与人物，选择一个研究视角。", path: "schools" },
  { id: "dialogue", label: "人物对话", description: "与投资人物讨论问题，或围绕研究报告继续追问。", path: "dialogue" },
  { id: "roundtable", label: "投资圆桌", description: "邀请多位投资人物，比较不同视角。", path: "roundtable" },
];
export function researchPageFromPath(path?: string): ResearchPage {
  return researchPages.find(page => page.path === path || page.id === path)?.id || "new";
}
