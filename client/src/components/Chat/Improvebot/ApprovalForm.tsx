import React, { useState } from 'react';

interface ApprovalFormProps {
  onApprove: (data: {
    approver: string;
    why: string;
    impact: string;
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ApprovalForm: React.FC<ApprovalFormProps> = ({
  onApprove,
  onCancel,
  isLoading = false
}) => {
  const [approver, setApprover] = useState('');
  const [why, setWhy] = useState('User-approved improvement to system prompt');
  const [impact, setImpact] = useState('Better responses and clearer guidance');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!approver.trim()) return;
    
    onApprove({
      approver: approver.trim(),
      why: why.trim(),
      impact: impact.trim()
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Approve System Changes
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Review and approve the proposed improvements to the AI system
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Approver Name */}
        <div>
          <label htmlFor="approver" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Your Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="approver"
            value={approver}
            onChange={(e) => setApprover(e.target.value)}
            placeholder="e.g., John Smith, Product Manager"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
            required
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            This will be logged in the change history
          </p>
        </div>

        {/* Why field */}
        <div>
          <label htmlFor="why" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Reason for Change
          </label>
          <textarea
            id="why"
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
            disabled={isLoading}
          />
        </div>

        {/* Expected Impact */}
        <div>
          <label htmlFor="impact" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Expected Impact
          </label>
          <textarea
            id="impact"
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            rows={2}
            placeholder="How will this improve the AI's responses?"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
            disabled={isLoading}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3 pt-4">
          <button
            type="submit"
            disabled={!approver.trim() || isLoading}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Applying Changes...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Apply Changes</span>
              </>
            )}
          </button>
          
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-200 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <svg className="flex-shrink-0 h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm">
            <p className="text-blue-900 dark:text-blue-100 font-medium">
              What happens when you apply changes?
            </p>
            <ul className="mt-1 text-blue-700 dark:text-blue-300 space-y-1">
              <li>• The AI system prompt will be updated</li>
              <li>• Changes will be logged with your approval details</li>
              <li>• Future AI responses will reflect these improvements</li>
              <li>• Changes can be reverted if needed</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApprovalForm;
