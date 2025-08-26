import React from 'react';

interface DiffViewerProps {
  diff: string;
  originalText?: string;
  isLoading?: boolean;
}

interface ParsedDiff {
  additions: string[];
  removals: string[];
  context: string[];
  summary: string;
}

const parseDiff = (diff: string): ParsedDiff => {
  const lines = diff.split('\n');
  const additions: string[] = [];
  const removals: string[] = [];
  const context: string[] = [];
  
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions.push(line.substring(1).trim());
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removals.push(line.substring(1).trim());
    } else if (line.startsWith(' ')) {
      context.push(line.substring(1).trim());
    }
  }

  // Generate a user-friendly summary
  let summary = '';
  if (additions.length > 0 && removals.length === 0) {
    summary = `Adding ${additions.length} new instruction${additions.length > 1 ? 's' : ''}`;
  } else if (removals.length > 0 && additions.length === 0) {
    summary = `Removing ${removals.length} instruction${removals.length > 1 ? 's' : ''}`;
  } else if (additions.length > 0 && removals.length > 0) {
    summary = `Updating ${removals.length} instruction${removals.length > 1 ? 's' : ''} and adding ${additions.length} new one${additions.length > 1 ? 's' : ''}`;
  } else {
    summary = 'Making formatting adjustments';
  }

  return { additions, removals, context, summary };
};

export const DiffViewer: React.FC<DiffViewerProps> = ({ diff, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
      </div>
    );
  }

  const parsed = parseDiff(diff);

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Proposed Changes Summary
            </h4>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              {parsed.summary}
            </p>
          </div>
        </div>
      </div>

      {/* Changes Preview */}
      <div className="space-y-3">
        {/* Additions */}
        {parsed.additions.length > 0 && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-3">
              <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="text-sm font-medium text-green-900 dark:text-green-100">
                Will Add ({parsed.additions.length})
              </span>
            </div>
            <div className="space-y-2">
              {parsed.additions.map((addition, idx) => (
                <div key={idx} className="text-sm text-green-800 dark:text-green-200 bg-green-100 dark:bg-green-900/40 rounded px-3 py-2 font-mono">
                  + {addition}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Removals */}
        {parsed.removals.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-3">
              <svg className="h-4 w-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
              <span className="text-sm font-medium text-red-900 dark:text-red-100">
                Will Remove ({parsed.removals.length})
              </span>
            </div>
            <div className="space-y-2">
              {parsed.removals.map((removal, idx) => (
                <div key={idx} className="text-sm text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/40 rounded px-3 py-2 font-mono line-through">
                  - {removal}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Technical Details (Collapsible) */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center space-x-2">
          <svg className="h-4 w-4 transform group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>Show technical diff details</span>
        </summary>
        <div className="mt-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
          <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
            {diff}
          </pre>
        </div>
      </details>
    </div>
  );
};

export default DiffViewer;
