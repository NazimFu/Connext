"use client";

import { useTutorial, type TutorialStep } from "@/hooks/use-tutorial";

const TOOLTIP_WIDTH = 320;
const TOOLTIP_MARGIN = 16;
const SPOTLIGHT_PADDING = 8;
const TOOLTIP_ESTIMATED_HEIGHT = 190;

type Spotlight = { top: number; left: number; width: number; height: number };

// Explicit per-step placement, rather than one auto-below/above-only rule —
// a single generic rule ends up covering small/off-center targets (a card
// in a grid, a form field beside other content) when there isn't clean room
// directly above or below them.
function computeTooltipPosition(step: TutorialStep, spotlight: Spotlight) {
  const gap = step.placementGap ?? TOOLTIP_MARGIN;
  const { top: sTop, left: sLeft, width: sWidth, height: sHeight } = spotlight;

  let top: number;
  let left: number;

  switch (step.placement) {
    case "right":
      left = sLeft + sWidth + gap;
      top = sTop + sHeight / 2 - TOOLTIP_ESTIMATED_HEIGHT / 2;
      break;
    case "left":
      left = sLeft - TOOLTIP_WIDTH - gap;
      top = sTop + sHeight / 2 - TOOLTIP_ESTIMATED_HEIGHT / 2;
      break;
    case "top":
      left = sLeft + sWidth / 2 - TOOLTIP_WIDTH / 2;
      top = sTop - TOOLTIP_ESTIMATED_HEIGHT - gap;
      break;
    case "top-right":
      left = sLeft + sWidth + gap;
      top = sTop - TOOLTIP_ESTIMATED_HEIGHT - gap;
      break;
    case "bottom":
      left = sLeft + sWidth / 2 - TOOLTIP_WIDTH / 2;
      top = sTop + sHeight + gap;
      break;
    default: {
      // No explicit placement — prefer below, fall back to above if there's
      // no room, same as before.
      const preferBelow = sTop + sHeight + TOOLTIP_ESTIMATED_HEIGHT + gap < window.innerHeight;
      left = sLeft + sWidth / 2 - TOOLTIP_WIDTH / 2;
      top = preferBelow ? sTop + sHeight + gap : sTop - TOOLTIP_ESTIMATED_HEIGHT - gap;
    }
  }

  left = Math.max(TOOLTIP_MARGIN, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN));
  top = Math.max(TOOLTIP_MARGIN, Math.min(top, window.innerHeight - TOOLTIP_ESTIMATED_HEIGHT - TOOLTIP_MARGIN));

  return { top, left };
}

// Big centered title card for the intro step — no real element to spotlight
// yet, just "here's what we're about to walk through."
function WelcomeCard({
  step,
  next,
  end,
}: {
  step: TutorialStep;
  next: () => void;
  end: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999990, pointerEvents: "auto" }}>
      <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.72)" }} />
      <div
        role="dialog"
        aria-label={step.title}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(420px, calc(100vw - 32px))",
          zIndex: 999991,
        }}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-8 text-center"
      >
        <h2 className="text-2xl font-bold text-gray-900 mb-3">{step.title}</h2>
        <p className="text-sm text-gray-600 mb-6">{step.description}</p>
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={next}
            className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-6 py-2.5 rounded-lg shadow-sm transition-colors w-full"
          >
            Get started
          </button>
          <button
            type="button"
            onClick={end}
            className="text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Skip tutorial
          </button>
        </div>
      </div>
    </div>
  );
}

export function TutorialOverlay() {
  const { isActive, step, stepIndex, totalSteps, targetRect, next, end } = useTutorial();

  if (!isActive || !step) return null;

  if (!step.targetSelector) {
    return <WelcomeCard step={step} next={next} end={end} />;
  }

  if (!targetRect || typeof window === "undefined") return null;

  const spotlight: Spotlight = {
    top: targetRect.top - SPOTLIGHT_PADDING,
    left: targetRect.left - SPOTLIGHT_PADDING,
    width: targetRect.width + SPOTLIGHT_PADDING * 2,
    height: targetRect.height + SPOTLIGHT_PADDING * 2,
  };

  const { top: tooltipTop, left: tooltipLeft } = computeTooltipPosition(step, spotlight);

  const isLastStep = stepIndex + 1 >= totalSteps;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999990, pointerEvents: "auto" }}>
      {/* Dark overlay with a bright cutout around the target — the "spotlight". */}
      <div
        style={{
          position: "fixed",
          top: spotlight.top,
          left: spotlight.left,
          width: spotlight.width,
          height: spotlight.height,
          borderRadius: 14,
          boxShadow:
            "0 0 0 3px #F5C518, 0 0 24px 4px rgba(245,197,24,0.55), 0 0 0 9999px rgba(10,10,10,0.72)",
          transition: "top 0.35s ease, left 0.35s ease, width 0.35s ease, height 0.35s ease",
          pointerEvents: "none",
        }}
      />

      <div
        role="dialog"
        aria-label={step.title}
        style={{
          position: "fixed",
          top: tooltipTop,
          left: tooltipLeft,
          width: TOOLTIP_WIDTH,
          zIndex: 999991,
        }}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-5"
      >
        <div className="text-xs font-semibold text-amber-600 mb-1">
          {/* Intro occupies index 0, so index N is the Nth real step. */}
          Step {stepIndex} of {totalSteps - 1}
        </div>
        <h3 className="text-base font-bold text-gray-900 mb-1.5">{step.title}</h3>
        <p className="text-sm text-gray-600 mb-4">{step.description}</p>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={end}
            className="text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Skip tutorial
          </button>
          <button
            type="button"
            onClick={next}
            className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
          >
            {isLastStep ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
