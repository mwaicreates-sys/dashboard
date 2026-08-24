"use client";

import Link from "next/link";
import { useDashboardData } from "@/lib/dashboardData";

export function Checklist({
  title,
  items,
  titleHref,
}: {
  title: string;
  items: Array<{ id: string; text: string; done: boolean }>;
  /** Optional destination for the section title. Used on cards whose
   *  bodies contain interactive checkboxes, where wrapping the whole
   *  card in a link would create nested interactive elements. */
  titleHref?: string;
}) {
  const { toggleTodo } = useDashboardData();

  const heading = (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-secondary-text">
      {title}
    </h3>
  );

  return (
    <div>
      {titleHref ? (
        <Link
          href={titleHref}
          aria-label={`${title} — view details`}
          className="group mb-1.5 inline-block rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-blue"
        >
          <span className="block text-xs font-semibold uppercase tracking-wider text-secondary-text group-hover:text-primary-text">
            {title}
          </span>
        </Link>
      ) : (
        <div className="mb-1.5">{heading}</div>
      )}
      <div className="space-y-1">
        {items.map((item) => (
          <label
            key={item.id}
            className="flex items-start gap-2 cursor-pointer group"
          >
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => toggleTodo(item.id)}
              className="mt-0.5 h-3 w-3 rounded border-border text-orange focus:ring-orange"
            />
            <span
              className={`text-[10px] leading-tight ${
                item.done
                  ? "text-muted-text line-through"
                  : "text-primary-text"
              }`}
            >
              {item.text}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function TodoList() {
  const { todos } = useDashboardData();
  return (
    <Checklist title="To Do" items={todos} titleHref="/goals" />
  );
}

export function GoalsList() {
  const { goals } = useDashboardData();
  const goalItems = goals.map((g) => ({ id: g.id, text: g.name, done: g.currentAmount >= g.targetAmount }));
  return (
    <Checklist title="Goals" items={goalItems} titleHref="/goals" />
  );
}
