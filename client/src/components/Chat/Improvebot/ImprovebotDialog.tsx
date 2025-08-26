import React, { useState } from 'react';
import { OGDialog, DialogTemplate, Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';

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
  const [approver, setApprover] = useState('');
  const [why, setWhy] = useState('');
  const [impact, setImpact] = useState('');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleApprove = async () => {
    const success = await onApprove(
      approver || 'LibreChat User',
      why || 'User-approved system improvement',
      impact || 'Enhanced system capabilities'
    );
    
    if (success) {
      onClose();
      // Reset form
      setApprover('');
      setWhy('');
      setImpact('');
    }
  };

  const handleCancel = () => {
    onClose();
    // Reset form
    setApprover('');
    setWhy('');
    setImpact('');
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

  return (
    <OGDialog open={isOpen} onOpenChange={handleCancel}>
      <DialogTemplate
        title="🤖 Review System Prompt Improvement"
        className="w-11/12 max-w-4xl sm:w-3/4 md:w-5/6 lg:w-4/5"
        showCloseButton={true}
        showCancelButton={false}
        main={
          <div className="max-h-[60vh] overflow-y-auto space-y-4">
            <div>
              <label className="text-sm font-medium text-text-primary">
                Proposed Changes (Unified Diff)
              </label>
              <pre className="mt-2 p-4 bg-surface-secondary rounded-md text-xs overflow-x-auto whitespace-pre-wrap border border-border-light">
                {diff}
              </pre>
            </div>
            
            {userQuestion && assistantResponse && (
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded border">
                <div className="text-sm font-medium text-text-primary mb-2">Original Conversation:</div>
                <div className="text-xs space-y-1">
                  <div><span className="font-medium">Q:</span> {userQuestion}</div>
                  <div><span className="font-medium">A:</span> {assistantResponse}</div>
                </div>
                {onTestImprovement && (
                  <div className="mt-3">
                    <button
                      onClick={handleTestImprovement}
                      disabled={isTesting}
                      className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isTesting ? (
                        <>
                          <Spinner className="mr-1 h-3 w-3" />
                          Testing...
                        </>
                      ) : (
                        '🧪 Test Improved Response'
                      )}
                    </button>
                  </div>
                )}
                {testResponse && (
                  <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                    <div className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">Improved Response:</div>
                    <div className="text-xs text-green-700 dark:text-green-300 whitespace-pre-wrap">{testResponse}</div>
                  </div>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label htmlFor="approver" className="text-sm font-medium text-text-primary">
                  Approver Name (optional)
                </label>
                <textarea
                  id="approver"
                  placeholder="Your name..."
                  value={approver}
                  onChange={(e) => setApprover(e.target.value)}
                  className="mt-1 w-full rounded border border-border-light bg-surface-primary p-2 text-text-primary"
                  rows={1}
                />
              </div>
              
              <div>
                <label htmlFor="why" className="text-sm font-medium text-text-primary">
                  Why is this improvement needed? (optional)
                </label>
                <textarea
                  id="why"
                  placeholder="Describe the reasoning behind this change..."
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  className="mt-1 w-full rounded border border-border-light bg-surface-primary p-2 text-text-primary"
                  rows={2}
                />
              </div>
              
              <div>
                <label htmlFor="impact" className="text-sm font-medium text-text-primary">
                  Expected Impact (optional)
                </label>
                <textarea
                  id="impact"
                  placeholder="What improvements will this bring..."
                  value={impact}
                  onChange={(e) => setImpact(e.target.value)}
                  className="mt-1 w-full rounded border border-border-light bg-surface-primary p-2 text-text-primary"
                  rows={2}
                />
              </div>
            </div>
          </div>
        }
        buttons={
          <>
            <button
              onClick={handleCancel}
              disabled={isApplying}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm text-text-primary hover:bg-surface-active"
            >
              {localize('com_ui_cancel')}
            </button>
            <button
              onClick={handleApprove}
              disabled={isApplying}
              className="inline-flex h-10 min-w-[100px] items-center justify-center rounded-lg border border-border-heavy bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 focus:bg-green-700 disabled:opacity-50"
            >
              {isApplying ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Applying...
                </>
              ) : (
                'Apply Changes'
              )}
            </button>
          </>
        }
      />
    </OGDialog>
  );
};

export default ImprovebotDialog;
