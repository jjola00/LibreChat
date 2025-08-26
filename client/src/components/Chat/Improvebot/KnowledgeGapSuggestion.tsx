import React, { useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { ImprovebotMention } from './ImprovebotMention';

interface KnowledgeGapSuggestionProps {
  userQuestion: string;
  assistantResponse: string;
  conversationId?: string;
  messageId?: string;
  onDismiss?: () => void;
}

export const KnowledgeGapSuggestion: React.FC<KnowledgeGapSuggestionProps> = ({
  userQuestion,
  assistantResponse,
  conversationId,
  messageId,
  onDismiss,
}) => {
  const [showImprovebot, setShowImprovebot] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) {
    return null;
  }

  const handleShowImprovebot = () => {
    setShowImprovebot(true);
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  const improvementRequest = `The assistant indicated a knowledge gap for this question. Please provide the correct information or guidance.`;

  const conversationContext = {
    user_question: userQuestion,
    assistant_response: assistantResponse,
    conversation_id: conversationId,
    message_id: messageId,
  };

  if (showImprovebot) {
    return (
      <ImprovebotMention
        improvementRequest={improvementRequest}
        conversationContext={conversationContext}
        onComplete={() => {
          setShowImprovebot(false);
          setIsDismissed(true);
        }}
      />
    );
  }

  return (
    <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-2 flex-1">
          <Lightbulb className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
              💡 Knowledge Gap Detected
            </div>
            <div className="text-yellow-700 dark:text-yellow-300 mb-2">
              The assistant seems unsure about this question. Would you like to help improve its knowledge?
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleShowImprovebot}
                className="inline-flex items-center rounded-md bg-yellow-600 px-2 py-1 text-xs text-white hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              >
                🤖 Improve with Improvebot
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-yellow-500 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default KnowledgeGapSuggestion;
