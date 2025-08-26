import React, { useState } from 'react';
import { OGDialog, DialogTemplate, Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';
import DiffViewer from './DiffViewer';
import ApprovalForm from './ApprovalForm';

interface ImprovebotDialogProps {
  isOpen: boolean;
  onClose: () => void;
  diff: string;
  onApprove: (approver: string, why: string, impact: string) => Promise<boolean>;
  isApplying: boolean;
  userQuestion?: string;
  assistantResponse?: string;
  onTestImprovement?: (question: string) => Promise<string | null>;
}

export const ImprovebotDialog: React.FC<ImprovebotDialogProps> = ({
  isOpen,
  onClose,
  diff,
  onApprove,
  isApplying,
  userQuestion,
  assistantResponse,
  onTestImprovement,
}) => {
  const localize = useLocalize();
  const [currentStep, setCurrentStep] = useState<'review' | 'approve'>('review');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleApprove = async (data: { approver: string; why: string; impact: string }) => {
    const success = await onApprove(data.approver, data.why, data.impact);
    
    if (success) {
      onClose();
      setCurrentStep('review');
      setTestResponse(null);
    }
  };

  const handleCancel = () => {
    onClose();
    setCurrentStep('review');
    setTestResponse(null);
  };

  const handleTestImprovement = async () => {
    if (!userQuestion || !onTestImprovement) return;
    
    setIsTesting(true);
    try {
      const response = await onTestImprovement(userQuestion);
      setTestResponse(response);
    } finally {
      setIsTesting(false);
    }
  };

  const proceedToApproval = () => {
    setCurrentStep('approve');
  };

  const backToReview = () => {
    setCurrentStep('review');
  };

  return (
    <OGDialog open={isOpen} onOpenChange={handleCancel}>
      <DialogTemplate
        title={
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                🤖 System Improvement Review
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {currentStep === 'review' ? 'Review proposed changes' : 'Approve and apply changes'}
              </p>
            </div>
          </div>
        }
        className="w-11/12 max-w-5xl sm:w-3/4 md:w-5/6 lg:w-4/5"
        showCloseButton={true}
        showCancelButton={false}
        main={
          <div className="max-h-[70vh] overflow-y-auto">
            {currentStep === 'review' ? (
              <div className="space-y-6">
                {/* Original Conversation Context */}
                {userQuestion && assistantResponse && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <svg className="flex-shrink-0 h-5 w-5 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.955 8.955 0 01-4.126-.98L3 20l1.02-5.874A8.955 8.955 0 013 12a8 8 0 018-8c4.418 0 8 3.582 8 8z" />
                      </svg>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                          Original Conversation
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="bg-white dark:bg-gray-800 rounded p-3 border border-yellow-200 dark:border-yellow-700">
                            <div className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">👤 User Question:</div>
                            <div className="text-gray-700 dark:text-gray-300">{userQuestion}</div>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded p-3 border border-yellow-200 dark:border-yellow-700">
                            <div className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">🤖 AI Response:</div>
                            <div className="text-gray-700 dark:text-gray-300">{assistantResponse}</div>
                          </div>
                        </div>
                        
                        {onTestImprovement && (
                          <div className="mt-4">
                            <button
                              onClick={handleTestImprovement}
                              disabled={isTesting}
                              className="inline-flex items-center space-x-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              {isTesting ? (
                                <>
                                  <Spinner className="h-4 w-4" />
                                  <span>Testing improved response...</span>
                                </>
                              ) : (
                                <>
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.781 0-2.674-2.153-1.415-3.414l5-5A2 2 0 009 9.172V5L8 4z" />
                                  </svg>
                                  <span>🧪 Test Improved Response</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                        
                        {testResponse && (
                          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                            <div className="flex items-center space-x-2 mb-2">
                              <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-sm font-medium text-green-900 dark:text-green-100">Improved Response Preview:</span>
                            </div>
                            <div className="text-sm text-green-800 dark:text-green-200 bg-green-100 dark:bg-green-900/40 rounded p-3">
                              {testResponse}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Diff Viewer */}
                <DiffViewer diff={diff} />

                {/* Action Buttons for Review Step */}
                <div className="flex justify-between pt-4">
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={proceedToApproval}
                    className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
                  >
                    <span>Proceed to Approval</span>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Back Button */}
                <button
                  onClick={backToReview}
                  className="inline-flex items-center space-x-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                  </svg>
                  <span>Back to Review</span>
                </button>

                {/* Approval Form */}
                <ApprovalForm
                  onApprove={handleApprove}
                  onCancel={handleCancel}
                  isLoading={isApplying}
                />
              </div>
            )}
          </div>
        }
        buttons={<></>} // No default buttons, using custom ones in main content
      />
    </OGDialog>
  );
};

export default ImprovebotDialog;