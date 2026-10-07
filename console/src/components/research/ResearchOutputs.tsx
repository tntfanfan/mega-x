import type { ResearchFile } from "../../lib/research/types";
import type { ResearchClient } from "../../lib/research/client";
import { Section, buttonClass, type Copy } from "./shared";
export function OutputRows({
  files,
  companyId,
  client,
  onPreview,
  tr,
}: {
  files: ResearchFile[];
  companyId: string;
  client: ResearchClient;
  onPreview: (path: string) => void;
  tr: Copy;
}) {
  return (
    <ul className="divide-y divide-border-solid">
      {files.map((file) => (
        <li
          key={file.path}
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm text-heading break-words">{file.name}</p>
            <p className="mt-1 text-xs text-muted break-all font-mono">
              {file.path} · {Math.ceil((file.size || 0) / 1024)} KB
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className={buttonClass}
              onClick={() => onPreview(file.path)}
            >
              {tr("预览")}
            </button>
            <a
              className={buttonClass}
              href={client.downloadUrl(companyId, file.path)}
              target="_blank"
              rel="noopener"
            >
              {tr("下载")}
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
export function ResearchOutputs({
  files,
  companyId,
  client,
  onPreview,
  tr,
  hasMore,
  onMore,
}: {
  files: ResearchFile[];
  companyId: string;
  client: ResearchClient;
  onPreview: (path: string) => void;
  tr: Copy;
  hasMore: boolean;
  onMore: () => void;
}) {
  return (
    <Section
      id="deliverables"
      title={tr("研究成果")}
      description={tr(
        "查看当前公司的已归档文件，包含历史版本；可继续加载更早成果。",
      )}
    >
      {files.length ? (
        <OutputRows {...{ files, companyId, client, onPreview, tr }} />
      ) : (
        <p className="p-5 text-sm text-muted">
          {tr("报告完成后会显示在这里。失败任务不会生成虚假报告。")}
        </p>
      )}
      {hasMore && (
        <div className="p-5">
          <button className={buttonClass} onClick={onMore}>
            {tr("加载更多成果")}
          </button>
        </div>
      )}
    </Section>
  );
}
