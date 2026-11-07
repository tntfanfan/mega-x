export type ResearchPage = "macro" | "announcements" | "new" | "tasks" | "reports" | "schools" | "dialogue" | "roundtable";
export const researchPages: { id: ResearchPage; label: string; description: string; path: string }[] = [
  { id: "new", label: "新建研究", description: "输入股票代码，开始一次新的研究。", path: "" },
  { id: "macro", label: "宏观数据", description: "采集和查看申万指数、股东户数与市场分布。", path: "macro" },
  { id: "announcements", label: "公告分析", description: "监测关注股票的新公告，查看共享分析结果。", path: "announcements" },
  { id: "tasks", label: "研究任务", description: "跟踪执行阶段，查看结果，继续或重试研究。", path: "tasks" },
  { id: "reports", label: "研究报告", description: "查看、预览和下载已交付的研究报告。", path: "reports" },
  { id: "schools", label: "投资流派", description: "浏览投资流派与人物，选择一个研究视角。", path: "schools" },
  { id: "dialogue", label: "人物对话", description: "与投资人物讨论问题，或围绕研究报告继续追问。", path: "dialogue" },
  { id: "roundtable", label: "投资圆桌", description: "邀请多位投资人物，比较不同视角。", path: "roundtable" },
];
export function researchPageFromPath(path?: string): ResearchPage {
  return researchPages.find(page => page.path === path || page.id === path)?.id || "new";
}

export type ResearchSection = "stock" | "announcements" | "macro";
export const researchSections: { id: ResearchSection; label: string; page: ResearchPage }[] = [
  { id: "stock", label: "个股分析", page: "new" },
  { id: "announcements", label: "公告分析", page: "announcements" },
  { id: "macro", label: "宏观数据", page: "macro" },
];
export function researchSectionForPage(page: ResearchPage): ResearchSection {
  return page === "macro" || page === "announcements" ? page : "stock";
}
export const stockResearchPages = researchPages.filter(page => researchSectionForPage(page.id) === "stock");
