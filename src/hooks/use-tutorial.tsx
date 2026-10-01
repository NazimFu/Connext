"use client";

// First-time walkthrough for mentees AND mentors (mentors can browse other
// mentors and book sessions the same way mentees do). Spotlights real
// elements on the real pages as the user navigates (browse mentors -> pick
// one -> schedule -> tokens), rather than a static mockup screen. See
// TutorialOverlay for the rendering side; this file owns step config,
// navigation, and target-locating.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export type TutorialRole = "mentee" | "mentor";

export type TutorialStep = {
  id: string;
  title: string;
  description: string;
  /** Navigate here first if the user isn't already on this route. */
  path?: string;
  /**
   * CSS selector for the element this step highlights. Omit for an
   * intro-style step with no real page target — it renders as a centered
   * card with no spotlight instead of waiting to locate anything.
   */
  targetSelector?: string;
  /**
   * On "Next", read `data-tutorial-href` off the current target and
   * navigate there before advancing — used for "pick a mentor", where the
   * next page's URL depends on which mentor is actually being shown.
   */
  dynamicHrefFromTarget?: boolean;
  /**
   * scrollIntoView block alignment for this step's target. Defaults to
   * "center" — override to "start" for tall elements (like the mentor
   * grid), where centering scrolls well past the top of the list.
   */
  scrollBlock?: ScrollLogicalPosition;
  /**
   * Instantly pin the page's scroll position to this Y value (px) instead
   * of scrollIntoView-ing the target — for a step whose target sits at the
   * start of the page's main content, where scrollIntoView can still land
   * short of the actual top (e.g. behind a sticky header). 0 = very top.
   * Pinned instantly (not animated) and before the target even loads, so
   * there's no visible scroll from wherever the previous page left off.
   */
  pinScrollTop?: number;
  /**
   * Fires a `tutorial:open-sidebar` event before searching for the target —
   * for steps whose target lives inside the off-canvas sidebar (e.g. the
   * token counter), which is translated off-screen until opened.
   */
  openSidebar?: boolean;
  /**
   * Where the tooltip sits relative to the spotlight. Defaults to "bottom"
   * (falling back to "top" if there's no room below) — set explicitly for
   * targets where that auto behavior ends up covering the target itself.
   */
  placement?: "top" | "bottom" | "left" | "right" | "top-right";
  /** Extra gap (px) between the spotlight and the tooltip. Defaults to 16. */
  placementGap?: number;
};

// Mentee and mentor mirror each other exactly (/mentee/mentor-listing vs.
// /mentor/mentor-listing, same page shapes) — only the first step's route
// differs, since every later step either has no fixed path (search whatever
// page is current) or gets its destination from the clicked card itself.
function buildTutorialSteps(role: TutorialRole): TutorialStep[] {
  return [
    {
      id: "welcome",
      title: "Welcome to Connext!",
      description: "Here's a quick tutorial to show you how to find a mentor and book your first session.",
    },
    {
      id: "browse-mentors",
      title: "Browse mentors",
      description: "This is every mentor on Connext. Scroll through to see who's available.",
      path: `/${role}/mentor-listing`,
      targetSelector: '[data-tutorial="browse-mentors"]',
      scrollBlock: "start",
      pinScrollTop: 0,
    },
    {
      id: "filter-mentors",
      title: "Filter your search",
      description: "Narrow the list down by institution, favorites, or mentors you've requested before.",
      targetSelector: '[data-tutorial="filter-mentors"]',
    },
    {
      id: "select-mentor",
      title: "Pick a mentor",
      description: "Click any mentor's card to view their full profile.",
      targetSelector: '[data-tutorial="select-mentor"]',
      dynamicHrefFromTarget: true,
      placement: "right",
    },
    {
      id: "choose-time",
      title: "Choose a date and time",
      description: "Pick an available slot — you can only request between 1 week and 1 month from today.",
      targetSelector: '[data-tutorial="choose-time"]',
      placement: "left",
      pinScrollTop: 95, // ~2.5cm down from the very top
    },
    {
      id: "write-message",
      title: "Write a message",
      description: "Introduce yourself and let your mentor know what you'd like to talk about.",
      targetSelector: '[data-tutorial="write-message"]',
    },
    {
      id: "submit-request",
      title: "Send your request",
      description: "Once you submit, wait for your mentor to accept — you'll get a Zoom link and an email once they do.",
      targetSelector: '[data-tutorial="submit-request"]',
      placement: "top",
      placementGap: 28,
    },
    {
      id: "token-info",
      title: "Your token",
      description: "Booking a meeting uses your 1 token. After you attend and submit feedback, it resets after a cooldown period so you can book again.",
      targetSelector: '[data-tutorial="token-info"]',
      openSidebar: true,
      placement: "top-right",
    },
  ];
}

const LOCATE_RETRY_MS = 200;
const LOCATE_MAX_ATTEMPTS = 25; // ~5s

type TutorialContextType = {
  isActive: boolean;
  stepIndex: number;
  step: TutorialStep | null;
  totalSteps: number;
  targetRect: DOMRect | null;
  start: () => void;
  next: () => void;
  end: () => void;
};

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const hasAutoTriggeredRef = useRef(false);

  const steps = useMemo(
    () => buildTutorialSteps(user?.role === "mentor" ? "mentor" : "mentee"),
    [user?.role]
  );

  const step = isActive ? steps[stepIndex] ?? null : null;

  const markSeen = useCallback(async () => {
    if (!user?.id) return;
    try {
      await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hasSeenTutorial: true }),
      });
      await refreshUser();
    } catch (error) {
      console.error("[tutorial] Failed to save completion:", error);
    }
  }, [user?.id, refreshUser]);

  const end = useCallback(() => {
    setIsActive(false);
    setStepIndex(0);
    setTargetRect(null);
    markSeen();
    // Whether finished or skipped, land back at a clean starting point
    // rather than wherever the tour happened to leave them (e.g. mid-form
    // on a mentor's detail page with the sidebar open).
    const role = user?.role === "mentor" ? "mentor" : "mentee";
    router.push(`/${role}/mentor-listing`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [markSeen, user?.role, router]);

  const start = useCallback(() => {
    setTargetRect(null);
    setStepIndex(0);
    setIsActive(true);
  }, []);

  const next = useCallback(() => {
    if (!isActive) return;
    const current = steps[stepIndex];
    if (!current) return;

    if (current.dynamicHrefFromTarget && current.targetSelector) {
      const el = document.querySelector(current.targetSelector) as HTMLElement | null;
      const href = el?.getAttribute("data-tutorial-href");
      if (href) router.push(href);
    }

    if (stepIndex + 1 >= steps.length) {
      end();
    } else {
      setTargetRect(null);
      setStepIndex(stepIndex + 1);
    }
  }, [isActive, stepIndex, steps, router, end]);

  // Auto-start once per session for a newly-approved mentee/mentor who
  // hasn't seen it — both roles can browse mentors and book sessions.
  //
  // Only fires once they're already inside their own account area. A
  // Firebase session persists across visits, so `user` can be populated
  // while someone is just browsing the public homepage or another page
  // entirely — without this check, the tour would force-navigate them
  // into /mentee|mentor/mentor-listing out of nowhere.
  useEffect(() => {
    if (hasAutoTriggeredRef.current) return;
    if (!user) return;
    if (user.role !== "mentee" && user.role !== "mentor") return;
    if (user.verificationStatus !== "approved") return;
    if (user.hasSeenTutorial) return;
    if (!pathname.startsWith(`/${user.role}/`)) return;
    hasAutoTriggeredRef.current = true;
    start();
  }, [user, pathname, start]);

  // Navigate to (if needed) and locate the current step's target element.
  useEffect(() => {
    if (!isActive || !step) return;

    if (step.path && pathname !== step.path) {
      router.push(step.path);
      return;
    }

    const targetSelector = step.targetSelector;
    if (!targetSelector) {
      // Intro-style step with no real page target — nothing to locate, the
      // overlay renders a centered card for it immediately.
      setTargetRect(null);
      return;
    }

    if (step.pinScrollTop !== undefined) {
      // Pin instantly, before the target even loads, instead of waiting for
      // it and then animating there — otherwise the page sits wherever the
      // previous page left off (often scrolled down) for however long the
      // data takes to load, then visibly jumps into place all at once,
      // which reads as "scrolling up from the bottom."
      window.scrollTo({ top: step.pinScrollTop, behavior: "auto" });
    }

    let cancelled = false;
    let attempts = 0;
    let settleTimer: number | undefined;
    let cleanupScroll: () => void = () => {};

    // Reveal (and keep re-revealing) the spotlight only once scrolling has
    // actually stopped — rather than on a guessed fixed delay, and rather
    // than tracking every single scroll frame. Scrolling resets this timer
    // on every event; it fires once things have been still for SETTLE_MS.
    // The scroll listener stays attached for the whole step (not just the
    // first locate), so scrolling manually later in this same step still
    // re-settles the spotlight onto the target's real position instead of
    // leaving it stuck wherever it first appeared.
    const SETTLE_MS = 150;
    const armSettleTimer = (el: HTMLElement) => {
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        if (!cancelled) setTargetRect(el.getBoundingClientRect());
      }, SETTLE_MS);
    };

    const tryLocate = () => {
      if (cancelled) return;
      const el = document.querySelector(targetSelector) as HTMLElement | null;
      if (el) {
        const onScroll = () => armSettleTimer(el);
        window.addEventListener("scroll", onScroll, true);
        cleanupScroll = () => window.removeEventListener("scroll", onScroll, true);
        armSettleTimer(el);

        // pinScrollTop already happened above, before the target even
        // loaded — nothing more to do here for that case.
        if (step.pinScrollTop === undefined) {
          el.scrollIntoView({ behavior: "smooth", block: step.scrollBlock ?? "center" });
        }
        return;
      }
      attempts += 1;
      if (attempts >= LOCATE_MAX_ATTEMPTS) {
        // Target never showed up (e.g. empty state) — don't hang forever.
        if (cancelled) return;
        if (stepIndex + 1 >= steps.length) end();
        else setStepIndex(stepIndex + 1);
        return;
      }
      window.setTimeout(tryLocate, LOCATE_RETRY_MS);
    };

    if (step.openSidebar) {
      // Give the sidebar's slide-in transition (300ms) time to finish
      // before measuring, so the spotlight doesn't land on a mid-animation
      // rect — otherwise it'd need to correct itself a frame later.
      window.dispatchEvent(new CustomEvent("tutorial:open-sidebar"));
      window.setTimeout(() => {
        if (!cancelled) tryLocate();
      }, 350);
    } else {
      tryLocate();
    }

    return () => {
      cancelled = true;
      if (settleTimer) window.clearTimeout(settleTimer);
      cleanupScroll();
    };
  }, [isActive, step, stepIndex, steps, pathname, router, end]);

  // Keep the spotlight aligned on window resize. Scroll is deliberately NOT
  // tracked here — the locate effect above already settles the spotlight
  // once scrolling stops; continuously re-measuring on every scroll event
  // (including during our own scrollIntoView animation) fights the
  // spotlight's CSS transition and makes it visibly judder.
  useEffect(() => {
    if (!isActive || !step || !step.targetSelector) return;
    const selector = step.targetSelector;
    const update = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) setTargetRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isActive, step]);

  return (
    <TutorialContext.Provider
      value={{
        isActive,
        stepIndex,
        step,
        totalSteps: steps.length,
        targetRect,
        start,
        next,
        end,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used within a TutorialProvider");
  return ctx;
}
