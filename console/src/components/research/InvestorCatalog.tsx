import { useState } from "react";
import { catalogForLanguage } from "../../lib/research/catalog";
import type { ResearchLanguage } from "../../lib/research/types";
import { Section, inputClass, type Copy } from "./shared";
export function InvestorCatalog({
  language,
  tr,
  onSelect,
}: {
  language: ResearchLanguage;
  tr: Copy;
  onSelect: (id: string) => void;
}) {
  const [selected, setSelected] = useState("all"),
    catalog = catalogForLanguage(language),
    filter = catalog.some((g) => g.id === selected) ? selected : "all",
    visible = catalog.filter((g) => filter === "all" || g.id === filter);
  return (
    <Section
      id="investors"
      title={tr("流派与人物")}
      description={
        language === "en"
          ? "Explore UZI investment approaches and research profiles. Chat-enabled profiles open a conversation; other profiles are used for research review."
          : "浏览 UZI 的投资思路与评审角色。可对话人物可直接进入讨论，其余角色用于研究评审。"
      }
      action={
        <span className="text-xs text-primary" role="status">
          {language === "en"
            ? `${visible.length} schools · ${visible.reduce((n, g) => n + g.members.length, 0)} profiles`
            : `${visible.length} 个流派 · ${visible.reduce((n, g) => n + g.members.length, 0)} 个角色`}
        </span>
      }
    >
      <label className="flex max-w-sm items-center gap-3 px-5 py-4 text-sm text-body">
        {tr("筛选流派")}
        <select
          className={inputClass}
          value={filter}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="all">{tr("全部流派")}</option>
          {catalog.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <div className="divide-y divide-border-solid">
        {visible.map((g) => (
          <section
            key={g.id}
            className="grid gap-4 px-5 py-5 lg:grid-cols-[210px_minmax(0,1fr)]"
          >
            <div>
              <h3 className="text-lg text-heading">{g.name}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                {g.description}
              </p>
            </div>
            <ul className="flex flex-wrap items-start gap-2">
              {g.members.map((p) => (
                <li key={p.id}>
                  {p.canChat ? (
                    <button
                      className="rounded-md border border-primary/30 bg-primary-muted px-3 py-2 text-start hover:border-primary"
                      onClick={() => onSelect(p.id)}
                    >
                      <strong className="block text-sm font-medium text-primary">
                        {p.name}
                      </strong>
                      <small className="mt-1 block text-muted">
                        {language === "en" ? "Chat available" : "可对话"}
                      </small>
                    </button>
                  ) : (
                    <div className="rounded-md border border-border-solid px-3 py-2">
                      <strong className="block text-sm font-medium text-body">
                        {p.name}
                      </strong>
                      <small className="mt-1 block text-muted">
                        {language === "en"
                          ? "Research review only"
                          : "仅研究评审"}
                      </small>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="border-t border-border-solid px-5 py-4 text-xs text-muted">
        {language === "en"
          ? "Named people and groups represent simulated research perspectives, not the views of the individuals or organizations."
          : "人物和群体名称用于模拟研究视角，不代表本人或相关机构的观点。"}
      </p>
    </Section>
  );
}
