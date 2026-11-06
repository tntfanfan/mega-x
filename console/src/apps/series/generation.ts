import type { ChatRef, ReferenceFile } from "./api";
export const PURPOSE_LABEL: Record<string, string> = { character: "角色外形", environment: "环境", prop: "道具", style: "画风", action: "动作", timing: "镜头时间", text: "提示词文字", drive_audio: "驱动音频（音轨）", reference_audio: "参考音频（音色）" };
export type Layout = { id: string; label: string; views: string[]; framing: string; aspect: string };
const three: Layout = { id: "three-view", label: "三视图", views: ["正面", "侧面", "背面"], framing: "完整主体", aspect: "16:9" };
const four: Layout = { id: "four-view", label: "四视图", views: ["脸部特写", "正面全身", "侧面全身", "背面全身"], framing: "脸部与完整全身", aspect: "16:9" };
const custom: Layout = { id: "custom", label: "自定义", views: [], framing: "按补充说明", aspect: "16:9" };
export const LAYOUTS: Record<string, Layout[]> = {
  character: [three, four, { id: "face-closeup", label: "脸部特写", views: ["正面脸部"], framing: "五官与发型", aspect: "3:4" }, { id: "half-body", label: "半身", views: ["正面半身"], framing: "腰部以上", aspect: "3:4" }, { id: "full-body", label: "全身", views: ["正面全身"], framing: "头脚完整", aspect: "2:3" }, { id: "expressions", label: "表情组", views: ["平静", "微笑", "愤怒", "惊讶"], framing: "同一人物面部", aspect: "1:1" }, custom],
  location: [{ id: "main", label: "主视图", views: ["主要空间视角"], framing: "空间主体", aspect: "16:9" }, { id: "panorama", label: "全景", views: ["完整空间全景"], framing: "全景", aspect: "21:9" }, { id: "turnaround", label: "四向环视", views: ["前方", "右方", "后方", "左方"], framing: "同一空间四向", aspect: "16:9" }, { id: "detail", label: "局部细节", views: ["重点区域细节"], framing: "局部", aspect: "4:3" }, custom],
  prop: [{ id: "single", label: "单视图", views: ["主要视角"], framing: "完整道具", aspect: "1:1" }, three, { ...four, views: ["正面", "右侧", "背面", "左侧"], framing: "完整道具" }, { id: "detail", label: "细节特写", views: ["材质与构造细节"], framing: "局部", aspect: "1:1" }, custom],
};
export function selectedRef(file: ReferenceFile): ChatRef {
  const purpose = file.mime?.startsWith("text/") ? "text" : file.mime?.startsWith("audio/") ? (file.purpose === "reference_audio" ? "reference_audio" : "drive_audio") : file.purpose || "style";
  return { ref: file.ref, file: file.file, project_id: file.project_id, label: file.label, purpose, asset_binding: file.asset_binding };
}
export function inputIssue(file: ReferenceFile, imagesOnly = false): string {
  if (!file.available) return "此版本已弃用或文件缺失";
  if (imagesOnly && !file.mime?.startsWith("image/")) return "这里需要图片参考";
  if (file.mime === "application/pdf") return "请先把 PDF 整理为可核对的文字";
  if (file.mime === "application/zip") return "请先解压 ZIP，再上传需要参与生成的素材";
  return "";
}
