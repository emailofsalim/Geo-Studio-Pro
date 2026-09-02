import React from 'react';

/**
 * Shown in place of a tool that writes into a project, when none is open.
 *
 * `updateActiveProjectData` returns without doing anything when there is no
 * active project. The tools that write through it kept their own local state,
 * so a waypoint saved with no project open appeared in the list, counted in the
 * header, and was gone on reload — nothing failed, and nothing said so.
 *
 * The dashboard already refused to render for the same reason. This is that
 * panel, extracted so the tools share one implementation rather than four
 * copies that can drift.
 *
 * Tools that only compute — the coordinate converter, the survey calculator —
 * are deliberately not gated. They write nothing, so they lose nothing.
 */
export const NoProjectOpen: React.FC<{
  /** What this particular tool would be doing with a project. */
  explanation: string;
  onGoToProjects: () => void;
}> = ({ explanation, onGoToProjects }) => (
  <div className="max-w-lg mx-auto mt-16 text-center space-y-3">
    <h2 className="text-lg font-semibold">No project is open</h2>
    <p className="text-sm opacity-70">{explanation}</p>
    <button
      onClick={onGoToProjects}
      className="px-4 py-2 rounded-xl bg-[#c9a063] text-black text-xs font-bold uppercase tracking-wider"
    >
      Go to My Projects
    </button>
  </div>
);
