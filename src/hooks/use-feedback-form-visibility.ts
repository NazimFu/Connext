import { useEffect, useState } from 'react';
import { canShowFeedbackForm, getTokenReplenishState, type TokenCycle } from '@/lib/token-cycle';

interface UseFeedbackFormVisibilityProps {
  tokenCycle: TokenCycle | null | undefined;
  timezone?: string;
}

interface FeedbackFormState {
  canShow: boolean;
  replenishState: ReturnType<typeof getTokenReplenishState>;
  message: string;
  isLoading: boolean;
}

/**
 * Hook to check if feedback form should be visible and get replenishment state.
 * Updates every minute to account for time-based visibility changes.
 */
export const useFeedbackFormVisibility = ({
  tokenCycle,
  timezone = 'UTC',
}: UseFeedbackFormVisibilityProps): FeedbackFormState => {
  const [state, setState] = useState<FeedbackFormState>({
    canShow: false,
    replenishState: { status: 'not_pending', message: 'No pending token cycle' },
    message: '',
    isLoading: true,
  });

  useEffect(() => {
    const updateState = () => {
      const now = new Date();
      const canShow = canShowFeedbackForm(tokenCycle, timezone, now);
      const replenishState = getTokenReplenishState(tokenCycle, timezone, now);

      setState({
        canShow,
        replenishState,
        message: replenishState.message,
        isLoading: false,
      });
    };

    updateState();

    // Update every minute to handle time-based visibility
    const interval = setInterval(updateState, 60 * 1000);

    return () => clearInterval(interval);
  }, [tokenCycle, timezone]);

  return state;
};
