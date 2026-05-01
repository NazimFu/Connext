import { useEffect, useState } from 'react';
import { getTokenReplenishState, type TokenCycle } from '@/lib/token-cycle';

interface UseTokenCycleStateProps {
  tokenCycle: TokenCycle | null | undefined;
  timezone?: string;
  userId?: string;
}

interface TokenCycleState {
  status: 'not_pending' | 'waiting_for_feedback' | 'waiting_for_cooldown' | 'ready_to_replenish';
  message: string;
  daysRemaining?: number;
  minutesRemaining?: number;
  isLoading: boolean;
  isReplenishing: boolean;
  replenishError?: string;
  canManuallyReplenish: boolean;
  triggerReplenishment: () => Promise<void>;
}

/**
 * Hook to track token cycle replenishment state and trigger manual replenishment.
 * Updates every minute to handle time-based changes.
 * Automatically checks eligibility on mount and after feedback submission.
 */
export const useTokenCycleState = ({
  tokenCycle,
  timezone = 'UTC',
  userId,
}: UseTokenCycleStateProps): TokenCycleState => {
  const [state, setState] = useState<TokenCycleState>({
    status: 'not_pending',
    message: 'No pending token cycle',
    isLoading: true,
    isReplenishing: false,
    canManuallyReplenish: false,
    replenishError: undefined,
    triggerReplenishment: async () => {},
  });

  const updateState = () => {
    const now = new Date();
    const replenishState = getTokenReplenishState(tokenCycle, timezone, now);
    const canManuallyReplenish = replenishState.status === 'ready_to_replenish';

    setState(prevState => ({
      ...prevState,
      status: replenishState.status,
      message: replenishState.message,
      daysRemaining: replenishState.daysRemaining,
      minutesRemaining: replenishState.minutesRemaining,
      canManuallyReplenish,
      isLoading: false,
    }));
  };

  const triggerReplenishment = async () => {
    if (!userId || !state.canManuallyReplenish) return;

    setState(prevState => ({ ...prevState, isReplenishing: true, replenishError: undefined }));

    try {
      const response = await fetch('/api/token-cycle/replenish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to replenish token');
      }

      // Clear state and refetch (parent component should handle refetch)
      setState(prevState => ({
        ...prevState,
        isReplenishing: false,
        status: 'not_pending',
        message: 'Token replenished! Check your notices to schedule your next meeting.',
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      setState(prevState => ({
        ...prevState,
        isReplenishing: false,
        replenishError: errorMsg,
      }));
    }
  };

  useEffect(() => {
    updateState();

    // Update every minute to handle time-based changes
    const interval = setInterval(updateState, 60 * 1000);

    return () => clearInterval(interval);
  }, [tokenCycle, timezone]);

  return {
    ...state,
    triggerReplenishment,
  };
};
