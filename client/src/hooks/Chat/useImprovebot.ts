import { useState, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import { useAuthContext } from '~/hooks/AuthContext';
import store from '~/store';

interface ImprovebotRequest {
  improvement_request: string;
  conversation_context?: {
    user_question?: string;
    assistant_response?: string;
    conversation_id?: string;
    message_id?: string;
  };
}

interface ImprovebotResponse {
  success: boolean;
  diff?: string;
  message?: string;
  error?: string;
  details?: string;
}

interface ApplyDiffRequest {
  diff: string;
  approver?: string;
  why?: string;
  impact?: string;
}

export const useImprovebot = () => {
  const [isProposing, setIsProposing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [currentDiff, setCurrentDiff] = useState<string | null>(null);
  const user = useRecoilValue(store.user);
  const { token } = useAuthContext();
  const { showToast } = useToastContext();

  const proposeImprovement = useCallback(async (
    improvementRequest: string,
    conversationContext?: {
      user_question?: string;
      assistant_response?: string;
      conversation_id?: string;
      message_id?: string;
    }
  ): Promise<string | null> => {
    if (!improvementRequest.trim()) {
      showToast({ message: 'Improvement request cannot be empty', status: 'error' });
      return null;
    }

    setIsProposing(true);
    try {
      const response = await fetch('/api/improvebot/propose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          improvement_request: improvementRequest.trim(),
          conversation_context: conversationContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ImprovebotResponse = await response.json();

      if (data.success && data.diff) {
        setCurrentDiff(data.diff);
        showToast({ message: 'Improvement proposal generated successfully', status: 'success' });
        return data.diff;
      } else {
        showToast({ message: data.error || 'Failed to generate improvement proposal', status: 'error' });
        return null;
      }
    } catch (error: any) {
      console.error('Error proposing improvement:', error);
      const errorMessage = error.message || 'Failed to propose improvement';
      showToast({ message: errorMessage, status: 'error' });
      return null;
    } finally {
      setIsProposing(false);
    }
  }, [token, showToast]);

  const applyImprovement = useCallback(async (
    diff: string,
    approver?: string,
    why?: string,
    impact?: string
  ): Promise<boolean> => {
    if (!diff.trim()) {
      showToast({ message: 'No diff to apply', status: 'error' });
      return false;
    }

    setIsApplying(true);
    try {
      const response = await fetch('/api/improvebot/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          diff: diff.trim(),
          approver: approver || user?.name || 'LibreChat User',
          why: why || 'User-approved improvement',
          impact: impact || 'Enhanced system capabilities',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: ImprovebotResponse = await response.json();

      if (data.success) {
        setCurrentDiff(null);
        showToast({ message: 'Improvement applied successfully', status: 'success' });
        return true;
      } else {
        showToast({ message: data.error || 'Failed to apply improvement', status: 'error' });
        return false;
      }
    } catch (error: any) {
      console.error('Error applying improvement:', error);
      const errorMessage = error.message || 'Failed to apply improvement';
      showToast({ message: errorMessage, status: 'error' });
      return false;
    } finally {
      setIsApplying(false);
    }
  }, [token, user?.name, showToast]);

  const getSystemPrompt = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/improvebot/prompt', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: { success: boolean; content: string; error?: string } = await response.json();
      
      if (data.success && data.content) {
        return data.content;
      } else {
        showToast({ message: data.error || 'Failed to get system prompt', status: 'error' });
        return null;
      }
    } catch (error: any) {
      console.error('Error getting system prompt:', error);
      const errorMessage = error.message || 'Failed to get system prompt';
      showToast({ message: errorMessage, status: 'error' });
      return null;
    }
  }, [token, showToast]);

  const getChangelog = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/improvebot/changelog', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: { success: boolean; content: string; error?: string } = await response.json();
      
      if (data.success && data.content) {
        return data.content;
      } else {
        showToast({ message: data.error || 'Failed to get changelog', status: 'error' });
        return null;
      }
    } catch (error: any) {
      console.error('Error getting changelog:', error);
      const errorMessage = error.message || 'Failed to get changelog';
      showToast({ message: errorMessage, status: 'error' });
      return null;
    }
  }, [token, showToast]);

  const detectKnowledgeGap = useCallback((text: string): boolean => {
    const gapIndicators = [
      /i don't know/i,
      /beyond my knowledge/i,
      /i'm not sure/i,
      /i don't have information/i,
      /i can't help with that/i,
      /i'm unable to assist/i,
      /i don't understand/i,
      /this is outside my expertise/i,
      /i'm not familiar/i,
      /i lack the knowledge/i,
    ];
    
    return gapIndicators.some(pattern => pattern.test(text));
  }, []);

  const suggestImprovement = useCallback((
    userQuestion: string,
    assistantResponse: string,
    conversationId?: string,
    messageId?: string
  ): string => {
    return `Based on the conversation:
Q: "${userQuestion}"
A: "${assistantResponse}"

The assistant indicated a knowledge gap. Please provide the correct information or guidance for this question.`;
  }, []);

  const reAnswerQuestion = useCallback(async (
    question: string,
    context?: any
  ): Promise<string | null> => {
    try {
      const response = await fetch('/api/improvebot/re-answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: question.trim(),
          context,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: { 
        success: boolean; 
        improved_response: string; 
        error?: string;
      } = await response.json();
      
      if (data.success && data.improved_response) {
        showToast({ message: 'Generated improved response', status: 'success' });
        return data.improved_response;
      } else {
        showToast({ message: data.error || 'Failed to generate improved response', status: 'error' });
        return null;
      }
    } catch (error: any) {
      console.error('Error re-answering question:', error);
      const errorMessage = error.message || 'Failed to re-answer question';
      showToast({ message: errorMessage, status: 'error' });
      return null;
    }
  }, [token, showToast]);

  return {
    isProposing,
    isApplying,
    currentDiff,
    proposeImprovement,
    applyImprovement,
    getSystemPrompt,
    getChangelog,
    setCurrentDiff,
    detectKnowledgeGap,
    suggestImprovement,
    reAnswerQuestion,
  };
};

export default useImprovebot;
