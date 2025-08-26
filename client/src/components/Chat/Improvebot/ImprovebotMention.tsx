import React, { useState } from 'react';
import { Spinner } from '@librechat/client';
import { useImprovebot } from '~/hooks/Chat/useImprovebot';
import ImprovebotDialog from './ImprovebotDialog';

interface ImprovebotMentionProps {
  improvementRequest: string;
  conversationContext?: {
    user_question?: string;
    assistant_response?: string;
    conversation_id?: string;
    message_id?: string;
  };
  onComplete?: () => void;
}

export const ImprovebotMention: React.FC<ImprovebotMentionProps> = ({
  improvementRequest,
  conversationContext,
  onComplete,
}) => {
  const [showDialog, setShowDialog] = useState(false);
  const [proposedDiff, setProposedDiff] = useState<string | null>(null);
  
  const {
    isProposing,
    isApplying,
    proposeImprovement,
    applyImprovement,
    reAnswerQuestion,
  } = useImprovebot();

  const handleProposeImprovement = async () => {
    const diff = await proposeImprovement(improvementRequest, conversationContext);
    if (diff) {
      setProposedDiff(diff);
      setShowDialog(true);
    }
  };

  const handleApproveImprovement = async (approver: string, why: string, impact: string) => {
    if (!proposedDiff) return false;
    
    const success = await applyImprovement(proposedDiff, approver, why, impact);
    if (success) {
      setProposedDiff(null);
      setShowDialog(false);
      onComplete?.();
    }
    return success;
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setProposedDiff(null);
  };

  return (
    <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      {conversationContext?.user_question && conversationContext?.assistant_response && (
        <div className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded border-l-4 border-yellow-400">
          <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">📝 Conversation Context:</div>
          <div className="space-y-1">
            <div><span className="font-medium">Q:</span> {conversationContext.user_question}</div>
            <div><span className="font-medium">A:</span> {conversationContext.assistant_response}</div>
          </div>
        </div>
      )}
      
      <div className="flex items-center space-x-2">
        <span className="text-sm text-blue-800 dark:text-blue-200">
          🤖 Improvebot: "{improvementRequest}"
        </span>
        
        <button
          onClick={handleProposeImprovement}
          disabled={isProposing || isApplying}
          className="inline-flex items-center rounded-md border border-border-light bg-surface-secondary px-2 py-1 text-xs text-text-primary hover:bg-surface-active disabled:opacity-50"
        >
          {isProposing ? (
            <>
              <Spinner className="mr-1 h-3 w-3" />
              Generating...
            </>
          ) : (
            'Generate Proposal'
          )}
        </button>
      </div>

      {proposedDiff && (
        <ImprovebotDialog
          isOpen={showDialog}
          onClose={handleCloseDialog}
          diff={proposedDiff}
          onApprove={handleApproveImprovement}
          isApplying={isApplying}
          userQuestion={conversationContext?.user_question}
          assistantResponse={conversationContext?.assistant_response}
          onTestImprovement={conversationContext?.user_question ? reAnswerQuestion : undefined}
        />
      )}
    </div>
  );
};

export default ImprovebotMention;
