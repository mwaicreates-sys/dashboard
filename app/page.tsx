import { AnnualHeader } from "@/components/AnnualHeader";
import { VisualizationGrid } from "@/components/VisualizationGrid";
import { InformationGrid } from "@/components/InformationGrid";

export default function Home() {
  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1400px] rounded border border-border bg-white p-3 md:p-4 shadow-sm">
        <AnnualHeader />
        <div className="mt-3 h-px bg-border" />
        <div className="mt-3">
          <VisualizationGrid />
        </div>
        <div className="mt-3 h-px bg-border" />
        <div className="mt-3">
          <InformationGrid />
        </div>
      </div>
    </main>
  );
}
