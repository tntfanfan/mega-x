import { useState } from "react";
import type { ProjectStatus, SeriesApi, Version } from "../api";
import { PURPOSE_LABEL } from "../generation";
import { fieldClass, primaryClass } from "./GenerationDialog";
import { UploadButton, UploadProgress, useUploads } from "./Uploads";

export function ReferenceDetails({ api, projectId, version, status, onChanged }: { api: SeriesApi; projectId: string; version: Version; status: ProjectStatus | null; onChanged: () => void }) {
  const meta = version.metadata || {};
  const [purpose, setPurpose] = useState(String(meta.purpose || "style"));
  const binding = meta.asset_binding as { asset_kind?: string; slug?: string; variant?: string } | null;
  const [asset, setAsset] = useState(binding ? `${binding.asset_kind}:${binding.slug}` : "");
  const [name, setName] = useState(String(meta.name || meta.original_filename || ""));
  const [description, setDescription] = useState((version.body || "").replace(/^## 素材说明\s*/, "").trim());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const uploads = useUploads(api, projectId, () => { onChanged(); setMessage("替换文件已保存为新版本，旧文件仍可回看。"); });
  const profiles = status?.items.filter(i => i.kind === "profile") || [];
  const selected = profiles.find(i => `${i.scope.asset_kind}:${i.scope.slug}` === asset);
  const nextBinding = selected ? { asset_kind: selected.scope.asset_kind, slug: selected.scope.slug, variant: binding?.variant || "base" } : null;
  const save = async () => {
    setSaving(true); setMessage("");
    try {
      let fields = version.fields || "";
      for (const [key, value] of Object.entries({ name, purpose, asset_binding: nextBinding })) {
        const line = `${key}: ${JSON.stringify(value)}`;
        fields = new RegExp(`^${key}:.*$`, "m").test(fields) ? fields.replace(new RegExp(`^${key}:.*$`, "m"), () => line) : `${fields}\n${line}`;
      }
      await api.edit(projectId, { ref: version.ref, fields, body: `## 素材说明\n${description || "用户上传素材。"}\n` });
      onChanged(); setMessage("说明已保存为新版本。");
    } catch (e) { setMessage(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  };
  return <details className="mx-auto mb-4 max-w-3xl rounded-xl border border-border-solid p-3"><summary className="cursor-pointer text-sm text-heading">素材说明与用途</summary><div className="mt-3 space-y-3">
    <p className="text-xs text-muted">{String(meta.original_filename || "")} · {(Number(meta.size || 0) / 1048576).toFixed(2)} MB</p>
    <label className="block text-xs text-muted">显示名称<input value={name} onChange={e => setName(e.target.value)} className={fieldClass} /></label>
    <div className="grid grid-cols-2 gap-3"><label className="text-xs text-muted">用途<select value={purpose} onChange={e => setPurpose(e.target.value)} className={fieldClass}>{Object.entries(PURPOSE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="text-xs text-muted">关联角色或资产<select value={asset} onChange={e => setAsset(e.target.value)} className={fieldClass}><option value="">不关联</option>{profiles.map(i => <option key={i.logical} value={`${i.scope.asset_kind}:${i.scope.slug}`}>{String(i.metadata?.name || i.label)}</option>)}</select></label></div>
    <label className="block text-xs text-muted">说明<textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} className={fieldClass} /></label>
    <div className="flex flex-wrap items-center justify-between gap-2"><UploadButton queue={uploads} label="替换原文件" metadata={{ material_id: String(meta.material_id), purpose, asset_binding: JSON.stringify(nextBinding), name, description }} /><button type="button" disabled={saving || !name.trim()} onClick={() => void save()} className={primaryClass}>{saving ? "保存中…" : "保存说明"}</button></div>
    <p className="text-[11px] text-dim">替换文件和修改说明都会保留旧版本，已提交的生成仍使用原版本。</p><UploadProgress queue={uploads} />{message && <p role="status" className="text-xs text-primary">{message}</p>}
  </div></details>;
}
